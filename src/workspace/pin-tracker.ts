import { type App, type EventRef, FileView, TFile, type WorkspaceLeaf } from 'obsidian';
import type { EventHost } from './host';
import type { LeafSnapshot } from './plan';

/**
 * R6 / R11 / R12 — one debounced scan of the whole workspace produces every
 * derived signal the rest of the plugin needs (DESIGN §3.3.3).
 *
 * Pin changes use the official `WorkspaceLeaf.on('pinned-change')` event, which
 * exists in the 1.14 API; `layout-change` is still required because it is the
 * only signal for leaves appearing or disappearing. Both funnel into the same
 * rescan, so the two paths can never disagree.
 */

export const SCAN_DEBOUNCE_MS = 100;

export interface WorkspaceSnapshot {
	leaves: LeafSnapshot[];
	revision: number;
}

export class PinTracker {
	readonly #app: App;
	readonly #listeners = new Set<(snapshot: WorkspaceSnapshot) => void>();

	readonly #windowIds = new WeakMap<Window, string>();
	readonly #paneIds = new WeakMap<object, string>();
	readonly #leafIds = new WeakMap<WorkspaceLeaf, string>();
	readonly #leafEvents = new Map<WorkspaceLeaf, EventRef>();
	#leafIndex = new Map<string, WorkspaceLeaf>();

	#snapshot: WorkspaceSnapshot = { leaves: [], revision: 0 };
	#signature = '';
	#revision = 0;
	#counter = 0;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#lastActiveEditorLeafId: string | null = null;

	constructor(app: App) {
		this.#app = app;
	}

	get snapshot(): WorkspaceSnapshot {
		return this.#snapshot;
	}

	get lastActiveEditorLeafId(): string | null {
		return this.#lastActiveEditorLeafId;
	}

	start(host: EventHost): void {
		const workspace = this.#app.workspace;
		host.registerEvent(workspace.on('layout-change', () => this.schedule()));
		host.registerEvent(workspace.on('active-leaf-change', () => this.schedule()));
		host.registerEvent(workspace.on('window-open', () => this.schedule()));
		host.registerEvent(workspace.on('window-close', () => this.schedule()));
		this.rescan();
	}

	schedule(delay = SCAN_DEBOUNCE_MS): void {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.rescan();
		}, delay);
	}

	onChange(listener: (snapshot: WorkspaceSnapshot) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	leafById(leafId: string): WorkspaceLeaf | null {
		return this.#leafIndex.get(leafId) ?? null;
	}

	/** Stable id for a `Window`, shared with the snapshots it produced. */
	windowIdOf(win: Window): string {
		return this.#idForWindow(win);
	}

	/** R5: is this path currently open in a pinned tab anywhere? */
	isPinned(path: string): boolean {
		return this.#snapshot.leaves.some(
			(leaf) => leaf.isVaultFile && leaf.pinned && leaf.path === path,
		);
	}

	/** R12: does the vault index know this path? */
	isVaultPath(path: string): boolean {
		return this.#app.vault.getAbstractFileByPath(path) instanceof TFile;
	}

	rescan(): void {
		const leaves: LeafSnapshot[] = [];
		const seen = new Set<WorkspaceLeaf>();
		const leafIndex = new Map<string, WorkspaceLeaf>();
		const activeLeaf = this.#app.workspace.activeLeaf;

		this.#app.workspace.iterateAllLeaves((leaf) => {
			seen.add(leaf);
			this.#attachPinEvent(leaf);
			const snapshot = this.#describe(leaf, activeLeaf);
			if (!snapshot) return;
			leaves.push(snapshot);
			leafIndex.set(snapshot.leafId, leaf);
			if (snapshot.active && snapshot.path !== null) {
				this.#lastActiveEditorLeafId = snapshot.leafId;
			}
		});

		for (const [leaf, ref] of this.#leafEvents) {
			if (seen.has(leaf)) continue;
			try {
				this.#app.workspace.offref(ref);
			} catch {
				// Leaf already gone; nothing to detach.
			}
			this.#leafEvents.delete(leaf);
		}

		this.#leafIndex = leafIndex;

		const signature = leaves
			.map(
				(leaf) =>
					`${leaf.leafId}|${leaf.path ?? ''}|${leaf.pinned ? 1 : 0}|${leaf.active ? 1 : 0}|${leaf.windowId}|${leaf.paneId}`,
			)
			.join(';');

		if (signature === this.#signature) return;

		this.#signature = signature;
		this.#revision += 1;
		this.#snapshot = { leaves, revision: this.#revision };
		for (const listener of this.#listeners) listener(this.#snapshot);
	}

	dispose(): void {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
		for (const ref of this.#leafEvents.values()) {
			try {
				this.#app.workspace.offref(ref);
			} catch {
				// ignore
			}
		}
		this.#leafEvents.clear();
		this.#listeners.clear();
	}

	// --------------------------------------------------------------- internals

	#attachPinEvent(leaf: WorkspaceLeaf): void {
		if (this.#leafEvents.has(leaf)) return;
		try {
			const ref = leaf.on('pinned-change', () => this.schedule(0));
			this.#leafEvents.set(leaf, ref);
		} catch {
			// Older builds without the event simply rely on layout-change.
		}
	}

	#describe(leaf: WorkspaceLeaf, activeLeaf: WorkspaceLeaf | null): LeafSnapshot | null {
		const view = leaf.view;
		if (!view) return null;

		const file = view instanceof FileView ? view.file : null;
		const path = file?.path ?? null;
		const isVaultFile =
			path !== null && this.#app.vault.getAbstractFileByPath(path) instanceof TFile;

		const win = view.containerEl?.ownerDocument?.defaultView ?? null;
		const windowId = win ? this.#idForWindow(win) : 'unknown';

		const leafId = this.#idForLeaf(leaf);
		const parent = leaf.parent;

		// `pinned` is a `ViewState` field, not a leaf field — `getViewState()` is
		// the public way to read it.
		const pinned = leaf.getViewState().pinned === true;

		return {
			leafId,
			path,
			isVaultFile,
			pinned,
			windowId,
			paneId: parent ? this.#idForPane(parent) : 'unknown',
			active: leaf === activeLeaf,
			inSidebar: isInSidebar(view.containerEl),
			isEmptyTab: view.getViewType() === 'empty',
		};
	}

	#idForWindow(win: Window): string {
		const existing = this.#windowIds.get(win);
		if (existing) return existing;
		const id = `w${++this.#counter}`;
		this.#windowIds.set(win, id);
		return id;
	}

	#idForPane(parent: object): string {
		const existing = this.#paneIds.get(parent);
		if (existing) return existing;
		const id = `p${++this.#counter}`;
		this.#paneIds.set(parent, id);
		return id;
	}

	#idForLeaf(leaf: WorkspaceLeaf): string {
		const existing = this.#leafIds.get(leaf);
		if (existing) return existing;
		const id = `l${++this.#counter}`;
		this.#leafIds.set(leaf, id);
		return id;
	}
}

/**
 * Sidebar leaves share the workspace model but not the tab bar. Detecting them
 * by container is a public-DOM check; if the class names ever change the answer
 * is `false`, which keeps the previous behaviour instead of breaking plans.
 */
function isInSidebar(el: HTMLElement | undefined): boolean {
	const split = el?.closest('.workspace-split');
	if (!split) return false;
	return split.classList.contains('mod-left-split') || split.classList.contains('mod-right-split');
}

import { type App, TFile, type WorkspaceLeaf } from 'obsidian';
import type { Group } from '../core/types';
import type { PinTracker } from './pin-tracker';
import {
	type ExpandMode,
	planCloseFile,
	planCloseOthers,
	planCollapse,
	planExpand,
	planOpenMember,
	planTidyAll,
} from './plan';

/**
 * The thin executor (D9): every rule already lives in `plan.ts`, this file only
 * carries the plan out through official workspace APIs.
 *
 * R11 — the window is captured at call time, so a plan is never applied to a
 * window the user switched to mid-flight.
 */

export interface ExpandOutcome {
	opened: number;
	closed: number;
	preservedPinned: number;
	skippedMissing: number;
}

export interface CollapseOutcome {
	closed: number;
	skippedPinned: number;
	notOpen: number;
}

export type OpenResult = 'focused' | 'opened' | 'failed';

function currentWindow(): Window {
	return typeof activeWindow !== 'undefined' ? activeWindow : window;
}

export class WorkspaceExecutor {
	readonly #app: App;
	readonly #tracker: PinTracker;

	constructor(app: App, tracker: PinTracker) {
		this.#app = app;
		this.#tracker = tracker;
	}

	currentWindowId(): string {
		return this.#tracker.windowIdOf(currentWindow());
	}

	async expand(group: Group, mode: ExpandMode): Promise<ExpandOutcome> {
		const windowId = this.currentWindowId();
		const target = this.#resolveTarget(windowId);
		if (!target) {
			return { opened: 0, closed: 0, preservedPinned: 0, skippedMissing: group.members.length };
		}

		const members: string[] = [];
		let skippedMissing = 0;
		for (const member of group.members) {
			if (this.#tracker.isVaultPath(member.path)) members.push(member.path);
			else skippedMissing += 1;
		}

		const plan = planExpand(
			mode,
			members,
			{ windowId, paneId: target.paneId },
			this.#tracker.snapshot.leaves,
		);

		// Make the target pane the active one *before* creating tabs, otherwise
		// `getLeaf('tab')` would append to whichever pane happens to be active.
		this.#focusAnchor(target.anchor);

		const opened: WorkspaceLeaf[] = [];
		for (const path of plan.openPaths) {
			const file = this.#app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				skippedMissing += 1;
				continue;
			}
			try {
				const leaf = this.#app.workspace.getLeaf('tab');
				await leaf.openFile(file, { active: false });
				opened.push(leaf);
			} catch {
				// One unreadable file must not abort the whole group.
			}
		}

		let closed = 0;
		for (const leafId of plan.closeLeafIds) {
			if (this.#detach(leafId)) closed += 1;
		}

		const first = opened[0];
		if (first) {
			this.#app.workspace.setActiveLeaf(first, { focus: true });
		}

		this.#tracker.rescan();
		return {
			opened: opened.length,
			closed,
			preservedPinned: plan.preservedPinned.length,
			skippedMissing,
		};
	}

	async collapse(members: string[]): Promise<CollapseOutcome> {
		const windowId = this.currentWindowId();
		const plan = planCollapse(members, windowId, this.#tracker.snapshot.leaves);

		let closed = 0;
		for (const leafId of plan.closeLeafIds) {
			if (this.#detach(leafId)) closed += 1;
		}

		this.#tracker.rescan();

		// D19: never leave a window with zero tabs.
		if (!this.#windowHasLeaves(windowId)) {
			this.#app.workspace.getLeaf('tab');
			this.#tracker.rescan();
		}

		return {
			closed,
			skippedPinned: plan.skippedPinnedPaths.length,
			notOpen: plan.notOpenPaths.length,
		};
	}

	async tidyAll(groups: Group[]): Promise<CollapseOutcome> {
		const windowId = this.currentWindowId();
		const plan = planTidyAll(groups, windowId, this.#tracker.snapshot.leaves);

		let closed = 0;
		for (const leafId of plan.closeLeafIds) {
			if (this.#detach(leafId)) closed += 1;
		}

		this.#tracker.rescan();

		if (!this.#windowHasLeaves(windowId)) {
			this.#app.workspace.getLeaf('tab');
			this.#tracker.rescan();
		}

		return { closed, skippedPinned: plan.skippedPinnedPaths.length, notOpen: 0 };
	}

	async closePaths(paths: string[]): Promise<number> {
		const windowId = this.currentWindowId();
		const leaves = this.#tracker.snapshot.leaves;
		const leafIds = paths.flatMap((path) => planCloseFile(path, windowId, leaves));

		let closed = 0;
		for (const leafId of leafIds) {
			if (this.#detach(leafId)) closed += 1;
		}
		this.#tracker.rescan();
		return closed;
	}

	async closeOthers(path: string): Promise<number> {
		const windowId = this.currentWindowId();
		const leafIds = planCloseOthers(path, windowId, this.#tracker.snapshot.leaves);

		let closed = 0;
		for (const leafId of leafIds) {
			if (this.#detach(leafId)) closed += 1;
		}
		this.#tracker.rescan();
		return closed;
	}

	/** F1 / F9 click semantics: focus when already open, otherwise open anew. */
	async openMember(path: string, options: { newTab?: boolean } = {}): Promise<OpenResult> {
		if (!options.newTab && (await this.focusPath(path))) return 'focused';

		const file = this.#app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return 'failed';

		try {
			// Always a new tab. Reusing the active leaf replaced whatever the
			// user was reading — and when that tab happened to be pinned, the
			// member ended up both pinned and grouped, which the model forbids.
			const leaf = this.#app.workspace.getLeaf('tab');
			await leaf.openFile(file, { active: true });
			this.#tracker.rescan();
			return 'opened';
		} catch {
			return 'failed';
		}
	}

	/** F9: reveal a specific open tab, even in another window. */
	async focusPath(path: string): Promise<boolean> {
		const windowId = this.currentWindowId();
		const plan = planOpenMember(path, windowId, this.#tracker.snapshot.leaves);

		// The plan is the cheap path; the live lookup is the authority. The
		// snapshot can lag a layout tick, and a leaf the tracker never indexed
		// (an external file) has no entry at all — which is exactly why a click
		// in the "External" section used to do nothing.
		const planned = plan.kind === 'focus' ? this.#tracker.leafById(plan.leafId) : null;
		const leaf = planned ?? this.#findLeafByPath(path);
		if (!leaf) return false;

		try {
			await this.#app.workspace.revealLeaf(leaf);
			this.#tracker.rescan();
			return true;
		} catch {
			return false;
		}
	}

	setPinned(path: string, pinned: boolean): boolean {
		// Pinning is a leaf-level action, so it works for every file tab —
		// including the 1.14 external ones, whose `isVaultFile` is false but
		// which the host still pins from its own tab menu.
		const leaves = this.#tracker.snapshot.leaves.filter(
			(leaf) => !leaf.inSidebar && leaf.path === path,
		);
		let changed = false;
		for (const snapshot of leaves) {
			const leaf = this.#tracker.leafById(snapshot.leafId);
			if (!leaf) continue;
			try {
				leaf.setPinned(pinned);
				changed = true;
			} catch {
				// ignore single-leaf failures
			}
		}
		if (changed) this.#tracker.schedule(0);
		return changed;
	}

	// --------------------------------------------------------------- internals

	#resolveTarget(windowId: string): { paneId: string; anchor: WorkspaceLeaf | null } | null {
		const leaves = this.#tracker.snapshot.leaves;

		const inWindow = leaves.filter((leaf) => !leaf.inSidebar && leaf.windowId === windowId);

		const active = inWindow.find((leaf) => leaf.active && leaf.path !== null);
		const lastId = this.#tracker.lastActiveEditorLeafId;
		const last = lastId ? inWindow.find((leaf) => leaf.leafId === lastId) : undefined;
		const anchorSnap = active ?? last ?? inWindow[0];

		if (!anchorSnap) return null;

		return {
			paneId: anchorSnap.paneId,
			anchor: this.#tracker.leafById(anchorSnap.leafId),
		};
	}

	#focusAnchor(anchor: WorkspaceLeaf | null): void {
		if (!anchor) return;
		try {
			this.#app.workspace.setActiveLeaf(anchor, { focus: false });
		} catch {
			// ignore
		}
	}

	/** Live lookup: the workspace, not the debounced snapshot, decides. */
	#findLeafByPath(path: string): WorkspaceLeaf | null {
		const win = currentWindow();
		const matches: WorkspaceLeaf[] = [];

		this.#app.workspace.iterateAllLeaves((leaf) => {
			// Duck-typed on purpose: `FileView` is the common case, but the
			// check only needs "this tab holds this file", and a stricter
			// instanceof is what silently skipped external tabs before.
			const file = (leaf.view as { file?: { path?: string } } | undefined)?.file;
			if (file?.path === path) matches.push(leaf);
		});
		if (matches.length === 0) return null;

		const local = matches.find((leaf) => leaf.view.containerEl?.ownerDocument?.defaultView === win);
		return local ?? matches[0] ?? null;
	}

	#detach(leafId: string): boolean {
		const leaf = this.#tracker.leafById(leafId);
		if (!leaf) return false;
		try {
			leaf.detach();
			return true;
		} catch {
			return false;
		}
	}

	#windowHasLeaves(windowId: string): boolean {
		return this.#tracker.snapshot.leaves.some((leaf) => leaf.windowId === windowId);
	}
}

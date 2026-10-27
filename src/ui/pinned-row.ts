import { type App, FileView, type WorkspaceLeaf } from 'obsidian';
import type { TrayController } from '../controller';
import { buildColorIndex, buildColorIndexByPath } from './tab-color-index';

/**
 * F4 + group colouring, driven entirely from the tab headers themselves.
 *
 * Obsidian marks a pinned tab with `.workspace-tab-header-status-icon.mod-pinned`
 * inside its header, so neither the pin state nor the tab order has to be
 * reconstructed from leaves. That matters: an earlier version paired leaves to
 * headers by index and silently decorated nothing whenever the two lists did
 * not line up.
 *
 * Everything here is additive: a class plus a CSS variable per header, and the
 * capsule/dot are pseudo-elements. No node is moved, cloned or inserted.
 */

const COMPACT_CLASS = 'tab-tray-pinned-compact';
const GROUPED_CLASS = 'tab-tray-grouped';
const GROUP_VAR = '--tt-group-color';

const HEADER_SELECTOR = '.workspace-tab-header';
const NEW_TAB_CLASS = 'workspace-tab-header-new-tab';
const PINNED_SELECTOR = '.workspace-tab-header-status-icon.mod-pinned';
const TITLE_SELECTOR = '.workspace-tab-header-inner-title';
const SIDEBAR_SELECTOR = '.mod-left-split, .mod-right-split';

export class PinnedRow {
	readonly #app: App;
	readonly #controller: TrayController;
	#unsub: (() => void) | null = null;
	/** Original `aria-label`, so turning compact mode off restores the host's. */
	readonly #labels = new WeakMap<HTMLElement, string | null>();

	constructor(app: App, controller: TrayController) {
		this.#app = app;
		this.#controller = controller;
	}

	start(): void {
		this.#unsub = this.#controller.onChange(() => this.refresh());
		this.refresh();
	}

	dispose(): void {
		this.#unsub?.();
		this.#unsub = null;
	}

	refresh(): void {
		const state = this.#controller.state;
		const compact =
			state.data.settings.compactPinnedRow && state.data.settings.compactPinnedRowAvailable;
		const colorEnabled = state.data.settings.groupColors;
		const colors = colorEnabled ? buildColorIndex(state.data.groups) : null;
		const pathColors = colorEnabled ? buildColorIndexByPath(state.data.groups) : null;
		// Exact path lookup first: the tab title drops the extension, so a
		// name-only index used to miss every markdown file.
		const pathByHeader = pathColors ? this.#pathByHeader() : null;

		for (const doc of this.#documents()) {
			for (const header of doc.querySelectorAll<HTMLElement>(HEADER_SELECTOR)) {
				if (header.classList.contains(NEW_TAB_CLASS)) continue;
				// Sidebar tabs are not part of the tab bar.
				if (header.closest(SIDEBAR_SELECTOR)) continue;

				const pinned = header.querySelector(PINNED_SELECTOR) !== null;
				const compactHere = compact && pinned;
				header.classList.toggle(COMPACT_CLASS, compactHere);

				const title = header.querySelector(TITLE_SELECTOR)?.textContent?.trim() ?? '';

				// The title element is hidden in compact mode, so the tooltip has
				// to move to the header itself. Only set while compact, and put
				// the host's value back when it ends.
				if (compactHere) {
					if (!this.#labels.has(header)) {
						this.#labels.set(header, header.getAttribute('aria-label'));
					}
					if (title) header.setAttribute('aria-label', title);
					header.setAttribute('data-tooltip-position', 'bottom');
				} else if (this.#labels.has(header)) {
					const original = this.#labels.get(header) ?? null;
					if (original === null) header.removeAttribute('aria-label');
					else header.setAttribute('aria-label', original);
					header.removeAttribute('data-tooltip-position');
					this.#labels.delete(header);
				}

				// A known path is authoritative: if that file is not in a group,
				// do not fall back to a same-named file in one. External files
				// can never be members, so they are never tinted (R12).
				const external = header.classList.contains('mod-external-file');
				const path = external ? null : (pathByHeader?.get(header) ?? null);
				const color = external
					? null
					: path
						? (pathColors?.get(path) ?? null)
						: (colors?.get(title) ?? null);

				header.classList.toggle(GROUPED_CLASS, color !== null);
				if (color) header.style.setProperty(GROUP_VAR, `var(--tt-g-${color})`);
				else header.style.removeProperty(GROUP_VAR);
			}
		}
	}

	/** Exact tab header → vault path pairing, using the leaf's own reference. */
	#pathByHeader(): Map<HTMLElement, string> {
		const map = new Map<HTMLElement, string>();

		this.#app.workspace.iterateAllLeaves((leaf) => {
			const header = (leaf as WorkspaceLeaf & { tabHeaderEl?: HTMLElement }).tabHeaderEl;
			const view = leaf.view;
			if (header && view instanceof FileView && view.file) {
				map.set(header, view.file.path);
			}
		});

		return map;
	}

	/** Every window, including popouts, shares the controller but not the DOM. */
	#documents(): Document[] {
		const docs = new Set<Document>();

		try {
			docs.add(activeDocument);
		} catch {
			// `activeDocument` is unavailable in very old builds; leaves below
			// still provide the documents that matter.
		}

		this.#app.workspace.iterateAllLeaves((leaf) => {
			const doc = leaf.view?.containerEl?.ownerDocument;
			if (doc) docs.add(doc);
		});

		return Array.from(docs);
	}
}

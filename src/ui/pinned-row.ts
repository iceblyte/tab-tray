import type { App } from 'obsidian';
import type { TrayController } from '../controller';
import { buildColorIndex } from './tab-color-index';

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
		const colors = state.data.settings.groupColors ? buildColorIndex(state.data.groups) : null;

		for (const doc of this.#documents()) {
			for (const header of doc.querySelectorAll<HTMLElement>(HEADER_SELECTOR)) {
				if (header.classList.contains(NEW_TAB_CLASS)) continue;
				// Sidebar tabs are not part of the tab bar.
				if (header.closest(SIDEBAR_SELECTOR)) continue;

				const pinned = header.querySelector(PINNED_SELECTOR) !== null;
				header.classList.toggle(COMPACT_CLASS, compact && pinned);

				const title = header.querySelector(TITLE_SELECTOR)?.textContent?.trim() ?? '';
				const color = colors?.get(title) ?? null;

				header.classList.toggle(GROUPED_CLASS, color !== null);
				if (color) header.style.setProperty(GROUP_VAR, `var(--tt-g-${color})`);
				else header.style.removeProperty(GROUP_VAR);
			}
		}
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

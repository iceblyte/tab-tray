import type { WorkspaceLeaf } from 'obsidian';
import type { TrayController } from '../controller';
import type { PinTracker } from '../workspace/pin-tracker';
import { baseName } from './file-utils';

/**
 * F4 — compact pinned row, implemented as an in-place restyle of the real tab
 * headers (D16): add a class, hide the title, let CSS `order` move the header to
 * the start of the tab bar. No DOM is moved or cloned, so an Obsidian update can
 * at worst break the look — never the workspace model.
 *
 * Group colouring rides on the same pass: one class plus a CSS variable, and the
 * capsule is drawn by `::before` / `::after`, so not a single node is inserted.
 */

const COMPACT_CLASS = 'tab-tray-pinned-compact';
const GROUPED_CLASS = 'tab-tray-grouped';
const GROUP_VAR = '--tt-group-color';

export class PinnedRow {
	readonly #tracker: PinTracker;
	readonly #controller: TrayController;
	readonly #decorated = new Set<HTMLElement>();
	#unsub: (() => void) | null = null;

	constructor(tracker: PinTracker, controller: TrayController) {
		this.#tracker = tracker;
		this.#controller = controller;
	}

	start(): void {
		this.#unsub = this.#controller.onChange(() => this.refresh());
		this.refresh();
	}

	dispose(): void {
		this.#unsub?.();
		this.#unsub = null;
		for (const header of this.#decorated) this.#clear(header);
		this.#decorated.clear();
	}

	refresh(): void {
		const state = this.#controller.state;
		const compact =
			state.data.settings.compactPinnedRow && state.data.settings.compactPinnedRowAvailable;
		const colored = state.data.settings.groupColors;

		const seen = new Set<HTMLElement>();

		for (const snapshot of state.leaves) {
			if (snapshot.path === null) continue;

			const leaf = this.#tracker.leafById(snapshot.leafId);
			if (!leaf) continue;

			const header = headerFor(leaf);
			if (!header) continue;

			seen.add(header);

			const group = snapshot.isVaultFile ? this.#controller.groupOfPath(snapshot.path) : null;
			const wantsCompact = compact && snapshot.pinned;

			header.classList.toggle(COMPACT_CLASS, wantsCompact);
			header.classList.toggle(GROUPED_CLASS, colored && group !== null);

			if (colored && group) {
				header.style.setProperty(GROUP_VAR, `var(--tt-g-${group.color})`);
				header.setAttribute('data-tt-group', group.name);
			} else {
				header.style.removeProperty(GROUP_VAR);
				header.removeAttribute('data-tt-group');
			}

			if (wantsCompact) header.setAttribute('data-tt-name', baseName(snapshot.path));
			else header.removeAttribute('data-tt-name');

			this.#decorated.add(header);
		}

		for (const header of Array.from(this.#decorated)) {
			if (seen.has(header)) continue;
			this.#clear(header);
			this.#decorated.delete(header);
		}
	}

	#clear(header: HTMLElement): void {
		header.classList.remove(COMPACT_CLASS, GROUPED_CLASS);
		header.style.removeProperty(GROUP_VAR);
		header.removeAttribute('data-tt-group');
		header.removeAttribute('data-tt-name');
	}
}

/**
 * V0d — leaf ↔ header mapping.
 *
 * Obsidian keeps one `.workspace-leaf` per tab inside `.workspace-tab-container`
 * and the matching `.workspace-tab-header` in the sibling header container, in
 * the same order. Index alignment is the only public way to pair them; if the
 * shape ever changes the lookup returns null and the feature simply stops
 * applying (P4).
 */
function headerFor(leaf: WorkspaceLeaf): HTMLElement | null {
	const content = leaf.view?.containerEl;
	const leafEl = content?.closest('.workspace-leaf');
	const container = leafEl?.parentElement;
	const tabsEl = container?.parentElement;
	if (!(leafEl instanceof HTMLElement) || !container || !tabsEl) return null;

	const leaves = Array.from(container.children).filter(
		(child): child is HTMLElement =>
			child instanceof HTMLElement && child.classList.contains('workspace-leaf'),
	);
	const index = leaves.indexOf(leafEl);
	if (index < 0) return null;

	const headers = Array.from(
		tabsEl.querySelectorAll<HTMLElement>(
			':scope > .workspace-tab-header-container .workspace-tab-header',
		),
	).filter((header) => !header.classList.contains('workspace-tab-header-new-tab'));

	return headers[index] ?? null;
}

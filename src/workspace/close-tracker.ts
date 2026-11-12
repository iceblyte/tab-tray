import type { App } from 'obsidian';
import {
	type ClosedStack,
	type CloseReason,
	diffClosed,
	snapshotTabs,
	type TabRef,
} from './closed-stack';
import type { EventHost } from './host';
import type { PinTracker } from './pin-tracker';
import type { LeafSnapshot } from './plan';

/**
 * Turns workspace scans into stack entries.
 *
 * Obsidian has no "tab closed" event, so a close is inferred from the diff
 * between two scans. That covers the host's own paths (the tab's × button,
 * Ctrl+W, the tab menu) as well as ours, which is why our operations only have
 * to *label* the batch instead of reporting it separately.
 *
 * Two closes are deliberately not recorded: closing a popout window (one action
 * that removes a whole window is not a mistake to undo) and anything during
 * unload.
 */
export class CloseTracker {
	readonly #app: App;
	readonly #tracker: PinTracker;
	readonly #stack: ClosedStack;

	#prev: Map<string, TabRef> | null = null;
	#reason: CloseReason = 'close';
	#skipNextScan = false;
	#disposed = false;
	#unsub: (() => void) | null = null;

	constructor(app: App, tracker: PinTracker, stack: ClosedStack) {
		this.#app = app;
		this.#tracker = tracker;
		this.#stack = stack;
	}

	start(host: EventHost): void {
		// Seed before subscribing: without it the first scan after startup would
		// look like "every open tab just appeared" and the second one would
		// report a burst of closes that never happened.
		this.#prev = snapshotTabs(this.#tracker.snapshot.leaves);

		this.#unsub = this.#tracker.onChange((snapshot) => this.#onScan(snapshot.leaves));

		host.registerEvent(
			this.#app.workspace.on('window-close', () => {
				this.#skipNextScan = true;
			}),
		);
	}

	/** Labels the closes that happen while the caller's operation runs. */
	setReason(reason: CloseReason): void {
		this.#reason = reason;
	}

	resetReason(): void {
		this.#reason = 'close';
	}

	dispose(): void {
		this.#disposed = true;
		this.#prev = null;
		this.#unsub?.();
		this.#unsub = null;
	}

	#onScan(leaves: readonly LeafSnapshot[]): void {
		if (this.#disposed) return;

		const next = snapshotTabs(leaves);
		const prev = this.#prev;
		this.#prev = next;

		if (prev === null) return;

		if (this.#skipNextScan) {
			this.#skipNextScan = false;
			return;
		}

		const closed = diffClosed(prev, next, this.#reason, Date.now());
		this.#stack.record(closed);
	}
}

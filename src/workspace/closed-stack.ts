import type { LeafSnapshot } from './plan';

/**
 * H1 — the closed-tab stack behind "undo".
 *
 * Deliberately in memory only. Persisting it would add a durable field that the
 * current schema has no room for (v1.1 does not change `schemaVersion`), and a
 * stack that survives a restart is a history feature, not an undo.
 *
 * The list discipline is borrowed from the Recent Files plugin: dedupe by path,
 * put the newest first, trim to a cap. Two things are deliberately not copied:
 * it stores a redundant `basename` (we derive it from the path) and it writes
 * through `plugin.saveData()` (D7 keeps us on one write path).
 */

export type CloseReason = 'expand' | 'collapse' | 'close' | 'close-others';

export interface ClosedEntry {
	/** Vault path, or the `file:` pseudo-path of an out-of-vault tab (R12). */
	path: string;
	/** The window the close happened in; reopening prefers this one. */
	windowId: string;
	reason: CloseReason;
	/** Shared by every entry of one batch, which is what makes undo whole. */
	closedAt: number;
}

export interface TabRef {
	path: string;
	windowId: string;
}

export const DEFAULT_CLOSED_CAPACITY = 20;

/**
 * One tab per leaf id. Sidebar leaves are outside the tab-bar model and a
 * file-less tab has nothing to reopen, so both are dropped here.
 */
export function snapshotTabs(leaves: readonly LeafSnapshot[]): Map<string, TabRef> {
	const tabs = new Map<string, TabRef>();

	for (const leaf of leaves) {
		if (leaf.inSidebar || leaf.path === null) continue;
		if (tabs.has(leaf.leafId)) continue;
		tabs.set(leaf.leafId, { path: leaf.path, windowId: leaf.windowId });
	}

	return tabs;
}

/**
 * Leaves that disappeared between two scans.
 *
 * `leafId` comes from a `WeakMap<WorkspaceLeaf, string>`, so it is stable across
 * scans: "present before, absent now" really does mean "this leaf was closed".
 * A path that is still open in another pane is not closed, and is skipped so
 * undo never lists a file the user can already see.
 */
export function diffClosed(
	prev: ReadonlyMap<string, TabRef>,
	next: ReadonlyMap<string, TabRef>,
	reason: CloseReason,
	closedAt: number,
): ClosedEntry[] {
	const stillOpen = new Set<string>();
	for (const tab of next.values()) stillOpen.add(tab.path);

	const closed: ClosedEntry[] = [];
	const seen = new Set<string>();

	for (const [leafId, tab] of prev) {
		if (next.has(leafId)) continue;
		if (stillOpen.has(tab.path)) continue;
		if (seen.has(tab.path)) continue;

		seen.add(tab.path);
		closed.push({ path: tab.path, windowId: tab.windowId, reason, closedAt });
	}

	return closed;
}

export class ClosedStack {
	#entries: ClosedEntry[] = [];
	readonly #capacity: number;

	constructor(capacity: number = DEFAULT_CLOSED_CAPACITY) {
		this.#capacity = Math.max(1, Math.floor(capacity));
	}

	get size(): number {
		return this.#entries.length;
	}

	get isEmpty(): boolean {
		return this.#entries.length === 0;
	}

	/** Newest first. */
	entries(): readonly ClosedEntry[] {
		return this.#entries;
	}

	/**
	 * Records one batch. A path already in the stack moves to the front instead
	 * of appearing twice: closing the same file twice is one thing to undo.
	 */
	record(batch: readonly ClosedEntry[]): void {
		if (batch.length === 0) return;

		const incoming = new Set(batch.map((entry) => entry.path));
		const kept = this.#entries.filter((entry) => !incoming.has(entry.path));
		const next = [...batch, ...kept];

		if (next.length > this.#capacity) next.length = this.#capacity;
		this.#entries = next;
	}

	forget(path: string): void {
		this.#entries = this.#entries.filter((entry) => entry.path !== path);
	}

	/** F7: a renamed file keeps its place in the stack. */
	rename(oldPath: string, newPath: string): void {
		if (oldPath === newPath) return;
		if (!this.#entries.some((entry) => entry.path === oldPath)) return;

		const seen = new Set<string>();
		this.#entries = this.#entries
			.map((entry) => (entry.path === oldPath ? { ...entry, path: newPath } : entry))
			.filter((entry) => {
				if (seen.has(entry.path)) return false;
				seen.add(entry.path);
				return true;
			});
	}

	/** The newest batch — everything closed by one action. */
	peekBatch(): ClosedEntry[] {
		const first = this.#entries[0];
		if (!first) return [];
		return this.#entries.filter(
			(entry) => entry.closedAt === first.closedAt && entry.reason === first.reason,
		);
	}

	remove(paths: readonly string[]): void {
		if (paths.length === 0) return;
		const set = new Set(paths);
		this.#entries = this.#entries.filter((entry) => !set.has(entry.path));
	}

	clear(): void {
		this.#entries = [];
	}
}

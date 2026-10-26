/**
 * Pure decision functions for F2 / F9 (D9).
 *
 * No Obsidian import, no side effects: every rule that is easy to get wrong
 * (R6 pinned members, R11 window scope, R12 out-of-vault tabs, D4 replace vs
 * append) is expressed here as an enumerable input → output mapping and is
 * covered by unit tests. `execute.ts` only carries the plan out.
 */

export interface LeafSnapshot {
	/** Stable per scan; used to address a leaf for detach/focus. */
	leafId: string;
	/**
	 * Vault-relative path for vault files, the raw path for out-of-vault files
	 * (R12), or `null` for a file-less tab.
	 */
	path: string | null;
	/** False for out-of-vault tabs opened since 1.14 (R12). */
	isVaultFile: boolean;
	pinned: boolean;
	windowId: string;
	paneId: string;
	active: boolean;
}

export type ExpandMode = 'replace' | 'append';

export interface ExpandPlan {
	mode: ExpandMode;
	closeLeafIds: string[];
	openPaths: string[];
	/** Pinned members already visible in the target pane; they stay as they are. */
	preservedPinned: string[];
}

export interface CollapsePlan {
	closeLeafIds: string[];
	/** Distinct member paths left open because they are pinned (R6). */
	skippedPinnedPaths: string[];
	/** Members that were not open in this window at all. */
	notOpenPaths: string[];
}

export interface OpenTarget {
	/** The window the interaction was triggered from (R11). */
	windowId: string;
	/** The pane that "replace" rewrites. */
	paneId: string;
}

export interface TabListEntry {
	path: string;
	isVaultFile: boolean;
	pinned: boolean;
	windowIds: string[];
	paneCount: number;
	leafIds: string[];
	active: boolean;
	groupId: string | null;
}

function unique<T>(values: T[]): T[] {
	return Array.from(new Set(values));
}

/**
 * Replace: clear the target pane of every unpinned vault tab (and any blank
 * tab), then open the whole member set in order (D4). Pinned tabs are
 * preserved (R6); out-of-vault tabs are never touched (R12) — they carry a path
 * and therefore must not be swept up by the "blank tab" cleanup rule.
 *
 * Append: add only the members that are not open anywhere in this window (D4).
 */
export function planExpand(
	mode: ExpandMode,
	members: string[],
	target: OpenTarget,
	leaves: LeafSnapshot[],
): ExpandPlan {
	const wanted = unique(members);

	if (mode === 'append') {
		const openInWindow = new Set(
			leaves
				.filter((leaf) => leaf.windowId === target.windowId && leaf.path && leaf.isVaultFile)
				.map((leaf) => leaf.path as string),
		);
		return {
			mode,
			closeLeafIds: [],
			openPaths: wanted.filter((path) => !openInWindow.has(path)),
			preservedPinned: [],
		};
	}

	const paneLeaves = leaves.filter(
		(leaf) => leaf.windowId === target.windowId && leaf.paneId === target.paneId,
	);
	const closeLeafIds = paneLeaves
		.filter((leaf) => !leaf.pinned && (leaf.path === null || leaf.isVaultFile))
		.map((leaf) => leaf.leafId);

	const pinnedInPane = new Set(
		paneLeaves
			.filter((leaf) => leaf.pinned && leaf.isVaultFile && leaf.path !== null)
			.map((leaf) => leaf.path as string),
	);

	return {
		mode,
		closeLeafIds,
		// A pinned member is already on screen in this pane; opening it again
		// would duplicate the tab.
		openPaths: wanted.filter((path) => !pinnedInPane.has(path)),
		preservedPinned: wanted.filter((path) => pinnedInPane.has(path)),
	};
}

/**
 * Collapse: close every member leaf inside the triggering window, across all
 * of its panes, including duplicates of the same file. Pinned members stay
 * (R6) and are reported so the UI can explain what happened. Leaves in other
 * windows — including popouts — are never in the plan (R11).
 */
export function planCollapse(
	members: string[],
	windowId: string,
	leaves: LeafSnapshot[],
): CollapsePlan {
	const memberSet = new Set(members);

	const relevant = leaves.filter(
		(leaf) =>
			leaf.windowId === windowId &&
			leaf.isVaultFile &&
			leaf.path !== null &&
			memberSet.has(leaf.path),
	);

	const closeLeafIds = relevant.filter((leaf) => !leaf.pinned).map((leaf) => leaf.leafId);

	return {
		closeLeafIds,
		skippedPinnedPaths: unique(
			relevant.filter((leaf) => leaf.pinned).map((leaf) => leaf.path as string),
		),
		notOpenPaths: members.filter((path) => !relevant.some((leaf) => leaf.path === path)),
	};
}

/** n of `n/m`: distinct members open in any window, deduplicated across panes. */
export function countOpen(members: string[], leaves: LeafSnapshot[]): number {
	const memberSet = new Set(members);
	const open = new Set<string>();
	for (const leaf of leaves) {
		if (!leaf.isVaultFile || leaf.path === null) continue;
		if (memberSet.has(leaf.path)) open.add(leaf.path);
	}
	return open.size;
}

/** F9 list: one entry per distinct path across every window (R11 scope). */
export function listOpenTabs(
	leaves: LeafSnapshot[],
	groupOf: (path: string) => string | null,
): TabListEntry[] {
	const byPath = new Map<string, TabListEntry>();

	for (const leaf of leaves) {
		if (leaf.path === null) continue;

		const existing = byPath.get(leaf.path);
		if (existing) {
			existing.leafIds.push(leaf.leafId);
			if (!existing.windowIds.includes(leaf.windowId)) existing.windowIds.push(leaf.windowId);
			existing.paneCount = countDistinctPanes(leaves, existing.leafIds);
			existing.active = existing.active || leaf.active;
			existing.pinned = existing.pinned || leaf.pinned;
			continue;
		}

		byPath.set(leaf.path, {
			path: leaf.path,
			isVaultFile: leaf.isVaultFile,
			pinned: leaf.pinned,
			windowIds: [leaf.windowId],
			paneCount: 1,
			leafIds: [leaf.leafId],
			active: leaf.active,
			groupId: leaf.isVaultFile ? groupOf(leaf.path) : null,
		});
	}

	for (const entry of byPath.values()) {
		entry.paneCount = countDistinctPanes(leaves, entry.leafIds);
	}

	return Array.from(byPath.values());
}

function countDistinctPanes(leaves: LeafSnapshot[], leafIds: string[]): number {
	const ids = new Set(leafIds);
	const panes = new Set<string>();
	for (const leaf of leaves) {
		if (ids.has(leaf.leafId)) panes.add(leaf.paneId);
	}
	return panes.size;
}

/** F1 / F9 click: focus an existing tab if there is one, otherwise open it. */
export function planOpenMember(
	path: string,
	windowId: string,
	leaves: LeafSnapshot[],
): { kind: 'focus'; leafId: string } | { kind: 'open' } {
	const candidates = leaves.filter((leaf) => leaf.isVaultFile && leaf.path === path);
	if (candidates.length === 0) return { kind: 'open' };

	const local = candidates.find((leaf) => leaf.windowId === windowId);
	const chosen = local ?? candidates[0];
	return chosen ? { kind: 'focus', leafId: chosen.leafId } : { kind: 'open' };
}

/** F9 ×: close every tab of this file inside the triggering window. */
export function planCloseFile(path: string, windowId: string, leaves: LeafSnapshot[]): string[] {
	return leaves
		.filter((leaf) => leaf.windowId === windowId && leaf.path === path)
		.map((leaf) => leaf.leafId);
}

/**
 * F9 "close others": keep the named file and every pinned tab, close the rest
 * of the vault tabs in this window. Out-of-vault tabs are left alone (R12).
 */
export function planCloseOthers(path: string, windowId: string, leaves: LeafSnapshot[]): string[] {
	return leaves
		.filter(
			(leaf) =>
				leaf.windowId === windowId &&
				leaf.isVaultFile &&
				!leaf.pinned &&
				leaf.path !== null &&
				leaf.path !== path,
		)
		.map((leaf) => leaf.leafId);
}

/**
 * F9 "tidy all": collapse every group in the current window at once. Pinned
 * (R6), out-of-vault (R12) and ungrouped tabs are untouched by construction.
 */
export function planTidyAll(
	groups: Array<{ members: Array<{ path: string }> }>,
	windowId: string,
	leaves: LeafSnapshot[],
): CollapsePlan {
	const allMembers = unique(groups.flatMap((group) => group.members.map((m) => m.path)));
	return planCollapse(allMembers, windowId, leaves);
}

import { describe, expect, it } from 'vitest';
import {
	countOpen,
	type LeafSnapshot,
	listOpenTabs,
	planCloseFile,
	planCloseOthers,
	planCollapse,
	planExpand,
	planOpenMember,
	planTidyAll,
} from '../src/workspace/plan';

function leaf(partial: Partial<LeafSnapshot> & { leafId: string }): LeafSnapshot {
	return {
		path: 'a.md',
		isVaultFile: true,
		pinned: false,
		windowId: 'w1',
		paneId: 'p1',
		active: false,
		inSidebar: false,
		isEmptyTab: false,
		...partial,
	};
}

describe('planExpand — replace (D4/R6/R12)', () => {
	const leaves: LeafSnapshot[] = [
		leaf({ leafId: 'l1', path: 'open.md' }),
		leaf({ leafId: 'l2', path: 'pinned.md', pinned: true }),
		leaf({ leafId: 'l3', path: '/outside/vault.md', isVaultFile: false }),
		leaf({ leafId: 'l4', path: null }),
		leaf({ leafId: 'l5', path: 'other-pane.md', paneId: 'p2' }),
	];

	it('closes unpinned vault tabs and blank tabs in the target pane only', () => {
		const plan = planExpand('replace', ['a.md'], { windowId: 'w1', paneId: 'p1' }, leaves);
		expect(plan.closeLeafIds.sort()).toEqual(['l1', 'l4']);
	});

	it('never treats an out-of-vault tab without a path as a blank tab', () => {
		const externalNoPath = [
			leaf({ leafId: 'x1', path: null, isVaultFile: false, isEmptyTab: false }),
			leaf({ leafId: 'x2', path: null, isEmptyTab: true }),
		];
		const plan = planExpand('replace', ['a.md'], { windowId: 'w1', paneId: 'p1' }, externalNoPath);
		expect(plan.closeLeafIds).toEqual(['x2']);
	});

	it('keeps pinned and out-of-vault tabs untouched', () => {
		const plan = planExpand('replace', ['a.md'], { windowId: 'w1', paneId: 'p1' }, leaves);
		expect(plan.closeLeafIds).not.toContain('l2');
		expect(plan.closeLeafIds).not.toContain('l3');
	});

	it('opens the whole member set in order, skipping pinned members already on screen', () => {
		const plan = planExpand(
			'replace',
			['a.md', 'pinned.md', 'b.md'],
			{ windowId: 'w1', paneId: 'p1' },
			leaves,
		);
		expect(plan.openPaths).toEqual(['a.md', 'b.md']);
		expect(plan.preservedPinned).toEqual(['pinned.md']);
	});

	it('deduplicates members while preserving first-seen order', () => {
		const plan = planExpand(
			'replace',
			['b.md', 'a.md', 'b.md'],
			{ windowId: 'w1', paneId: 'p1' },
			[],
		);
		expect(plan.openPaths).toEqual(['b.md', 'a.md']);
	});

	it('does not touch another window at all (R11)', () => {
		const otherWindow = [leaf({ leafId: 'x1', path: 'a.md', windowId: 'w2' })];
		const plan = planExpand('replace', ['a.md'], { windowId: 'w1', paneId: 'p1' }, otherWindow);
		expect(plan.closeLeafIds).toEqual([]);
	});
});

describe('planExpand — append (D4)', () => {
	const leaves: LeafSnapshot[] = [
		leaf({ leafId: 'l1', path: 'a.md' }),
		leaf({ leafId: 'l2', path: 'b.md', paneId: 'p2' }),
		leaf({ leafId: 'l3', path: 'c.md', windowId: 'w2' }),
	];

	it('adds only members that are not open anywhere in this window', () => {
		const plan = planExpand(
			'append',
			['a.md', 'b.md', 'c.md', 'd.md'],
			{ windowId: 'w1', paneId: 'p1' },
			leaves,
		);
		expect(plan.openPaths).toEqual(['c.md', 'd.md']);
		expect(plan.closeLeafIds).toEqual([]);
	});
});

describe('planCollapse (R6/R11)', () => {
	const leaves: LeafSnapshot[] = [
		leaf({ leafId: 'l1', path: 'a.md' }),
		leaf({ leafId: 'l2', path: 'a.md', paneId: 'p2' }),
		leaf({ leafId: 'l3', path: 'b.md', pinned: true }),
		leaf({ leafId: 'l4', path: 'a.md', windowId: 'w2' }),
		leaf({ leafId: 'l5', path: 'unrelated.md' }),
	];

	it('closes every copy of a member inside the window, across panes', () => {
		const plan = planCollapse(['a.md', 'b.md'], 'w1', leaves);
		expect(plan.closeLeafIds.sort()).toEqual(['l1', 'l2']);
	});

	it('skips pinned members and reports them once per path', () => {
		const plan = planCollapse(['a.md', 'b.md'], 'w1', leaves);
		expect(plan.skippedPinnedPaths).toEqual(['b.md']);
	});

	it('leaves other windows alone', () => {
		const plan = planCollapse(['a.md'], 'w1', leaves);
		expect(plan.closeLeafIds).not.toContain('l4');
	});

	it('reports members that were not open', () => {
		const plan = planCollapse(['a.md', 'missing.md'], 'w1', leaves);
		expect(plan.notOpenPaths).toEqual(['missing.md']);
	});
});

describe('countOpen (R11/R12)', () => {
	it('counts distinct member paths across panes and windows', () => {
		const leaves: LeafSnapshot[] = [
			leaf({ leafId: 'l1', path: 'a.md' }),
			leaf({ leafId: 'l2', path: 'a.md', paneId: 'p2' }),
			leaf({ leafId: 'l3', path: 'a.md', windowId: 'w2' }),
			leaf({ leafId: 'l4', path: 'b.md' }),
			leaf({ leafId: 'l5', path: 'not-member.md' }),
		];
		expect(countOpen(['a.md', 'b.md', 'c.md'], leaves)).toBe(2);
	});

	it('ignores out-of-vault tabs (R12)', () => {
		const leaves = [leaf({ leafId: 'l1', path: 'a.md', isVaultFile: false })];
		expect(countOpen(['a.md'], leaves)).toBe(0);
	});
});

describe('listOpenTabs (F9)', () => {
	const groupOf = (path: string) => (path === 'a.md' ? 'g1' : null);

	it('deduplicates by path and records windows, panes and flags', () => {
		const leaves: LeafSnapshot[] = [
			leaf({ leafId: 'l1', path: 'a.md', active: true }),
			leaf({ leafId: 'l2', path: 'a.md', paneId: 'p2', windowId: 'w2', pinned: true }),
			leaf({ leafId: 'l3', path: 'b.md' }),
			leaf({ leafId: 'l4', path: '/outside/x.md', isVaultFile: false }),
			leaf({ leafId: 'l5', path: null }),
		];

		const tabs = listOpenTabs(leaves, groupOf);
		expect(tabs.map((t) => t.path)).toEqual(['a.md', 'b.md', '/outside/x.md']);

		const a = tabs[0];
		expect(a).toMatchObject({
			groupId: 'g1',
			paneCount: 2,
			active: true,
			pinned: true,
		});
		expect(a?.windowIds.sort()).toEqual(['w1', 'w2']);

		const external = tabs[2];
		expect(external).toMatchObject({ isVaultFile: false, groupId: null });
	});

	it('returns one entry per distinct path even inside a single pane', () => {
		const leaves = [leaf({ leafId: 'l1', path: 'a.md' }), leaf({ leafId: 'l2', path: 'a.md' })];
		const tabs = listOpenTabs(leaves, groupOf);
		expect(tabs).toHaveLength(1);
		expect(tabs[0]?.paneCount).toBe(1);
	});
});

describe('sidebar leaves', () => {
	it('are never counted, closed or replaced', () => {
		const leaves: LeafSnapshot[] = [
			leaf({ leafId: 's1', path: null, inSidebar: true, paneId: 'sidebar' }),
			leaf({ leafId: 's2', path: 'a.md', inSidebar: true, paneId: 'sidebar' }),
			leaf({ leafId: 'l1', path: 'a.md' }),
		];

		expect(planCollapse(['a.md'], 'w1', leaves).closeLeafIds).toEqual(['l1']);
		expect(countOpen(['a.md'], leaves)).toBe(1);
		expect(listOpenTabs(leaves, () => null)).toHaveLength(1);
		expect(
			planExpand('replace', ['a.md'], { windowId: 'w1', paneId: 'sidebar' }, leaves).closeLeafIds,
		).toEqual([]);
	});
});

describe('planOpenMember', () => {
	it('prefers a leaf in the triggering window', () => {
		const leaves = [
			leaf({ leafId: 'l1', path: 'a.md', windowId: 'w2' }),
			leaf({ leafId: 'l2', path: 'a.md', windowId: 'w1' }),
		];
		expect(planOpenMember('a.md', 'w1', leaves)).toEqual({ kind: 'focus', leafId: 'l2' });
	});

	it('focuses a tab that lives in another window', () => {
		const leaves = [leaf({ leafId: 'l1', path: 'a.md', windowId: 'w2' })];
		expect(planOpenMember('a.md', 'w1', leaves)).toEqual({ kind: 'focus', leafId: 'l1' });
	});

	it('asks to open when the file is not open anywhere', () => {
		expect(planOpenMember('a.md', 'w1', [])).toEqual({ kind: 'open' });
	});
});

describe('planCloseFile / planCloseOthers / planTidyAll', () => {
	const leaves: LeafSnapshot[] = [
		leaf({ leafId: 'l1', path: 'a.md' }),
		leaf({ leafId: 'l2', path: 'a.md', paneId: 'p2' }),
		leaf({ leafId: 'l3', path: 'b.md' }),
		leaf({ leafId: 'l4', path: 'c.md', pinned: true }),
		leaf({ leafId: 'l5', path: 'a.md', windowId: 'w2' }),
		leaf({ leafId: 'l6', path: '/outside/x.md', isVaultFile: false }),
	];

	it('closes every tab of one file in the current window', () => {
		expect(planCloseFile('a.md', 'w1', leaves).sort()).toEqual(['l1', 'l2']);
	});

	it('closes other vault tabs but keeps the target and pinned ones', () => {
		expect(planCloseOthers('a.md', 'w1', leaves).sort()).toEqual(['l3']);
	});

	it('tidy-all collapses every group at once and keeps pinned/external tabs', () => {
		const plan = planTidyAll(
			[{ members: [{ path: 'a.md' }, { path: 'b.md' }] }, { members: [{ path: 'c.md' }] }],
			'w1',
			leaves,
		);
		expect(plan.closeLeafIds.sort()).toEqual(['l1', 'l2', 'l3']);
		expect(plan.skippedPinnedPaths).toEqual(['c.md']);
	});
});

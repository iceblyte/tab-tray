import { describe, expect, it } from 'vitest';
import {
	type ClosedEntry,
	ClosedStack,
	diffClosed,
	snapshotTabs,
} from '../src/workspace/closed-stack';
import type { LeafSnapshot } from '../src/workspace/plan';

function leaf(overrides: Partial<LeafSnapshot> & { leafId: string }): LeafSnapshot {
	return {
		path: null,
		isVaultFile: true,
		external: false,
		pinned: false,
		windowId: 'w1',
		paneId: 'p1',
		active: false,
		inSidebar: false,
		isEmptyTab: false,
		...overrides,
	};
}

function entry(
	path: string,
	closedAt: number,
	reason: ClosedEntry['reason'] = 'close',
): ClosedEntry {
	return { path, windowId: 'w1', reason, closedAt };
}

describe('snapshotTabs', () => {
	it('keys open tabs by leaf id', () => {
		const tabs = snapshotTabs([
			leaf({ leafId: 'a', path: 'a.md' }),
			leaf({ leafId: 'b', path: 'b.md', windowId: 'w2' }),
		]);

		expect(tabs.get('a')).toEqual({ path: 'a.md', windowId: 'w1' });
		expect(tabs.get('b')).toEqual({ path: 'b.md', windowId: 'w2' });
	});

	it('ignores sidebar leaves and file-less tabs', () => {
		const tabs = snapshotTabs([
			leaf({ leafId: 'side', path: 'x.md', inSidebar: true }),
			leaf({ leafId: 'blank', path: null, isEmptyTab: true }),
		]);

		expect(tabs.size).toBe(0);
	});
});

describe('diffClosed', () => {
	it('reports a leaf that disappeared', () => {
		const prev = snapshotTabs([leaf({ leafId: 'a', path: 'a.md' })]);
		const next = snapshotTabs([]);

		expect(diffClosed(prev, next, 'close', 1000)).toEqual([entry('a.md', 1000)]);
	});

	it('ignores leaves that are still open', () => {
		const prev = snapshotTabs([leaf({ leafId: 'a', path: 'a.md' })]);
		const next = snapshotTabs([leaf({ leafId: 'a', path: 'a.md' })]);

		expect(diffClosed(prev, next, 'close', 1000)).toEqual([]);
	});

	it('does not report a file that is still open in another pane', () => {
		const prev = snapshotTabs([
			leaf({ leafId: 'a1', path: 'a.md', paneId: 'p1' }),
			leaf({ leafId: 'a2', path: 'a.md', paneId: 'p2' }),
		]);
		const next = snapshotTabs([leaf({ leafId: 'a2', path: 'a.md', paneId: 'p2' })]);

		expect(diffClosed(prev, next, 'close', 1000)).toEqual([]);
	});

	it('reports a whole batch with one timestamp and reason', () => {
		const prev = snapshotTabs([
			leaf({ leafId: 'a', path: 'a.md' }),
			leaf({ leafId: 'b', path: 'b.md' }),
		]);

		const closed = diffClosed(prev, snapshotTabs([]), 'expand', 42);

		expect(closed).toHaveLength(2);
		expect(closed.every((item) => item.closedAt === 42)).toBe(true);
		expect(closed.every((item) => item.reason === 'expand')).toBe(true);
	});

	it('reports a path once even when several of its panes closed', () => {
		const prev = snapshotTabs([
			leaf({ leafId: 'a1', path: 'a.md', paneId: 'p1' }),
			leaf({ leafId: 'a2', path: 'a.md', paneId: 'p2' }),
		]);

		expect(diffClosed(prev, snapshotTabs([]), 'close', 1)).toHaveLength(1);
	});
});

describe('ClosedStack', () => {
	it('keeps the newest batch first', () => {
		const stack = new ClosedStack();
		stack.record([entry('a.md', 1)]);
		stack.record([entry('b.md', 2)]);

		expect(stack.entries().map((item) => item.path)).toEqual(['b.md', 'a.md']);
	});

	it('moves a repeated path to the front instead of duplicating it', () => {
		const stack = new ClosedStack();
		stack.record([entry('a.md', 1), entry('b.md', 1)]);
		stack.record([entry('a.md', 2)]);

		expect(stack.entries().map((item) => item.path)).toEqual(['a.md', 'b.md']);
		expect(stack.size).toBe(2);
	});

	it('trims to the capacity, dropping the oldest', () => {
		const stack = new ClosedStack(3);
		for (let i = 0; i < 5; i += 1) stack.record([entry(`n${i}.md`, i)]);

		expect(stack.entries().map((item) => item.path)).toEqual(['n4.md', 'n3.md', 'n2.md']);
	});

	it('peekBatch returns only the newest action', () => {
		const stack = new ClosedStack();
		stack.record([entry('a.md', 1), entry('b.md', 1)]);
		stack.record([entry('c.md', 2)]);

		expect(stack.peekBatch().map((item) => item.path)).toEqual(['c.md']);
	});

	it('peekBatch separates batches that share a timestamp but not a reason', () => {
		const stack = new ClosedStack();
		stack.record([entry('a.md', 5, 'close'), entry('b.md', 5, 'expand')]);

		expect(stack.peekBatch().map((item) => item.path)).toEqual(['a.md']);
	});

	it('follows a rename and keeps the position', () => {
		const stack = new ClosedStack();
		stack.record([entry('old.md', 1), entry('b.md', 1)]);
		stack.rename('old.md', 'new.md');

		expect(stack.entries().map((item) => item.path)).toEqual(['new.md', 'b.md']);
	});

	it('drops a renamed path that collides with a newer entry', () => {
		const stack = new ClosedStack();
		stack.record([entry('a.md', 1)]);
		stack.record([entry('b.md', 2)]);
		stack.rename('a.md', 'b.md');

		expect(stack.entries().map((item) => item.path)).toEqual(['b.md']);
	});

	it('forgets a deleted path', () => {
		const stack = new ClosedStack();
		stack.record([entry('a.md', 1), entry('b.md', 1)]);
		stack.forget('a.md');

		expect(stack.entries().map((item) => item.path)).toEqual(['b.md']);
	});

	it('removes the paths that were reopened', () => {
		const stack = new ClosedStack();
		stack.record([entry('a.md', 1), entry('b.md', 1)]);
		stack.remove(['a.md']);

		expect(stack.isEmpty).toBe(false);
		expect(stack.entries().map((item) => item.path)).toEqual(['b.md']);
	});

	it('treats an empty batch as a no-op', () => {
		const stack = new ClosedStack();
		stack.record([]);

		expect(stack.isEmpty).toBe(true);
	});

	it('never drops below one slot', () => {
		const stack = new ClosedStack(0);
		stack.record([entry('a.md', 1), entry('b.md', 2)]);

		expect(stack.size).toBe(1);
	});
});

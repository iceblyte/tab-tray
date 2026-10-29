import type { ViewState, WorkspaceLeaf } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { leafPath, leafState, leafViewType } from '../src/workspace/leaf-file';

interface FakeLeafOptions {
	/** `leaf.view` — a `FileView`-shaped object, or a deferred stand-in. */
	view?: unknown;
	/** What `getViewState()` returns. */
	state?: ViewState | null;
	/** Simulate a leaf that is torn down mid-scan. */
	throws?: boolean;
}

function fakeLeaf(options: FakeLeafOptions = {}): WorkspaceLeaf {
	const leaf = {
		view: options.view ?? {},
		getViewState: () => {
			if (options.throws) throw new Error('leaf is gone');
			return options.state ?? { type: 'empty' };
		},
	};
	return leaf as unknown as WorkspaceLeaf;
}

function fileView(path: string): unknown {
	return { file: { path } };
}

describe('leafPath', () => {
	it('reads a live FileView first', () => {
		const leaf = fakeLeaf({
			view: fileView('notes/a.md'),
			state: { type: 'markdown', state: { file: 'stale/a.md' } },
		});
		expect(leafPath(leaf)).toBe('notes/a.md');
	});

	// The regression: after a restart every background tab is deferred, so
	// `view.file` is undefined and the path only exists in the view state.
	it('falls back to the view state of a deferred tab', () => {
		const leaf = fakeLeaf({ state: { type: 'markdown', state: { file: 'notes/a.md' } } });
		expect(leafPath(leaf)).toBe('notes/a.md');
	});

	it('keeps out-of-vault pseudo-paths intact', () => {
		const leaf = fakeLeaf({
			state: { type: 'markdown', state: { file: 'file:C:\\notes\\a.md' } },
		});
		expect(leafPath(leaf)).toBe('file:C:\\notes\\a.md');
	});

	it('reports null for a tab without a file', () => {
		expect(leafPath(fakeLeaf({ state: { type: 'empty' } }))).toBeNull();
		expect(leafPath(fakeLeaf({ state: { type: 'graph' } }))).toBeNull();
	});

	it('ignores an empty or non-string saved path', () => {
		expect(leafPath(fakeLeaf({ state: { type: 'markdown', state: { file: '' } } }))).toBeNull();
		expect(leafPath(fakeLeaf({ state: { type: 'markdown', state: { file: 42 } } }))).toBeNull();
	});

	it('survives a leaf whose state cannot be read', () => {
		expect(leafPath(fakeLeaf({ throws: true }))).toBeNull();
		expect(leafPath(fakeLeaf({ view: fileView('notes/a.md'), throws: true }))).toBe('notes/a.md');
	});

	it('accepts an already-read state so one scan reads it once', () => {
		const leaf = fakeLeaf({ throws: true });
		expect(leafPath(leaf, { type: 'markdown', state: { file: 'notes/a.md' } })).toBe('notes/a.md');
	});
});

describe('leafViewType', () => {
	it('reads the saved type, which survives deferral', () => {
		expect(leafViewType(fakeLeaf({ state: { type: 'markdown' } }))).toBe('markdown');
		expect(leafViewType(fakeLeaf({ state: { type: 'empty' } }))).toBe('empty');
	});

	it('returns an empty string when the state is unavailable', () => {
		expect(leafViewType(fakeLeaf({ throws: true }))).toBe('');
	});
});

describe('leafState', () => {
	it('returns null instead of throwing', () => {
		expect(leafState(fakeLeaf({ throws: true }))).toBeNull();
		expect(leafState(fakeLeaf({ state: { type: 'markdown' } }))).toEqual({ type: 'markdown' });
	});
});

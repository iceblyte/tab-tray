import { describe, expect, it, vi } from 'vitest';

/**
 * The bug this file pins down: after a restart Obsidian defers every background
 * tab, so `leaf.view` is a `DeferredView` and `view.file` is undefined. The
 * tracker used to derive the path from `view.file` alone, which made the
 * sidebar's pinned/ungrouped/external sections empty and made "focus the tab if
 * it is already open" open a second copy of the same file.
 *
 * The tracker is exercised for real against a fake workspace; only `obsidian`
 * itself is stubbed.
 */
vi.mock('obsidian', () => {
	class TFile {}
	class FileView {
		file: { path: string } | null = null;
		getViewType(): string {
			return 'markdown';
		}
	}
	return { TFile, FileView };
});

import type { App, WorkspaceLeaf } from 'obsidian';
import { FileView, TFile } from 'obsidian';
import { PinTracker } from '../src/workspace/pin-tracker';
import { listOpenTabs, planOpenMember } from '../src/workspace/plan';

const windowRef = {} as Window;

/**
 * `FileView` is abstract in the published typings, but the mock is a concrete
 * class — this is the one place the two differ.
 */
const FileViewClass = FileView as unknown as new () => { file: { path: string } | null };

interface LeafOptions {
	/** The file the tab holds. */
	path: string;
	/** What the saved layout says, when it lags behind a rename. */
	savedPath?: string;
	pinned?: boolean;
	/** A restored background tab: not a `FileView`, no `view.file`. */
	deferred?: boolean;
}

function fakeLeaf(options: LeafOptions): WorkspaceLeaf {
	const containerEl = {
		ownerDocument: { defaultView: windowRef },
		closest: () => null,
	} as unknown as HTMLElement;

	const view = options.deferred
		? { getViewType: () => 'markdown', containerEl }
		: Object.assign(new FileViewClass(), { file: { path: options.path }, containerEl });

	return {
		view,
		parent: {},
		getViewState: () => ({
			type: 'markdown',
			pinned: options.pinned === true,
			state: { file: options.savedPath ?? options.path },
		}),
	} as unknown as WorkspaceLeaf;
}

function fakeApp(leaves: WorkspaceLeaf[], vaultPaths: string[]): App {
	// `isVaultFile` is an `instanceof TFile` check, so the index has to hold the
	// same class the tracker imported.
	const files = new Map<string, unknown>(vaultPaths.map((path) => [path, new TFile()]));
	return {
		vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null },
		workspace: {
			getMostRecentLeaf: () => leaves[0] ?? null,
			iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => void) => {
				for (const leaf of leaves) callback(leaf);
			},
		},
	} as unknown as App;
}

describe('a view that is being rebuilt', () => {
	interface Rebuildable {
		leaf: WorkspaceLeaf;
		/** The frame Obsidian swaps the view: same type, no file yet. */
		blankView(): void;
		/** The tab genuinely became an empty tab. */
		becomeEmpty(): void;
		/** The tab was reused for a view that holds no file. */
		becomeGraph(): void;
	}

	function rebuildableLeaf(path: string): Rebuildable {
		const containerEl = {
			ownerDocument: { defaultView: windowRef },
			closest: () => null,
		} as unknown as HTMLElement;

		let type = 'markdown';
		let saved: string | null = path;

		const leaf = {
			view: Object.assign(new FileViewClass(), { file: { path }, containerEl }),
			parent: {},
			getViewState: () => ({
				type,
				pinned: false,
				state: saved === null ? {} : { file: saved },
			}),
		} as unknown as WorkspaceLeaf;

		const swapView = (): void => {
			(leaf as unknown as { view: unknown }).view = {
				getViewType: () => type,
				containerEl,
			};
		};

		return {
			leaf,
			blankView() {
				swapView();
				saved = null;
			},
			becomeEmpty() {
				type = 'empty';
				saved = null;
				swapView();
			},
			becomeGraph() {
				type = 'graph';
				saved = null;
				swapView();
			},
		};
	}

	it('keeps the row instead of collapsing the list for a frame', () => {
		const handle = rebuildableLeaf('notes/a.md');
		const tracker = new PinTracker(fakeApp([handle.leaf], ['notes/a.md']));
		tracker.rescan();
		expect(listOpenTabs(tracker.snapshot.leaves, () => null)).toHaveLength(1);

		handle.blankView();
		tracker.rescan();

		const tabs = listOpenTabs(tracker.snapshot.leaves, () => null);
		expect(tabs).toHaveLength(1);
		expect(tabs[0]?.path).toBe('notes/a.md');
	});

	it('drops the row once the tab is really empty', () => {
		const handle = rebuildableLeaf('notes/a.md');
		const tracker = new PinTracker(fakeApp([handle.leaf], ['notes/a.md']));
		tracker.rescan();

		handle.becomeEmpty();
		tracker.rescan();

		expect(listOpenTabs(tracker.snapshot.leaves, () => null)).toHaveLength(0);
	});

	it('drops the row when the tab is reused for a file-less view', () => {
		const handle = rebuildableLeaf('notes/a.md');
		const tracker = new PinTracker(fakeApp([handle.leaf], ['notes/a.md']));
		tracker.rescan();

		handle.becomeGraph();
		tracker.rescan();

		expect(listOpenTabs(tracker.snapshot.leaves, () => null)).toHaveLength(0);
	});
});

describe('deferred tabs after a restart', () => {
	it('still reports a path, a vault file and the pinned flag', () => {
		const leaves = [
			fakeLeaf({ path: 'notes/a.md', pinned: true, deferred: true }),
			fakeLeaf({ path: 'notes/b.md', deferred: true }),
			fakeLeaf({ path: 'notes/c.md' }),
		];
		const tracker = new PinTracker(fakeApp(leaves, ['notes/a.md', 'notes/b.md', 'notes/c.md']));

		tracker.rescan();

		expect(tracker.snapshot.leaves.map((leaf) => leaf.path)).toEqual([
			'notes/a.md',
			'notes/b.md',
			'notes/c.md',
		]);
		expect(tracker.snapshot.leaves.every((leaf) => leaf.isVaultFile)).toBe(true);
		expect(tracker.snapshot.leaves.map((leaf) => leaf.pinned)).toEqual([true, false, false]);
		expect(tracker.isPinned('notes/a.md')).toBe(true);
	});

	it('fills the pinned, ungrouped and external sections', () => {
		const leaves = [
			fakeLeaf({ path: 'notes/a.md', pinned: true, deferred: true }),
			fakeLeaf({ path: 'notes/b.md', deferred: true }),
		];
		const tracker = new PinTracker(fakeApp(leaves, ['notes/a.md', 'notes/b.md']));
		tracker.rescan();

		const tabs = listOpenTabs(tracker.snapshot.leaves, () => null);

		expect(tabs.filter((entry) => entry.pinned)).toHaveLength(1);
		expect(tabs.filter((entry) => !entry.pinned && entry.isVaultFile)).toHaveLength(1);
		expect(tabs.filter((entry) => !entry.isVaultFile)).toHaveLength(0);
	});

	it('focuses the restored tab instead of opening a second copy', () => {
		const leaves = [fakeLeaf({ path: 'notes/a.md', deferred: true })];
		const tracker = new PinTracker(fakeApp(leaves, ['notes/a.md']));
		tracker.rescan();

		const windowId = tracker.windowIdOf(windowRef);
		const plan = planOpenMember('notes/a.md', windowId, tracker.snapshot.leaves);

		expect(plan.kind).toBe('focus');
		expect(tracker.leafById((plan as { leafId: string }).leafId)).toBe(leaves[0]);
	});

	it('prefers the live file over a saved state that lags a rename', () => {
		const leaves = [fakeLeaf({ path: 'notes/new.md', savedPath: 'notes/old.md' })];
		const tracker = new PinTracker(fakeApp(leaves, ['notes/new.md']));
		tracker.rescan();

		expect(tracker.snapshot.leaves[0]?.path).toBe('notes/new.md');
	});
});

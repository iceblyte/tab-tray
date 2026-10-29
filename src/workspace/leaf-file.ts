import type { ViewState, WorkspaceLeaf } from 'obsidian';

/**
 * Which file a leaf shows, whether or not its view has been built yet.
 *
 * Obsidian defers background tabs (1.7.2+): their `view` is a `DeferredView`
 * rather than the real `FileView`, so `view.file` is undefined until the tab is
 * shown. After a restart every restored tab except the active one is in that
 * state, which is why the open-tab lists came up empty and why "focus it if it
 * is already open" opened a second copy of the same file.
 *
 * The view state is what the layout was restored from, so it still names the
 * file while the view is deferred. The live `view.file` stays authoritative
 * when it exists, because that is the only value a rename updates immediately.
 */

export function leafState(leaf: WorkspaceLeaf): ViewState | null {
	try {
		return leaf.getViewState();
	} catch {
		// A leaf torn down mid-scan has no state left to report.
		return null;
	}
}

export function leafPath(
	leaf: WorkspaceLeaf,
	state: ViewState | null = leafState(leaf),
): string | null {
	const live = (leaf.view as { file?: { path?: unknown } } | undefined)?.file?.path;
	if (typeof live === 'string' && live.length > 0) return live;

	const saved = state?.state?.file;
	return typeof saved === 'string' && saved.length > 0 ? saved : null;
}

/** The view type survives deferral too, so "is this a blank tab" keeps working. */
export function leafViewType(
	leaf: WorkspaceLeaf,
	state: ViewState | null = leafState(leaf),
): string {
	return state?.type ?? '';
}

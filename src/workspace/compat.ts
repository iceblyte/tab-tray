import type { App } from 'obsidian';

/**
 * F4 / D18 — feature probe for the compact pinned row.
 *
 * Deliberately lenient: it only checks that a real editor tab header exposes the
 * inner container and the title element, because that is all the implementation
 * touches. Anything stricter (a specific icon element, a computed `display`)
 * produced false negatives on workspaces whose first header happened to be a
 * sidebar tab or a "new tab" button, which would disable the feature for
 * everyone.
 *
 * A negative answer still greys the switch out (P4 — degrade visibly), but the
 * probe must not cry wolf.
 */

export type CompactProbe =
	| { status: 'ok' }
	/** No editor tab header rendered yet — the workspace is still empty. */
	| { status: 'pending' }
	| { status: 'unsupported'; reason: string };

const HEADER_SELECTOR = '.workspace-tab-header';
const NEW_TAB_CLASS = 'workspace-tab-header-new-tab';
const INNER_SELECTOR = '.workspace-tab-header-inner';
const TITLE_SELECTOR = '.workspace-tab-header-inner-title';
const SIDEBAR_SELECTOR = '.mod-left-split, .mod-right-split';

export function probeCompactPinnedRow(app: App): CompactProbe {
	try {
		const doc = app.workspace.containerEl?.ownerDocument ?? activeDocument;
		const headers = Array.from(doc.querySelectorAll<HTMLElement>(HEADER_SELECTOR)).filter(
			(header) => !header.classList.contains(NEW_TAB_CLASS) && !header.closest(SIDEBAR_SELECTOR),
		);

		if (headers.length === 0) return { status: 'pending' };

		const header = headers[0];
		if (!header?.querySelector(INNER_SELECTOR)) {
			return { status: 'unsupported', reason: 'missing .workspace-tab-header-inner' };
		}
		if (!header.querySelector(TITLE_SELECTOR)) {
			return { status: 'unsupported', reason: 'missing .workspace-tab-header-inner-title' };
		}

		return { status: 'ok' };
	} catch (error) {
		return { status: 'unsupported', reason: String(error) };
	}
}

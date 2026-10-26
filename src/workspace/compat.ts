import type { App } from 'obsidian';

/**
 * F4 / D18 — two-level feature detection.
 *
 * The compact pinned row is the only part of the plugin that leans on internal
 * DOM. Everything here is a *probe*: it must never throw, and a negative answer
 * only greys out one switch (P4 — degrade, never crash).
 */

export const HEADER_SELECTOR = '.workspace-tab-header';
export const HEADER_INNER_SELECTOR = '.workspace-tab-header-inner';
export const HEADER_TITLE_SELECTOR = '.workspace-tab-header-inner-title';
export const HEADER_ICON_SELECTOR = '.workspace-tab-header-inner-icon';

export type CompactProbe =
	| { status: 'ok' }
	/** No tab header rendered yet — the workspace is still empty, ask again later. */
	| { status: 'pending' }
	| { status: 'unsupported'; reason: string };

export function probeCompactPinnedRow(app: App): CompactProbe {
	try {
		const doc = app.workspace.containerEl?.ownerDocument ?? activeDocument;
		const header = doc.querySelector<HTMLElement>(HEADER_SELECTOR);
		if (!header) return { status: 'pending' };

		const inner = header.querySelector(HEADER_INNER_SELECTOR);
		if (!inner) return { status: 'unsupported', reason: 'missing .workspace-tab-header-inner' };

		const title = header.querySelector(HEADER_TITLE_SELECTOR);
		if (!title)
			return { status: 'unsupported', reason: 'missing .workspace-tab-header-inner-title' };

		const icon = header.querySelector(HEADER_ICON_SELECTOR);
		if (!icon) return { status: 'unsupported', reason: 'missing .workspace-tab-header-inner-icon' };

		const style = doc.defaultView?.getComputedStyle(header);
		if (style && style.display !== 'flex') {
			return { status: 'unsupported', reason: 'tab header is not a flex item' };
		}

		return { status: 'ok' };
	} catch (error) {
		return { status: 'unsupported', reason: String(error) };
	}
}

import { addIcon } from 'obsidian';

/**
 * The plugin's own mark: three tab chips stacked with a slight offset.
 *
 * `archive` was the obvious stand-in, but it is also what several unrelated
 * plugins use, so the ribbon entry was indistinguishable from theirs. This is
 * drawn for the product instead — tabs collected into a stack — and checked at
 * 16/18 px, where a more literal "tray" composition collapsed into something
 * that read as a face.
 *
 * Only the inner shapes are registered. Obsidian wraps this string in its own
 * `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
 * stroke-linecap="round" stroke-linejoin="round">`, so anything outside that —
 * a nested `<svg>`, explicit colours, a different grid — would fight the host
 * and break theme colouring.
 */
export const TRAY_ICON_ID = 'tab-tray-mark';

const TRAY_ICON_SVG = [
	'<rect x="3.5" y="3.2" width="13" height="6" rx="3"/>',
	'<rect x="7.5" y="9" width="13" height="6" rx="3"/>',
	'<rect x="3.5" y="14.8" width="13" height="6" rx="3"/>',
].join('');

/** Idempotent: the host keeps one registry per id for the whole app session. */
export function registerTrayIcon(): void {
	addIcon(TRAY_ICON_ID, TRAY_ICON_SVG);
}

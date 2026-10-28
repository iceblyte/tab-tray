import { addIcon } from 'obsidian';

/**
 * The plugin's own mark: three tab chips stacked with a slight offset.
 *
 * `archive` was the obvious stand-in, but it is also what several unrelated
 * plugins use, so the ribbon entry was indistinguishable from theirs.
 *
 * Two host facts decide the shape of this string, both read out of the shipped
 * app rather than guessed:
 *
 * 1. `addIcon` writes into the legacy icon table, and that table is rendered
 *    into `<svg viewBox="0 0 100 100">` — not the 24 grid the Lucide set uses.
 *    Shapes drawn on 24 therefore land in the top-left corner as a speck.
 * 2. That wrapper sets no `fill` or `stroke`. The Lucide table gets
 *    `fill:none; stroke:currentColor` for free; a registered icon does not, so
 *    every shape has to carry its own paint or it renders as a black blob that
 *    vanishes in the dark theme.
 *
 * The content is a fragment, not a full `<svg>`: the host injects it with
 * `innerHTML` into the wrapper above, which is exactly how its own entries in
 * that table are stored.
 */
export const TRAY_ICON_ID = 'tab-tray-mark';

const PAINT = 'fill="none" stroke="currentColor" stroke-width="8"';

const TRAY_ICON_SVG = [
	`<rect x="16" y="8" width="52" height="20" rx="10" ${PAINT}/>`,
	`<rect x="32" y="40" width="52" height="20" rx="10" ${PAINT}/>`,
	`<rect x="16" y="72" width="52" height="20" rx="10" ${PAINT}/>`,
].join('');

/** Idempotent: the host keeps one registry entry per id for the whole session. */
export function registerTrayIcon(): void {
	addIcon(TRAY_ICON_ID, TRAY_ICON_SVG);
}

import type { ColorKey, Group } from '../core/types';
import { baseName } from './file-utils';

export type ColorIndex = Map<string, ColorKey>;

/**
 * The text Obsidian puts in a tab header.
 *
 * `FileView.getDisplayText()` returns `file.basename`, which drops the last
 * extension: `notes/a.md` is shown as `a`. An earlier index keyed on the full
 * basename, so no tab ever matched and colouring silently did nothing.
 */
export function tabDisplayName(path: string): string {
	const name = baseName(path);
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(0, dot) : name;
}

function resolve(groups: Group[], keyOf: (path: string) => string): ColorIndex {
	const resolved = new Map<string, ColorKey | null>();

	for (const group of groups) {
		for (const member of group.members) {
			const key = keyOf(member.path);
			const existing = resolved.get(key);
			if (existing === undefined) {
				resolved.set(key, group.color);
			} else if (existing !== group.color) {
				resolved.set(key, null);
			}
		}
	}

	const index: ColorIndex = new Map();
	for (const [key, color] of resolved) {
		if (color) index.set(key, color);
	}
	return index;
}

/**
 * Exact lookup: vault path → colour. Preferred whenever the tab header can be
 * paired with its leaf, because two files with the same basename in different
 * folders stay distinguishable.
 */
export function buildColorIndexByPath(groups: Group[]): ColorIndex {
	return resolve(groups, (path) => path);
}

/**
 * Fallback lookup: display name → colour, for headers whose leaf is not
 * reachable (for example a popout window outside `iterateAllLeaves`).
 *
 * A name that appears in two groups with different colours is ambiguous and is
 * left out entirely — a tab is never tinted with the wrong group's colour.
 */
export function buildColorIndex(groups: Group[]): ColorIndex {
	return resolve(groups, tabDisplayName);
}

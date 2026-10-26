import type { ColorKey, Group } from '../core/types';
import { baseName } from './file-utils';

export type ColorIndex = Map<string, ColorKey>;

/**
 * Maps a tab title (a file's basename) to the colour of the group that owns it.
 *
 * Tab headers only expose the display name, not the vault path, so colouring
 * works by name. A name that appears in two groups with different colours is
 * ambiguous and is left out entirely — a tab is never tinted with the wrong
 * group's colour.
 */
export function buildColorIndex(groups: Group[]): ColorIndex {
	const resolved = new Map<string, ColorKey | null>();

	for (const group of groups) {
		for (const member of group.members) {
			const name = baseName(member.path);
			const existing = resolved.get(name);
			if (existing === undefined) {
				resolved.set(name, group.color);
			} else if (existing !== group.color) {
				resolved.set(name, null);
			}
		}
	}

	const index: ColorIndex = new Map();
	for (const [name, color] of resolved) {
		if (color) index.set(name, color);
	}
	return index;
}

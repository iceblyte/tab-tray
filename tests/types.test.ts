import { describe, expect, it } from 'vitest';
import {
	COLOR_KEYS,
	createEmptyData,
	DEFAULT_SETTINGS,
	isColorKey,
	normalizeVaultPath,
	parseSettings,
	parseTrayData,
} from '../src/core/types';

describe('normalizeVaultPath', () => {
	it('converts Windows separators to POSIX', () => {
		expect(normalizeVaultPath('projects\\paper\\draft.md')).toBe('projects/paper/draft.md');
	});

	it('collapses repeated separators', () => {
		expect(normalizeVaultPath('a//b///c.md')).toBe('a/b/c.md');
	});

	it('strips leading and trailing slashes', () => {
		expect(normalizeVaultPath('/a/b/')).toBe('a/b');
		expect(normalizeVaultPath('///a.md')).toBe('a.md');
	});

	it('trims surrounding whitespace', () => {
		expect(normalizeVaultPath('  notes/today.md \n')).toBe('notes/today.md');
	});

	it('does not fold case (case-sensitive filesystems would collide)', () => {
		expect(normalizeVaultPath('A/B.md')).toBe('A/B.md');
		expect(normalizeVaultPath('a/b.md')).not.toBe(normalizeVaultPath('A/B.md'));
	});
});

describe('isColorKey', () => {
	it('accepts every palette entry', () => {
		for (const key of COLOR_KEYS) expect(isColorKey(key)).toBe(true);
	});

	it('rejects anything else', () => {
		expect(isColorKey('magenta')).toBe(false);
		expect(isColorKey(undefined)).toBe(false);
		expect(isColorKey(3)).toBe(false);
	});
});

describe('parseSettings', () => {
	it('repairs a non-object settings block with defaults', () => {
		expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
	});

	it('keeps valid values and repairs invalid ones field by field', () => {
		const settings = parseSettings({
			language: 'zh-CN',
			compactPinnedRow: 'yes',
			groupColors: false,
			softLimit: 0,
		});
		expect(settings.language).toBe('zh-CN');
		expect(settings.compactPinnedRow).toBe(DEFAULT_SETTINGS.compactPinnedRow);
		expect(settings.groupColors).toBe(false);
		expect(settings.softLimit).toBe(1);
	});
});

describe('parseTrayData', () => {
	const group = (id: string, paths: string[]) => ({
		id,
		name: id,
		color: 'blue',
		members: paths.map((path) => ({ path, addedAt: 1 })),
	});

	it('accepts a well-formed payload', () => {
		const data = parseTrayData({
			schemaVersion: 1,
			settings: { language: 'auto' },
			groups: [group('g1', ['a.md', 'b.md'])],
		});
		expect(data?.groups).toHaveLength(1);
		expect(data?.groups[0]?.members.map((m) => m.path)).toEqual(['a.md', 'b.md']);
	});

	it('rejects a payload whose groups are not an array', () => {
		expect(parseTrayData({ schemaVersion: 1, groups: {} })).toBeNull();
	});

	it('drops structurally invalid groups instead of losing the file', () => {
		const data = parseTrayData({
			schemaVersion: 1,
			groups: [group('g1', ['a.md']), { id: 'g2' }, group('g3', ['c.md'])],
		});
		expect(data?.groups.map((g) => g.id)).toEqual(['g1', 'g3']);
	});

	it('enforces R2 by keeping the first owner of a path', () => {
		const data = parseTrayData({
			schemaVersion: 1,
			groups: [group('g1', ['shared.md']), group('g2', ['shared.md', 'other.md'])],
		});
		expect(data?.groups[0]?.members).toHaveLength(1);
		expect(data?.groups[1]?.members.map((m) => m.path)).toEqual(['other.md']);
	});

	it('drops groups with duplicate ids', () => {
		const data = parseTrayData({
			schemaVersion: 1,
			groups: [group('dup', ['a.md']), group('dup', ['b.md'])],
		});
		expect(data?.groups).toHaveLength(1);
	});

	it('normalizes member paths on the way in', () => {
		const data = parseTrayData({
			schemaVersion: 1,
			groups: [group('g1', ['\\folder//note.md '])],
		});
		expect(data?.groups[0]?.members[0]?.path).toBe('folder/note.md');
	});
});

describe('createEmptyData', () => {
	it('starts with defaults and no groups', () => {
		const data = createEmptyData();
		expect(data.groups).toEqual([]);
		expect(data.settings).toEqual(DEFAULT_SETTINGS);
	});
});

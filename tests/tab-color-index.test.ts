import { describe, expect, it } from 'vitest';
import type { ColorKey, Group } from '../src/core/types';
import { buildColorIndex, buildColorIndexByPath, tabDisplayName } from '../src/ui/tab-color-index';

function group(id: string, color: ColorKey, paths: string[]): Group {
	return {
		id,
		name: id,
		color,
		members: paths.map((path) => ({ path, addedAt: 0 })),
	};
}

describe('tabDisplayName', () => {
	it('drops the last extension, matching FileView.getDisplayText', () => {
		expect(tabDisplayName('notes/a.md')).toBe('a');
		expect(tabDisplayName('deep/nested/report.final.pdf')).toBe('report.final');
	});

	it('keeps a dotfile intact', () => {
		expect(tabDisplayName('.gitignore')).toBe('.gitignore');
	});
});

describe('buildColorIndexByPath', () => {
	it('maps the exact path even when two files share a basename', () => {
		const index = buildColorIndexByPath([
			group('g1', 'blue', ['notes/a.md']),
			group('g2', 'green', ['archive/a.md']),
		]);

		expect(index.get('notes/a.md')).toBe('blue');
		expect(index.get('archive/a.md')).toBe('green');
	});

	it('ignores folder depth only as part of the path, not as a key', () => {
		const index = buildColorIndexByPath([group('g1', 'teal', ['deep/nested/report.md'])]);
		expect(index.get('deep/nested/report.md')).toBe('teal');
		expect(index.get('report.md')).toBeUndefined();
	});

	it('returns an empty index for no groups', () => {
		expect(buildColorIndexByPath([]).size).toBe(0);
	});
});

describe('buildColorIndex', () => {
	it('maps a tab title to its group colour', () => {
		const index = buildColorIndex([group('g1', 'blue', ['notes/a.md'])]);
		expect(index.get('a')).toBe('blue');
	});

	it('drops a title that two groups claim with different colours', () => {
		const index = buildColorIndex([
			group('g1', 'blue', ['notes/a.md']),
			group('g2', 'green', ['archive/a.md']),
		]);
		expect(index.has('a')).toBe(false);
	});

	it('keeps a title when both owners share the same colour', () => {
		const index = buildColorIndex([
			group('g1', 'blue', ['notes/a.md']),
			group('g2', 'blue', ['archive/a.md']),
		]);
		expect(index.get('a')).toBe('blue');
	});

	it('returns an empty index for no groups', () => {
		expect(buildColorIndex([]).size).toBe(0);
	});
});

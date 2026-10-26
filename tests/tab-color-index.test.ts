import { describe, expect, it } from 'vitest';
import type { ColorKey, Group } from '../src/core/types';
import { buildColorIndex } from '../src/ui/tab-color-index';

function group(id: string, color: ColorKey, paths: string[]): Group {
	return {
		id,
		name: id,
		color,
		members: paths.map((path) => ({ path, addedAt: 0 })),
	};
}

describe('buildColorIndex', () => {
	it('maps a tab title to its group colour', () => {
		const index = buildColorIndex([group('g1', 'blue', ['notes/a.md'])]);
		expect(index.get('a.md')).toBe('blue');
	});

	it('drops a title that two groups claim with different colours', () => {
		const index = buildColorIndex([
			group('g1', 'blue', ['notes/a.md']),
			group('g2', 'green', ['archive/a.md']),
		]);
		expect(index.has('a.md')).toBe(false);
	});

	it('keeps a title when both owners share the same colour', () => {
		const index = buildColorIndex([
			group('g1', 'blue', ['notes/a.md']),
			group('g2', 'blue', ['archive/a.md']),
		]);
		expect(index.get('a.md')).toBe('blue');
	});

	it('ignores folder depth and keeps extensions distinct', () => {
		const index = buildColorIndex([group('g1', 'teal', ['deep/nested/report.md', 'report.pdf'])]);
		expect(index.get('report.md')).toBe('teal');
		expect(index.get('report.pdf')).toBe('teal');
		expect(index.get('report')).toBeUndefined();
	});

	it('returns an empty index for no groups', () => {
		expect(buildColorIndex([]).size).toBe(0);
	});
});

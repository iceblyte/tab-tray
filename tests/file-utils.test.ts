import { describe, expect, it } from 'vitest';
import { baseName, displayName, folderOf, iconForPath } from '../src/ui/file-utils';

describe('displayName', () => {
	it('returns the last segment of a vault path', () => {
		expect(displayName('note.md')).toBe('note.md');
		expect(displayName('folder/note.md')).toBe('note.md');
		expect(displayName('a/b/c/note.md')).toBe('note.md');
	});

	it('strips the file: prefix from an external POSIX file', () => {
		expect(displayName('file:/Users/me/note.md')).toBe('note.md');
	});

	it('splits a Windows native path (P1-1)', () => {
		expect(displayName('file:C:\\notes\\note.md')).toBe('note.md');
		expect(displayName('C:\\notes\\note.md')).toBe('note.md');
		expect(displayName('C:/notes/note.md')).toBe('note.md');
	});

	it('splits a UNC path', () => {
		expect(displayName('file:\\\\server\\share\\note.md')).toBe('note.md');
	});

	it('falls back to the whole string when nothing follows a separator', () => {
		expect(displayName('folder/')).toBe('folder/');
	});

	it('keeps baseName as the same contract', () => {
		expect(baseName('file:C:\\notes\\note.md')).toBe('note.md');
	});
});

describe('iconForPath', () => {
	it('maps known extensions', () => {
		expect(iconForPath('a.canvas')).toBe('grid-2x2');
		expect(iconForPath('a.PNG')).toBe('image');
		expect(iconForPath('a.pdf')).toBe('file-type');
		expect(iconForPath('a.md')).toBe('file-text');
	});
});

describe('folderOf', () => {
	it('returns the parent folder or an empty string', () => {
		expect(folderOf('a/b/note.md')).toBe('a/b');
		expect(folderOf('note.md')).toBe('');
	});
});

import { describe, expect, it } from 'vitest';
import { isAbsolutePath, isExternalPath } from '../src/workspace/paths';

describe('isAbsolutePath', () => {
	it('recognises POSIX, Windows drive and UNC paths', () => {
		expect(isAbsolutePath('/Users/me/note.md')).toBe(true);
		expect(isAbsolutePath('C:\\notes\\note.md')).toBe(true);
		expect(isAbsolutePath('C:/notes/note.md')).toBe(true);
		expect(isAbsolutePath('\\\\server\\share\\note.md')).toBe(true);
	});

	it('keeps vault-relative paths relative', () => {
		expect(isAbsolutePath('note.md')).toBe(false);
		expect(isAbsolutePath('folder/note.md')).toBe(false);
		expect(isAbsolutePath('folder\\note.md')).toBe(false);
		expect(isAbsolutePath('.hidden/note.md')).toBe(false);
	});
});

describe('isExternalPath', () => {
	it('recognises Obsidian external-file pseudo-paths', () => {
		expect(isExternalPath('file:C:\\notes\\note.md')).toBe(true);
		expect(isExternalPath('file:/Users/me/note.md')).toBe(true);
		expect(isExternalPath('file://server/share/note.md')).toBe(true);
	});

	it('still recognises bare absolute paths', () => {
		expect(isExternalPath('/Users/me/note.md')).toBe(true);
		expect(isExternalPath('C:/notes/note.md')).toBe(true);
	});

	it('keeps vault paths inside the vault', () => {
		expect(isExternalPath('note.md')).toBe(false);
		expect(isExternalPath('folder/note.md')).toBe(false);
	});
});

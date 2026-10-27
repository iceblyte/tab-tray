import { describe, expect, it } from 'vitest';
import { isAbsolutePath } from '../src/workspace/paths';

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

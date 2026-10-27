/**
 * Vault paths are always relative to the vault root. Obsidian 1.14 can also
 * open files outside the vault; those carry an absolute path (POSIX, Windows
 * drive, or UNC). The distinction matters because an external file must never
 * be treated as a group member (R12).
 */
export function isAbsolutePath(path: string): boolean {
	return path.startsWith('/') || path.startsWith('\\\\') || /^[a-zA-Z]:[\\/]/.test(path);
}

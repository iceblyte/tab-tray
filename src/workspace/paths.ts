/**
 * Vault paths are always relative to the vault root.
 *
 * Obsidian 1.14 can also open files outside the vault. Those carry either a
 * `file:` pseudo-path (the actual representation) or, defensively, an absolute
 * path (POSIX, Windows drive, UNC). The distinction matters because an external
 * file must never be treated as a group member (R12).
 */
export function isAbsolutePath(path: string): boolean {
	return path.startsWith('/') || path.startsWith('\\\\') || /^[a-zA-Z]:[\\/]/.test(path);
}

/** True for anything that is not a vault-relative path. */
export function isExternalPath(path: string): boolean {
	return path.startsWith('file:') || isAbsolutePath(path);
}

/** Display helpers shared by both views. */

/**
 * The file name Obsidian would show for a path.
 *
 * Vault paths always use `/`, but a tab opened from outside the vault carries a
 * `file:` pseudo-path around a native path — `file:C:\notes\note.md` on Windows.
 * Splitting on `/` alone leaves the whole string intact, so the external
 * section listed `file:C:\notes\note.md` instead of `note.md`.
 */
export function displayName(path: string): string {
	const native = path.startsWith('file:') ? path.slice('file:'.length) : path;
	const parts = native.split(/[/\\]/);
	const last = parts[parts.length - 1];
	return last !== undefined && last.length > 0 ? last : path;
}

export function baseName(path: string): string {
	return displayName(path);
}

/** Native file-type icons only — v1 deliberately does not offer custom icons. */
export function iconForPath(path: string): string {
	const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();

	switch (extension) {
		case 'canvas':
			return 'grid-2x2';
		case 'png':
		case 'jpg':
		case 'jpeg':
		case 'gif':
		case 'webp':
		case 'svg':
		case 'bmp':
			return 'image';
		case 'pdf':
			return 'file-type';
		case 'mp3':
		case 'wav':
		case 'm4a':
		case 'ogg':
			return 'file-audio';
		case 'mp4':
		case 'webm':
		case 'mov':
			return 'video';
		default:
			return 'file-text';
	}
}

export function folderOf(path: string): string {
	const index = path.lastIndexOf('/');
	return index === -1 ? '' : path.slice(0, index);
}

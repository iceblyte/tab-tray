/** Display helpers shared by both views. */

export function baseName(path: string): string {
	const parts = path.split('/');
	return parts[parts.length - 1] ?? path;
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
			return 'audio-file';
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

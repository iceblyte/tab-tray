import { type App, TFile } from 'obsidian';
import { normalizeVaultPath } from '../core/types';

/**
 * F3-3 — files dragged from the file explorer into the sidebar.
 *
 * Obsidian has no documented drag payload, so two sources are tried in order
 * (V0c): the internal `dragManager.draggable` object, then `text/plain`. If
 * neither yields a vault path the drop is ignored and the user keeps the
 * right-click entry points (P4).
 */
export function readDroppedFiles(app: App, event: DragEvent): string[] {
	const paths: string[] = [];

	const manager = (app as unknown as { dragManager?: { draggable?: unknown } }).dragManager;
	collectFromDraggable(manager?.draggable, paths);

	if (paths.length === 0 && event.dataTransfer) {
		const text = event.dataTransfer.getData('text/plain');
		for (const raw of text.split(/\r?\n/)) {
			const candidate = normalizeVaultPath(raw);
			if (!candidate) continue;
			const file = app.vault.getAbstractFileByPath(candidate);
			if (file instanceof TFile) paths.push(file.path);
		}
	}

	return Array.from(new Set(paths));
}

function collectFromDraggable(draggable: unknown, out: string[]): void {
	if (!draggable || typeof draggable !== 'object') return;
	const record = draggable as Record<string, unknown>;

	if (record.file instanceof TFile) out.push(record.file.path);

	if (Array.isArray(record.files)) {
		for (const entry of record.files) {
			if (entry instanceof TFile) out.push(entry.path);
		}
	}
}

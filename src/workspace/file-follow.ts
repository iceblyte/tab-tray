import { type App, type TAbstractFile, TFile } from 'obsidian';
import type { TrayStore } from '../core/store';
import type { EventHost } from './host';

/**
 * F7 / R4 — follow the vault so group paths stay correct, and mark missing
 * members instead of deleting them.
 *
 * "Missing" is derived, never persisted: if the user moves the file back while
 * Obsidian is closed, the marker simply disappears on the next start (same
 * philosophy as R6 — anything rebuildable from the environment stays out of
 * data.json).
 */
export class FileFollow {
	readonly #app: App;
	readonly #store: TrayStore;
	readonly #missing = new Set<string>();
	readonly #listeners = new Set<() => void>();
	#scanTimer: number | null = null;

	constructor(app: App, store: TrayStore) {
		this.#app = app;
		this.#store = store;
	}

	start(host: EventHost): void {
		host.registerEvent(
			this.#app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
				this.#onRename(file, oldPath);
			}),
		);
		host.registerEvent(
			this.#app.vault.on('delete', (file: TAbstractFile) => {
				this.#onDelete(file);
			}),
		);
		host.registerEvent(
			this.#app.vault.on('create', (file: TAbstractFile) => {
				this.#onCreate(file);
			}),
		);

		// M5b: changes that happened while Obsidian was closed are caught by one
		// lazy pass, deliberately after startup so it never blocks the UI.
		this.#scanTimer = window.setTimeout(() => {
			this.#scanTimer = null;
			this.scan();
		}, 1500);
	}

	missing(): ReadonlySet<string> {
		return this.#missing;
	}

	onChange(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** One pass over every member path; cheap because the index is in memory. */
	scan(): void {
		let changed = false;
		for (const group of this.#store.snapshot().groups) {
			for (const member of group.members) {
				const exists = this.#app.vault.getAbstractFileByPath(member.path) instanceof TFile;
				if (exists && this.#missing.delete(member.path)) changed = true;
				if (!exists && !this.#missing.has(member.path)) {
					this.#missing.add(member.path);
					changed = true;
				}
			}
		}
		if (changed) this.#emit();
	}

	dispose(): void {
		if (this.#scanTimer !== null) window.clearTimeout(this.#scanTimer);
		this.#scanTimer = null;
		this.#listeners.clear();
	}

	// --------------------------------------------------------------- internals

	#onRename(file: TAbstractFile, oldPath: string): void {
		if (!(file instanceof TFile)) return;

		this.#store.applyMutation({ op: 'member.repath', oldPath, newPath: file.path });

		let changed = this.#missing.delete(oldPath);
		if (this.#missing.delete(file.path)) changed = true;
		if (changed) this.#emit();
	}

	#onDelete(file: TAbstractFile): void {
		if (!(file instanceof TFile)) return;
		if (!this.#isMember(file.path)) return;
		if (this.#missing.has(file.path)) return;

		this.#missing.add(file.path);
		this.#emit();
	}

	#onCreate(file: TAbstractFile): void {
		if (!(file instanceof TFile)) return;
		if (this.#missing.delete(file.path)) this.#emit();
	}

	#isMember(path: string): boolean {
		return this.#store
			.snapshot()
			.groups.some((group) => group.members.some((member) => member.path === path));
	}

	#emit(): void {
		for (const listener of this.#listeners) listener();
	}
}

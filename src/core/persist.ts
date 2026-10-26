import { migrate } from './migrate';
import type { ObsidianPort } from './port';
import { createEmptyData, type TrayData } from './types';

/**
 * F5 — the persistence engine. This is the reason the product exists, so every
 * branch here is defensive by construction (DESIGN §3.3.1):
 *
 *  - debounced (500 ms) with a max-wait so a burst of edits cannot starve the
 *    write forever (D14);
 *  - a single serial queue: at most one write in flight, ever;
 *  - `.bak` is rotated from the current main *before* the atomic replace, so at
 *    any instant at least one intact copy exists;
 *  - a load never overwrites a file it could not parse.
 */

export const MAIN_FILE = 'data.json';
export const BAK_FILE = 'data.json.bak';
export const CONFLICT_PATTERN = /^data\.sync-conflict-.*\.json$/i;

export const DEFAULT_DEBOUNCE_MS = 500;
export const DEFAULT_MAX_WAIT_MS = 2000;
export const DEFAULT_RETRY_DELAY_MS = 5000;

export type LoadSource = 'main' | 'bak' | 'conflict' | 'empty';

export interface LoadResult {
	data: TrayData;
	source: LoadSource;
	/** Writes are paused because the main file is unparsable (or too new). */
	readOnly: boolean;
	/** Absolute-or-vault path the data was actually read from. */
	fromFile?: string;
	/** The sync-conflict copy that won the election, if any. */
	conflictFile?: string;
}

export type PersistEvent =
	| { type: 'load-fallback'; from: string; source: 'bak' | 'conflict' }
	| { type: 'load-conflict'; file: string }
	| { type: 'load-unreadable' }
	| { type: 'load-future-version' }
	| { type: 'persist-error'; error: unknown; willRetry: boolean }
	| { type: 'persist-ok'; preservedAs?: string };

export interface PersistOptions {
	/** Plugin directory, e.g. `.obsidian/plugins/tab-tray`. */
	dir: string;
	debounceMs?: number;
	maxWaitMs?: number;
	retryDelayMs?: number;
}

type Candidate =
	| { ok: true; data: TrayData; mtime: number }
	| { ok: false; reason: 'missing' | 'unreadable' | 'invalid' | 'future' };

type Listener = (event: PersistEvent) => void;

export class PersistenceEngine {
	readonly #port: ObsidianPort;
	readonly #dir: string;
	readonly #debounceMs: number;
	readonly #maxWaitMs: number;
	readonly #retryDelayMs: number;

	#getData: (() => TrayData) | null = null;
	#debounceTimer: ReturnType<typeof setTimeout> | null = null;
	#retryTimer: ReturnType<typeof setTimeout> | null = null;
	#firstDirtyAt: number | null = null;
	#queue: Promise<void> = Promise.resolve();
	#readOnly = false;
	#readOnlyNotified = false;
	#mainHealthy = true;
	#listeners = new Set<Listener>();
	#disposed = false;

	constructor(port: ObsidianPort, options: PersistOptions) {
		this.#port = port;
		this.#dir = options.dir;
		this.#debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
		this.#maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
		this.#retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
	}

	get readOnly(): boolean {
		return this.#readOnly;
	}

	on(listener: Listener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** The engine pulls from this callback at write time, never at mark time. */
	bind(getData: () => TrayData): void {
		this.#getData = getData;
	}

	// ---------------------------------------------------------------- loading

	async load(): Promise<LoadResult> {
		const mainPath = this.#path(MAIN_FILE);
		const bakPath = this.#path(BAK_FILE);

		const main = await this.#readCandidate(mainPath);
		if (!main.ok && main.reason === 'future') {
			this.#readOnly = true;
			this.#emit({ type: 'load-future-version' });
			return { data: createEmptyData(), source: 'empty', readOnly: true, fromFile: mainPath };
		}

		const conflicts = await this.#listConflictFiles();

		if (conflicts.length > 0) {
			const bak = await this.#readCandidate(bakPath);
			const reads: Array<{ path: string; candidate: Candidate; source: LoadSource }> = [
				{ path: mainPath, candidate: main, source: 'main' },
				{ path: bakPath, candidate: bak, source: 'bak' },
			];
			for (const name of conflicts) {
				const path = this.#path(name);
				reads.push({ path, candidate: await this.#readCandidate(path), source: 'conflict' });
			}

			const parsable = reads
				.filter(
					(
						entry,
					): entry is {
						path: string;
						candidate: { ok: true; data: TrayData; mtime: number };
						source: LoadSource;
					} => entry.candidate.ok,
				)
				.sort((a, b) => b.candidate.mtime - a.candidate.mtime);

			const winner = parsable[0];
			if (!winner) {
				this.#readOnly = true;
				this.#emit({ type: 'load-unreadable' });
				return { data: createEmptyData(), source: 'empty', readOnly: true };
			}

			this.#mainHealthy = main.ok || main.reason === 'missing';

			if (winner.source !== 'main') {
				this.#emit({
					type: 'load-fallback',
					from: winner.path,
					source: winner.source === 'bak' ? 'bak' : 'conflict',
				});
			}
			if (winner.source === 'conflict') {
				this.#emit({ type: 'load-conflict', file: winner.path });
			}

			return {
				data: winner.candidate.data,
				source: winner.source,
				readOnly: false,
				fromFile: winner.path,
				conflictFile: winner.source === 'conflict' ? winner.path : undefined,
			};
		}

		if (main.ok) {
			this.#mainHealthy = true;
			return { data: main.data, source: 'main', readOnly: false, fromFile: mainPath };
		}

		const bak = await this.#readCandidate(bakPath);

		if (bak.ok) {
			this.#mainHealthy = main.reason === 'missing';
			this.#emit({ type: 'load-fallback', from: bakPath, source: 'bak' });
			return {
				data: bak.data,
				source: 'bak',
				readOnly: false,
				fromFile: bakPath,
			};
		}

		if (!bak.ok && bak.reason === 'future') {
			this.#readOnly = true;
			this.#emit({ type: 'load-future-version' });
			return { data: createEmptyData(), source: 'empty', readOnly: true };
		}

		// Main exists but is unparsable and there is no usable backup: protect it.
		const protectMain = !main.ok && main.reason === 'invalid';
		if (protectMain) {
			this.#readOnly = true;
			this.#emit({ type: 'load-unreadable' });
		}

		return {
			data: createEmptyData(),
			source: 'empty',
			readOnly: protectMain,
		};
	}

	// ----------------------------------------------------------------- writing

	markDirty(): void {
		if (this.#disposed) return;

		if (this.#readOnly) {
			if (!this.#readOnlyNotified) {
				this.#readOnlyNotified = true;
				this.#emit({
					type: 'persist-error',
					error: new Error('persistence paused'),
					willRetry: false,
				});
			}
			return;
		}

		const now = this.#port.now();
		if (this.#firstDirtyAt === null) this.#firstDirtyAt = now;

		if (this.#debounceTimer !== null) clearTimeout(this.#debounceTimer);

		const elapsed = now - this.#firstDirtyAt;
		const wait = Math.max(0, Math.min(this.#debounceMs, this.#maxWaitMs - elapsed));

		this.#debounceTimer = setTimeout(() => {
			this.#debounceTimer = null;
			this.#firstDirtyAt = null;
			this.#enqueue();
		}, wait);
	}

	/** Force a write now and wait for the queue to drain. */
	async flush(): Promise<void> {
		if (this.#debounceTimer !== null) {
			clearTimeout(this.#debounceTimer);
			this.#debounceTimer = null;
		}
		this.#firstDirtyAt = null;
		if (this.#readOnly) return;
		this.#enqueue();
		await this.#queue;
	}

	/** Wait for the in-flight write chain without scheduling a new one. */
	async settled(): Promise<void> {
		await this.#queue;
	}

	dispose(): void {
		this.#disposed = true;
		if (this.#debounceTimer !== null) clearTimeout(this.#debounceTimer);
		if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
		this.#debounceTimer = null;
		this.#retryTimer = null;
	}

	// ---------------------------------------------------------------- internals

	#enqueue(): void {
		this.#queue = this.#queue
			.then(() => this.#writeOnce())
			.catch((error: unknown) => {
				this.#emit({ type: 'persist-error', error, willRetry: true });
				this.#scheduleRetry();
			});
	}

	#scheduleRetry(): void {
		if (this.#disposed || this.#retryTimer !== null) return;
		this.#retryTimer = setTimeout(() => {
			this.#retryTimer = null;
			this.markDirty();
		}, this.#retryDelayMs);
	}

	async #writeOnce(): Promise<void> {
		const getData = this.#getData;
		if (!getData) return;

		const mainPath = this.#path(MAIN_FILE);
		const bakPath = this.#path(BAK_FILE);
		const json = `${JSON.stringify(getData(), null, 2)}\n`;

		let preservedAs: string | undefined;

		if (!this.#mainHealthy) {
			// The main file could not be parsed at load time. Keep the bytes
			// around for the user instead of silently replacing them.
			preservedAs = `${MAIN_FILE}.corrupt-${stamp(this.#port.now())}`;
			try {
				await this.#port.rename(mainPath, this.#path(preservedAs));
			} catch (error) {
				this.#port.log('[tab-tray] could not preserve corrupt data file', error);
				preservedAs = undefined;
			}
			this.#mainHealthy = true;
		} else {
			// Rotate first: `.bak` always holds the previous intact main file.
			try {
				if (await this.#port.exists(mainPath)) {
					const current = await this.#port.readText(mainPath);
					if (current.length > 0) await this.#port.writeText(bakPath, current);
				}
			} catch (error) {
				// A failed backup must never block the primary write.
				this.#port.log('[tab-tray] backup rotation failed', error);
			}
		}

		try {
			await this.#port.process(mainPath, () => json);
		} catch (error) {
			// Some adapters refuse `process()` on a path that does not exist yet
			// (first install). Creating the file once is enough; every later
			// write goes through the atomic path again.
			if (await this.#port.exists(mainPath)) throw error;
			await this.#port.writeText(mainPath, json);
		}

		this.#emit({ type: 'persist-ok', preservedAs });
	}

	async #listConflictFiles(): Promise<string[]> {
		try {
			const listing = await this.#port.list(this.#dir);
			return listing.files.filter((name) => CONFLICT_PATTERN.test(name)).sort();
		} catch {
			return [];
		}
	}

	async #readCandidate(path: string): Promise<Candidate> {
		try {
			const stat = await this.#port.stat(path);
			if (stat?.type !== 'file') return { ok: false, reason: 'missing' };

			const text = await this.#port.readText(path);
			let raw: unknown;
			try {
				raw = JSON.parse(text);
			} catch {
				return { ok: false, reason: 'invalid' };
			}

			const result = migrate(raw);
			if (!result.ok) {
				return { ok: false, reason: result.error === 'future-version' ? 'future' : 'invalid' };
			}

			return { ok: true, data: result.data, mtime: stat.mtime };
		} catch {
			return { ok: false, reason: 'unreadable' };
		}
	}

	#path(name: string): string {
		return `${this.#dir}/${name}`;
	}

	#emit(event: PersistEvent): void {
		for (const listener of this.#listeners) {
			try {
				listener(event);
			} catch (error) {
				this.#port.log('[tab-tray] persistence listener threw', error);
			}
		}
	}
}

function stamp(epochMs: number): string {
	return new Date(epochMs).toISOString().replace(/[:.]/g, '-');
}

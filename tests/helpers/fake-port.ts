import type { ObsidianPort, PortListing, PortStat } from '../../src/core/port';

export interface FakeFile {
	content: string;
	mtime: number;
}

export type FailOp = 'read' | 'write' | 'process' | 'stat' | 'rename' | 'list' | 'remove';

/**
 * In-memory `ObsidianPort` with injectable failures. This is what makes the
 * persistence engine's crash-safety claims testable without Obsidian (D9).
 */
export class FakePort implements ObsidianPort {
	readonly files = new Map<string, FakeFile>();
	readonly notices: string[] = [];
	readonly logs: string[] = [];
	readonly failures = new Map<string, Set<FailOp>>();

	processCount = 0;
	writeCount = 0;
	concurrentProcesses = 0;
	maxConcurrentProcesses = 0;

	#mtime = 1000;

	seed(path: string, content: string, mtime?: number): void {
		this.files.set(path, { content, mtime: mtime ?? ++this.#mtime });
	}

	fail(path: string, op: FailOp): void {
		const set = this.failures.get(path) ?? new Set<FailOp>();
		set.add(op);
		this.failures.set(path, set);
	}

	heal(path: string, op?: FailOp): void {
		if (!op) {
			this.failures.delete(path);
			return;
		}
		this.failures.get(path)?.delete(op);
	}

	async readText(path: string): Promise<string> {
		this.#guard(path, 'read');
		const file = this.files.get(path);
		if (!file) throw new Error(`ENOENT ${path}`);
		return file.content;
	}

	async writeText(path: string, data: string): Promise<void> {
		this.#guard(path, 'write');
		this.writeCount += 1;
		this.files.set(path, { content: data, mtime: ++this.#mtime });
	}

	async process(path: string, fn: (data: string) => string): Promise<string> {
		this.#guard(path, 'process');
		this.processCount += 1;
		this.concurrentProcesses += 1;
		this.maxConcurrentProcesses = Math.max(this.maxConcurrentProcesses, this.concurrentProcesses);
		try {
			// Yield twice so a second concurrent write would interleave here.
			await Promise.resolve();
			await Promise.resolve();
			const next = fn(this.files.get(path)?.content ?? '');
			this.files.set(path, { content: next, mtime: ++this.#mtime });
			return next;
		} finally {
			this.concurrentProcesses -= 1;
		}
	}

	async list(path: string): Promise<PortListing> {
		this.#guard(path, 'list');
		const prefix = path.endsWith('/') ? path : `${path}/`;
		const files: string[] = [];
		const folders = new Set<string>();

		for (const key of this.files.keys()) {
			if (!key.startsWith(prefix)) continue;
			const rest = key.slice(prefix.length);
			const slash = rest.indexOf('/');
			if (slash === -1) files.push(rest);
			else folders.add(rest.slice(0, slash));
		}

		return { files, folders: Array.from(folders) };
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path);
	}

	async stat(path: string): Promise<PortStat | null> {
		this.#guard(path, 'stat');
		const file = this.files.get(path);
		if (!file) return null;
		return { mtime: file.mtime, size: file.content.length, type: 'file' };
	}

	async remove(path: string): Promise<void> {
		this.#guard(path, 'remove');
		this.files.delete(path);
	}

	async rename(from: string, to: string): Promise<void> {
		this.#guard(from, 'rename');
		const file = this.files.get(from);
		if (!file) throw new Error(`ENOENT ${from}`);
		this.files.delete(from);
		this.files.set(to, file);
	}

	notice(message: string): void {
		this.notices.push(message);
	}

	now(): number {
		return Date.now();
	}

	log(message: string, ...args: unknown[]): void {
		this.logs.push([message, ...args.map(String)].join(' '));
	}

	#guard(path: string, op: FailOp): void {
		if (this.failures.get(path)?.has(op)) {
			throw new Error(`injected ${op} failure for ${path}`);
		}
	}
}

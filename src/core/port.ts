/**
 * The only surface through which the core layer talks to the host (D9).
 *
 * Persistence is the one part of the plugin that must be provable, so it takes
 * this interface instead of importing `obsidian`: a fake port backed by an
 * in-memory filesystem makes every failure path testable in plain Node.
 */

export interface PortStat {
	mtime: number;
	size: number;
	type: 'file' | 'folder';
}

export interface PortListing {
	files: string[];
	folders: string[];
}

export interface ObsidianPort {
	/** Read a text file. Rejects when the file is missing. */
	readText(path: string): Promise<string>;
	/** Write a text file (non-atomic; used for the `.bak` copy only). */
	writeText(path: string, data: string): Promise<void>;
	/** H6: read-modify-write through `DataAdapter.process` (atomic replace). */
	process(path: string, fn: (data: string) => string): Promise<string>;
	list(path: string): Promise<PortListing>;
	exists(path: string): Promise<boolean>;
	stat(path: string): Promise<PortStat | null>;
	remove(path: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	notice(message: string): void;
	now(): number;
	log(message: string, ...args: unknown[]): void;
}

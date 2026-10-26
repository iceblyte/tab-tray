import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BAK_FILE, MAIN_FILE, type PersistEvent, PersistenceEngine } from '../src/core/persist';
import { createEmptyData, type Group, type TrayData } from '../src/core/types';
import { FakePort } from './helpers/fake-port';

const DIR = 'plugins/tab-tray';
const MAIN = `${DIR}/${MAIN_FILE}`;
const BAK = `${DIR}/${BAK_FILE}`;
const CONFLICT = `${DIR}/data.sync-conflict-2026-10-25-120000-ABCDEF.json`;

function json(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function group(id: string): Group {
	return { id, name: id, color: 'blue', members: [] };
}

function makeData(ids: string[] = []): TrayData {
	return { ...createEmptyData(), groups: ids.map(group) };
}

function makeEngine(port: FakePort): PersistenceEngine {
	return new PersistenceEngine(port, { dir: DIR });
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('load — normal paths', () => {
	it('loads the main file', async () => {
		const port = new FakePort();
		port.seed(MAIN, json(makeData(['g1'])));

		const result = await makeEngine(port).load();

		expect(result.source).toBe('main');
		expect(result.readOnly).toBe(false);
		expect(result.data.groups.map((g) => g.id)).toEqual(['g1']);
	});

	it('starts empty on a fresh install without marking itself read-only', async () => {
		const port = new FakePort();
		const result = await makeEngine(port).load();

		expect(result.source).toBe('empty');
		expect(result.readOnly).toBe(false);
		expect(result.data.groups).toEqual([]);
	});

	it('falls back to the backup when the main file is corrupt', async () => {
		const port = new FakePort();
		port.seed(MAIN, '{ this is not json');
		port.seed(BAK, json(makeData(['from-bak'])));

		const engine = makeEngine(port);
		const events: PersistEvent[] = [];
		engine.on((event) => events.push(event));

		const result = await engine.load();

		expect(result.source).toBe('bak');
		expect(result.readOnly).toBe(false);
		expect(result.data.groups.map((g) => g.id)).toEqual(['from-bak']);
		expect(events.some((e) => e.type === 'load-fallback')).toBe(true);
	});

	it('refuses to load data written by a newer plugin version', async () => {
		const port = new FakePort();
		port.seed(MAIN, json({ schemaVersion: 99, groups: [] }));

		const engine = makeEngine(port);
		const events: PersistEvent[] = [];
		engine.on((event) => events.push(event));

		const result = await engine.load();

		expect(result.readOnly).toBe(true);
		expect(result.source).toBe('empty');
		expect(events.some((e) => e.type === 'load-future-version')).toBe(true);
	});

	it('pauses writes and keeps the file when nothing can be parsed (M9)', async () => {
		const port = new FakePort();
		port.seed(MAIN, 'garbage');
		port.seed(BAK, 'also garbage');

		const engine = makeEngine(port);
		const result = await engine.load();
		engine.bind(() => makeData(['new']));

		engine.markDirty();
		await vi.advanceTimersByTimeAsync(3000);

		expect(result.readOnly).toBe(true);
		expect(port.processCount).toBe(0);
		expect(port.files.get(MAIN)?.content).toBe('garbage');
	});
});

describe('load — sync conflict arbitration (M7)', () => {
	it('picks the newest parsable copy when a conflict file exists', async () => {
		const port = new FakePort();
		port.seed(MAIN, json(makeData(['main'])), 100);
		port.seed(BAK, json(makeData(['bak'])), 200);
		port.seed(CONFLICT, json(makeData(['conflict'])), 300);

		const engine = makeEngine(port);
		const events: PersistEvent[] = [];
		engine.on((event) => events.push(event));

		const result = await engine.load();

		expect(result.source).toBe('conflict');
		expect(result.conflictFile).toBe(CONFLICT);
		expect(result.data.groups.map((g) => g.id)).toEqual(['conflict']);
		expect(events.some((e) => e.type === 'load-conflict')).toBe(true);
	});

	it('keeps the main file when it is the newest', async () => {
		const port = new FakePort();
		port.seed(MAIN, json(makeData(['main'])), 500);
		port.seed(CONFLICT, json(makeData(['conflict'])), 100);

		const result = await makeEngine(port).load();

		expect(result.source).toBe('main');
		expect(result.data.groups.map((g) => g.id)).toEqual(['main']);
	});

	it('never deletes or renames the conflict copy', async () => {
		const port = new FakePort();
		port.seed(MAIN, json(makeData(['main'])), 100);
		port.seed(CONFLICT, json(makeData(['conflict'])), 300);

		const engine = makeEngine(port);
		await engine.load();
		engine.bind(() => makeData(['after-write']));
		await engine.flush();

		expect(port.files.has(CONFLICT)).toBe(true);
	});
});

describe('write path (F5)', () => {
	it('debounces a burst of changes into a single write', async () => {
		const port = new FakePort();
		port.seed(MAIN, json(makeData()));

		const engine = makeEngine(port);
		await engine.load();
		engine.bind(() => makeData(['g1']));

		engine.markDirty();
		engine.markDirty();
		engine.markDirty();

		await vi.advanceTimersByTimeAsync(499);
		expect(port.processCount).toBe(0);

		await vi.advanceTimersByTimeAsync(2);
		await engine.settled();

		expect(port.processCount).toBe(1);
		expect(JSON.parse(port.files.get(MAIN)?.content ?? '{}').groups).toHaveLength(1);
	});

	it('forces a write at maxWait even while edits keep arriving (D14)', async () => {
		const port = new FakePort();
		port.seed(MAIN, json(makeData()));

		const engine = makeEngine(port);
		await engine.load();
		engine.bind(() => makeData(['g1']));

		for (let i = 0; i < 4; i += 1) {
			engine.markDirty();
			await vi.advanceTimersByTimeAsync(400);
		}

		engine.markDirty();
		await vi.advanceTimersByTimeAsync(399);
		expect(port.processCount).toBe(0);

		await vi.advanceTimersByTimeAsync(1);
		await engine.settled();
		expect(port.processCount).toBe(1);
	});

	it('rotates the previous main content into .bak before replacing', async () => {
		const port = new FakePort();
		const previous = json(makeData(['old']));
		port.seed(MAIN, previous);

		const engine = makeEngine(port);
		await engine.load();
		engine.bind(() => makeData(['new']));
		await engine.flush();

		expect(port.files.get(BAK)?.content).toBe(previous);
		expect(JSON.parse(port.files.get(MAIN)?.content ?? '{}').groups[0].id).toBe('new');
	});

	it('writes the main file even when the backup cannot be written', async () => {
		const port = new FakePort();
		port.seed(MAIN, json(makeData(['old'])));
		port.fail(BAK, 'write');

		const engine = makeEngine(port);
		await engine.load();
		engine.bind(() => makeData(['new']));
		await engine.flush();

		expect(JSON.parse(port.files.get(MAIN)?.content ?? '{}').groups[0].id).toBe('new');
	});

	it('emits persist-error and keeps the in-memory state when the write fails', async () => {
		const port = new FakePort();
		port.seed(MAIN, json(makeData()));
		port.fail(MAIN, 'process');

		const engine = makeEngine(port);
		const events: PersistEvent[] = [];
		engine.on((event) => events.push(event));
		await engine.load();

		const data = makeData(['g1']);
		engine.bind(() => data);

		engine.markDirty();
		await vi.advanceTimersByTimeAsync(600);
		await engine.settled();

		expect(events.some((e) => e.type === 'persist-error')).toBe(true);
		expect(port.files.get(MAIN)?.content).not.toContain('g1');
		expect(data.groups).toHaveLength(1);
	});

	it('never runs two writes at once', async () => {
		const port = new FakePort();
		port.seed(MAIN, json(makeData()));

		const engine = makeEngine(port);
		await engine.load();
		engine.bind(() => makeData(['g1']));

		await Promise.all([engine.flush(), engine.flush(), engine.flush()]);

		expect(port.maxConcurrentProcesses).toBe(1);
		expect(port.processCount).toBe(3);
	});

	it('preserves an unparsable main file instead of overwriting it', async () => {
		const port = new FakePort();
		port.seed(MAIN, '{ broken');
		port.seed(BAK, json(makeData(['from-bak'])));

		const engine = makeEngine(port);
		await engine.load();
		engine.bind(() => makeData(['recovered']));
		await engine.flush();

		const corruptKey = Array.from(port.files.keys()).find((key) => key.includes('.corrupt-'));
		expect(corruptKey).toBeDefined();
		expect(port.files.get(corruptKey ?? '')?.content).toBe('{ broken');
		expect(JSON.parse(port.files.get(MAIN)?.content ?? '{}').groups[0].id).toBe('recovered');
	});

	it('stops writing after dispose', async () => {
		const port = new FakePort();
		port.seed(MAIN, json(makeData()));

		const engine = makeEngine(port);
		await engine.load();
		engine.bind(() => makeData(['g1']));
		engine.dispose();

		engine.markDirty();
		await vi.advanceTimersByTimeAsync(3000);

		expect(port.processCount).toBe(0);
	});
});

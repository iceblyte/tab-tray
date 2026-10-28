import { describe, expect, it, vi } from 'vitest';
import { type MemberGate, type StoreNotice, TrayStore } from '../src/core/store';
import { createEmptyData } from '../src/core/types';

function makeStore(options: { gate?: MemberGate; softLimit?: number } = {}): TrayStore {
	let counter = 0;
	const data = createEmptyData();
	if (options.softLimit !== undefined) data.settings.softLimit = options.softLimit;

	return new TrayStore(data, {
		idFactory: () => `g${++counter}`,
		now: () => 1_700_000_000_000,
		gate: options.gate,
	});
}

function addGroup(store: TrayStore, name = 'Research'): string {
	const result = store.applyMutation({ op: 'group.create', name, color: 'blue' });
	expect(result.ok).toBe(true);
	const groups = store.snapshot().groups;
	return groups[groups.length - 1]?.id ?? '';
}

describe('group mutations', () => {
	it('creates a group with a generated id and a trimmed name', () => {
		const store = makeStore();
		const id = addGroup(store, '  Research  ');

		expect(store.snapshot().groups).toHaveLength(1);
		expect(store.snapshot().groups[0]).toMatchObject({ id, name: 'Research', color: 'blue' });
	});

	it('rejects an empty name', () => {
		const store = makeStore();
		expect(store.applyMutation({ op: 'group.create', name: '   ', color: 'blue' })).toEqual({
			ok: false,
			error: 'invalid-name',
		});
	});

	it('allows duplicate names because everything resolves by id', () => {
		const store = makeStore();
		addGroup(store, 'Notes');
		addGroup(store, 'Notes');
		expect(store.snapshot().groups).toHaveLength(2);
	});

	it('renames, recolours and deletes', () => {
		const store = makeStore();
		const id = addGroup(store);

		expect(store.applyMutation({ op: 'group.rename', groupId: id, name: 'Writing' }).ok).toBe(true);
		expect(store.applyMutation({ op: 'group.recolor', groupId: id, color: 'green' }).ok).toBe(true);
		expect(store.snapshot().groups[0]).toMatchObject({ name: 'Writing', color: 'green' });

		expect(store.applyMutation({ op: 'group.delete', groupId: id }).ok).toBe(true);
		expect(store.snapshot().groups).toHaveLength(0);
	});

	it('rejects unknown groups', () => {
		const store = makeStore();
		expect(store.applyMutation({ op: 'group.rename', groupId: 'nope', name: 'x' })).toEqual({
			ok: false,
			error: 'group-not-found',
		});
	});

	it('reorders groups only for a full permutation', () => {
		const store = makeStore();
		const a = addGroup(store, 'A');
		const b = addGroup(store, 'B');

		expect(store.applyMutation({ op: 'group.reorder', order: [b, a] }).ok).toBe(true);
		expect(store.snapshot().groups.map((g) => g.id)).toEqual([b, a]);

		expect(store.applyMutation({ op: 'group.reorder', order: [b] })).toEqual({
			ok: false,
			error: 'invalid-order',
		});
		expect(store.applyMutation({ op: 'group.reorder', order: [b, 'ghost'] })).toEqual({
			ok: false,
			error: 'invalid-order',
		});
	});
});

describe('member mutations', () => {
	it('adds members and is idempotent', () => {
		const store = makeStore();
		const id = addGroup(store);

		store.applyMutation({ op: 'member.add', groupId: id, path: 'notes/a.md' });
		store.applyMutation({ op: 'member.add', groupId: id, path: 'notes/a.md' });

		expect(store.snapshot().groups[0]?.members).toHaveLength(1);
	});

	it('normalizes paths before storing them', () => {
		const store = makeStore();
		const id = addGroup(store);
		store.applyMutation({ op: 'member.add', groupId: id, path: '\\notes//a.md ' });
		expect(store.snapshot().groups[0]?.members[0]?.path).toBe('notes/a.md');
	});

	it('rejects an empty path', () => {
		const store = makeStore();
		const id = addGroup(store);
		expect(store.applyMutation({ op: 'member.add', groupId: id, path: '   ' })).toEqual({
			ok: false,
			error: 'invalid-path',
		});
	});

	it('moves a file that already belongs to another group and reports it (R2/D11)', () => {
		const store = makeStore();
		const from = addGroup(store, 'Research');
		const to = addGroup(store, 'Writing');
		store.applyMutation({ op: 'member.add', groupId: from, path: 'a.md' });

		const notices: StoreNotice[] = [];
		store.on('notice', (notice) => notices.push(notice));

		expect(store.applyMutation({ op: 'member.add', groupId: to, path: 'a.md' }).ok).toBe(true);

		const [research, writing] = store.snapshot().groups;
		expect(research?.members).toHaveLength(0);
		expect(writing?.members.map((m) => m.path)).toEqual(['a.md']);
		expect(notices[0]).toMatchObject({
			type: 'moved',
			fromGroupName: 'Research',
			toGroupId: to,
		});
	});

	it('refuses pinned files through the injected gate (R5)', () => {
		const gate: MemberGate = { check: (path) => (path === 'pinned.md' ? 'pinned' : null) };
		const store = makeStore({ gate });
		const id = addGroup(store);

		expect(store.applyMutation({ op: 'member.add', groupId: id, path: 'pinned.md' })).toEqual({
			ok: false,
			error: 'pinned',
		});
		expect(store.snapshot().groups[0]?.members).toHaveLength(0);
	});

	it('refuses out-of-vault files through the injected gate (R12)', () => {
		const gate: MemberGate = { check: (path) => (path === 'C:/tmp/x.md' ? 'external' : null) };
		const store = makeStore({ gate });
		const id = addGroup(store);

		expect(store.applyMutation({ op: 'member.add', groupId: id, path: 'C:/tmp/x.md' })).toEqual({
			ok: false,
			error: 'external',
		});
	});

	it('removes members and reports a rejected mutation', () => {
		const store = makeStore();
		const id = addGroup(store);
		store.applyMutation({ op: 'member.add', groupId: id, path: 'a.md' });
		store.applyMutation({ op: 'member.remove', groupId: id, path: 'a.md' });
		expect(store.snapshot().groups[0]?.members).toHaveLength(0);

		const rejects: string[] = [];
		store.on('reject', (reason) => rejects.push(reason));
		store.applyMutation({ op: 'group.delete', groupId: 'missing' });
		expect(rejects).toEqual(['group-not-found']);
	});

	it('reorders members only for a full permutation', () => {
		const store = makeStore();
		const id = addGroup(store);
		for (const path of ['a.md', 'b.md', 'c.md']) {
			store.applyMutation({ op: 'member.add', groupId: id, path });
		}

		expect(
			store.applyMutation({ op: 'member.reorder', groupId: id, order: ['c.md', 'a.md', 'b.md'] })
				.ok,
		).toBe(true);
		expect(store.snapshot().groups[0]?.members.map((m) => m.path)).toEqual([
			'c.md',
			'a.md',
			'b.md',
		]);

		expect(
			store.applyMutation({ op: 'member.reorder', groupId: id, order: ['a.md', 'b.md'] }),
		).toEqual({ ok: false, error: 'invalid-order' });
	});

	it('keeps the in-group order stable when a path is renamed (F7)', () => {
		const store = makeStore();
		const id = addGroup(store);
		for (const path of ['a.md', 'b.md', 'c.md']) {
			store.applyMutation({ op: 'member.add', groupId: id, path });
		}

		store.applyMutation({ op: 'member.repath', oldPath: 'b.md', newPath: 'folder/b.md' });

		expect(store.snapshot().groups[0]?.members.map((m) => m.path)).toEqual([
			'a.md',
			'folder/b.md',
			'c.md',
		]);
	});

	it('drops the stale entry when a rename collides with a tracked path', () => {
		const store = makeStore();
		const id = addGroup(store);
		store.applyMutation({ op: 'member.add', groupId: id, path: 'a.md' });
		store.applyMutation({ op: 'member.add', groupId: id, path: 'b.md' });

		store.applyMutation({ op: 'member.repath', oldPath: 'a.md', newPath: 'b.md' });

		expect(store.snapshot().groups[0]?.members.map((m) => m.path)).toEqual(['b.md']);
	});
});

describe('soft limit (R9)', () => {
	it('allows the overflow and warns exactly once', () => {
		const store = makeStore({ softLimit: 2 });
		const id = addGroup(store);
		const notices: StoreNotice[] = [];
		store.on('notice', (notice) => notices.push(notice));

		for (const path of ['a.md', 'b.md', 'c.md']) {
			expect(store.applyMutation({ op: 'member.add', groupId: id, path }).ok).toBe(true);
		}

		expect(store.snapshot().groups[0]?.members).toHaveLength(3);
		expect(notices.filter((n) => n.type === 'soft-limit')).toHaveLength(1);
	});

	it('warns again after the group drops back under the limit', () => {
		const store = makeStore({ softLimit: 1 });
		const id = addGroup(store);
		const notices: StoreNotice[] = [];
		store.on('notice', (notice) => notices.push(notice));

		store.applyMutation({ op: 'member.add', groupId: id, path: 'a.md' });
		store.applyMutation({ op: 'member.add', groupId: id, path: 'b.md' });
		store.applyMutation({ op: 'member.remove', groupId: id, path: 'b.md' });
		store.applyMutation({ op: 'member.add', groupId: id, path: 'c.md' });

		expect(notices.filter((n) => n.type === 'soft-limit')).toHaveLength(2);
	});
});

describe('settings and change events', () => {
	it('clamps the soft limit into range', () => {
		const store = makeStore();
		store.applyMutation({ op: 'settings.update', patch: { softLimit: 10_000 } });
		expect(store.snapshot().settings.softLimit).toBe(999);

		store.applyMutation({ op: 'settings.update', patch: { softLimit: -4 } });
		expect(store.snapshot().settings.softLimit).toBe(1);
	});

	it('rejects an invalid language', () => {
		const store = makeStore();
		expect(
			store.applyMutation({
				op: 'settings.update',
				patch: { language: 'fr' as unknown as 'en' },
			}),
		).toEqual({ ok: false, error: 'invalid-setting' });
	});

	it('hands out a new snapshot reference on every change (D20)', () => {
		const store = makeStore();
		const before = store.snapshot();
		const listener = vi.fn();
		store.on('change', listener);

		addGroup(store);

		expect(store.snapshot()).not.toBe(before);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('does not emit change for a rejected mutation', () => {
		const store = makeStore();
		const listener = vi.fn();
		store.on('change', listener);
		store.applyMutation({ op: 'group.rename', groupId: 'nope', name: 'x' });
		expect(listener).not.toHaveBeenCalled();
	});
});

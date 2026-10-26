import {
	type ColorKey,
	findGroup,
	findGroupOfPath,
	type Group,
	isColorKey,
	isLanguage,
	MAX_SOFT_LIMIT,
	type Member,
	MIN_SOFT_LIMIT,
	normalizeVaultPath,
	type Settings,
	type TrayData,
} from './types';

/**
 * P6 — every entry point (six member entries, commands, settings, drag & drop)
 * is translated into one of these value objects and funnelled through
 * `applyMutation`. Invariants are enforced here, never in the UI, so all entry
 * points behave identically by construction.
 */
export type Mutation =
	| { op: 'group.create'; name: string; color: ColorKey; id?: string }
	| { op: 'group.rename'; groupId: string; name: string }
	| { op: 'group.recolor'; groupId: string; color: ColorKey }
	| { op: 'group.delete'; groupId: string }
	| { op: 'group.reorder'; order: string[] }
	| { op: 'member.add'; groupId: string; path: string }
	| { op: 'member.remove'; groupId: string; path: string }
	| { op: 'member.move'; from: string; to: string; path: string }
	| { op: 'member.reorder'; groupId: string; order: string[] }
	| { op: 'member.repath'; oldPath: string; newPath: string }
	| { op: 'settings.update'; patch: Partial<Settings> };

export type RejectReason =
	| 'group-not-found'
	| 'duplicate-id'
	| 'invalid-name'
	| 'invalid-color'
	| 'invalid-path'
	| 'invalid-order'
	| 'invalid-setting'
	/** R5: the tab is natively pinned, so it cannot join a group. */
	| 'pinned'
	/** R12: files outside the vault have no durable path. */
	| 'external';

/** R5 / R12 are decided by the host (pin state, vault index) and injected. */
export type AddBlockReason = 'pinned' | 'external';

export interface MemberGate {
	check(path: string): AddBlockReason | null;
}

export const ALLOW_ALL_GATE: MemberGate = { check: () => null };

export type StoreNotice =
	| {
			type: 'moved';
			path: string;
			fromGroupId: string;
			fromGroupName: string;
			toGroupId: string;
	  }
	| { type: 'soft-limit'; groupId: string; count: number; limit: number };

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

type Unsubscribe = () => void;

export interface StoreOptions {
	gate?: MemberGate;
	idFactory?: () => string;
	now?: () => number;
}

export class TrayStore {
	#data: TrayData;
	readonly #gate: MemberGate;
	readonly #idFactory: () => string;
	readonly #now: () => number;

	#warned = new Set<string>();
	#changeListeners = new Set<(data: TrayData) => void>();
	#rejectListeners = new Set<(reason: RejectReason, mutation: Mutation) => void>();
	#noticeListeners = new Set<(notice: StoreNotice) => void>();

	constructor(data: TrayData, options: StoreOptions = {}) {
		this.#data = data;
		this.#gate = options.gate ?? ALLOW_ALL_GATE;
		this.#idFactory = options.idFactory ?? (() => crypto.randomUUID());
		this.#now = options.now ?? (() => Date.now());
	}

	/**
	 * A fresh object on every successful mutation, so subscribers can do a
	 * single reference assignment (D20) and let Svelte's keyed `each` do the
	 * minimal DOM work.
	 */
	snapshot(): TrayData {
		return this.#data;
	}

	on(event: 'change', listener: (data: TrayData) => void): Unsubscribe;
	on(event: 'reject', listener: (reason: RejectReason, mutation: Mutation) => void): Unsubscribe;
	on(event: 'notice', listener: (notice: StoreNotice) => void): Unsubscribe;
	on(
		event: 'change' | 'reject' | 'notice',
		listener:
			| ((data: TrayData) => void)
			| ((reason: RejectReason, mutation: Mutation) => void)
			| ((notice: StoreNotice) => void),
	): Unsubscribe {
		if (event === 'change') {
			const cb = listener as (data: TrayData) => void;
			this.#changeListeners.add(cb);
			return () => this.#changeListeners.delete(cb);
		}
		if (event === 'reject') {
			const cb = listener as (reason: RejectReason, mutation: Mutation) => void;
			this.#rejectListeners.add(cb);
			return () => this.#rejectListeners.delete(cb);
		}
		const cb = listener as (notice: StoreNotice) => void;
		this.#noticeListeners.add(cb);
		return () => this.#noticeListeners.delete(cb);
	}

	applyMutation(mutation: Mutation): Result<void, RejectReason> {
		const result = this.#dispatch(mutation);
		if (!result.ok) {
			this.#emitReject(result.error, mutation);
		}
		return result;
	}

	// ---------------------------------------------------------------- dispatch

	#dispatch(mutation: Mutation): Result<void, RejectReason> {
		switch (mutation.op) {
			case 'group.create':
				return this.#createGroup(mutation);
			case 'group.rename':
				return this.#renameGroup(mutation.groupId, mutation.name);
			case 'group.recolor':
				return this.#recolorGroup(mutation.groupId, mutation.color);
			case 'group.delete':
				return this.#deleteGroup(mutation.groupId);
			case 'group.reorder':
				return this.#reorderGroups(mutation.order);
			case 'member.add':
				return this.#addMember(mutation.groupId, mutation.path);
			case 'member.remove':
				return this.#removeMember(mutation.groupId, mutation.path);
			case 'member.move':
				return this.#moveMember(mutation.from, mutation.to, mutation.path);
			case 'member.reorder':
				return this.#reorderMembers(mutation.groupId, mutation.order);
			case 'member.repath':
				return this.#repathMember(mutation.oldPath, mutation.newPath);
			case 'settings.update':
				return this.#updateSettings(mutation.patch);
		}
	}

	#createGroup(mutation: Extract<Mutation, { op: 'group.create' }>): Result<void, RejectReason> {
		const name = mutation.name.trim();
		if (name.length === 0) return fail('invalid-name');
		if (!isColorKey(mutation.color)) return fail('invalid-color');

		const id = mutation.id ?? this.#idFactory();
		if (this.#data.groups.some((group) => group.id === id)) return fail('duplicate-id');

		const group: Group = { id, name, color: mutation.color, members: [] };
		this.#commit({ ...this.#data, groups: [...this.#data.groups, group] });
		return OK;
	}

	#renameGroup(groupId: string, rawName: string): Result<void, RejectReason> {
		const name = rawName.trim();
		if (name.length === 0) return fail('invalid-name');
		if (!findGroup(this.#data, groupId)) return fail('group-not-found');

		this.#commit(this.#mapGroups((group) => (group.id === groupId ? { ...group, name } : group)));
		return OK;
	}

	#recolorGroup(groupId: string, color: ColorKey): Result<void, RejectReason> {
		if (!isColorKey(color)) return fail('invalid-color');
		if (!findGroup(this.#data, groupId)) return fail('group-not-found');

		this.#commit(this.#mapGroups((group) => (group.id === groupId ? { ...group, color } : group)));
		return OK;
	}

	#deleteGroup(groupId: string): Result<void, RejectReason> {
		if (!findGroup(this.#data, groupId)) return fail('group-not-found');

		this.#warned.delete(groupId);
		this.#commit({
			...this.#data,
			groups: this.#data.groups.filter((group) => group.id !== groupId),
		});
		return OK;
	}

	#reorderGroups(order: string[]): Result<void, RejectReason> {
		const current = this.#data.groups;
		if (order.length !== current.length) return fail('invalid-order');

		const byId = new Map(current.map((group) => [group.id, group]));
		const next: Group[] = [];
		for (const id of order) {
			const group = byId.get(id);
			if (!group) return fail('invalid-order');
			byId.delete(id);
			next.push(group);
		}
		if (byId.size > 0) return fail('invalid-order');

		this.#commit({ ...this.#data, groups: next });
		return OK;
	}

	#addMember(groupId: string, rawPath: string): Result<void, RejectReason> {
		const target = findGroup(this.#data, groupId);
		if (!target) return fail('group-not-found');

		const path = normalizeVaultPath(rawPath);
		if (path.length === 0) return fail('invalid-path');

		const owner = findGroupOfPath(this.#data, path);
		// Already where it belongs: idempotent no-op (all six entries may race).
		if (owner?.id === groupId) return OK;

		const blocked = this.#gate.check(path);
		if (blocked) return fail(blocked);

		if (owner) {
			// D11: a file belongs to exactly one group, so "add" elsewhere means move.
			const member: Member = { path, addedAt: this.#now() };
			const groups = this.#data.groups.map((group) => {
				if (group.id === owner.id) {
					return { ...group, members: group.members.filter((m) => m.path !== path) };
				}
				if (group.id === groupId) {
					return { ...group, members: [...group.members, member] };
				}
				return group;
			});
			this.#commit({ ...this.#data, groups });
			this.#emitNotice({
				type: 'moved',
				path,
				fromGroupId: owner.id,
				fromGroupName: owner.name,
				toGroupId: groupId,
			});
			this.#checkSoftLimit(groupId);
			return OK;
		}

		const member: Member = { path, addedAt: this.#now() };
		this.#commit(
			this.#mapGroups((group) =>
				group.id === groupId ? { ...group, members: [...group.members, member] } : group,
			),
		);
		this.#checkSoftLimit(groupId);
		return OK;
	}

	#removeMember(groupId: string, rawPath: string): Result<void, RejectReason> {
		if (!findGroup(this.#data, groupId)) return fail('group-not-found');

		const path = normalizeVaultPath(rawPath);
		this.#commit(
			this.#mapGroups((group) =>
				group.id === groupId
					? { ...group, members: group.members.filter((m) => m.path !== path) }
					: group,
			),
		);
		this.#checkSoftLimit(groupId);
		return OK;
	}

	#moveMember(from: string, to: string, rawPath: string): Result<void, RejectReason> {
		if (!findGroup(this.#data, from)) return fail('group-not-found');
		if (!findGroup(this.#data, to)) return fail('group-not-found');

		const path = normalizeVaultPath(rawPath);
		if (!findGroupOfPath(this.#data, path)) return fail('invalid-path');

		return this.#addMember(to, path);
	}

	#reorderMembers(groupId: string, order: string[]): Result<void, RejectReason> {
		const group = findGroup(this.#data, groupId);
		if (!group) return fail('group-not-found');
		if (order.length !== group.members.length) return fail('invalid-order');

		const byPath = new Map(group.members.map((member) => [member.path, member]));
		const next: Member[] = [];
		for (const rawPath of order) {
			const path = normalizeVaultPath(rawPath);
			const member = byPath.get(path);
			if (!member) return fail('invalid-order');
			byPath.delete(path);
			next.push(member);
		}
		if (byPath.size > 0) return fail('invalid-order');

		this.#commit(this.#mapGroups((g) => (g.id === groupId ? { ...g, members: next } : g)));
		return OK;
	}

	/**
	 * F7: keep a member's path in sync after a vault rename/move. Runs on every
	 * group because R2 guarantees a single owner, but the lookup is cheap.
	 */
	#repathMember(rawOldPath: string, rawNewPath: string): Result<void, RejectReason> {
		const oldPath = normalizeVaultPath(rawOldPath);
		const newPath = normalizeVaultPath(rawNewPath);
		if (newPath.length === 0) return fail('invalid-path');
		if (oldPath === newPath) return OK;

		const owner = findGroupOfPath(this.#data, oldPath);
		if (!owner) return OK;

		const newOwner = findGroupOfPath(this.#data, newPath);
		if (newOwner) {
			// The new path is already tracked; drop the stale entry instead of
			// creating a duplicate that would violate R2.
			this.#commit(
				this.#mapGroups((group) =>
					group.id === owner.id
						? { ...group, members: group.members.filter((m) => m.path !== oldPath) }
						: group,
				),
			);
			return OK;
		}

		this.#commit(
			this.#mapGroups((group) =>
				group.id === owner.id
					? {
							...group,
							members: group.members.map((m) => (m.path === oldPath ? { ...m, path: newPath } : m)),
						}
					: group,
			),
		);
		return OK;
	}

	#updateSettings(patch: Partial<Settings>): Result<void, RejectReason> {
		const settings: Settings = { ...this.#data.settings };

		if (patch.language !== undefined) {
			if (!isLanguage(patch.language)) return fail('invalid-setting');
			settings.language = patch.language;
		}
		if (patch.compactPinnedRow !== undefined) {
			if (typeof patch.compactPinnedRow !== 'boolean') return fail('invalid-setting');
			settings.compactPinnedRow = patch.compactPinnedRow;
		}
		if (patch.compactPinnedRowAvailable !== undefined) {
			if (typeof patch.compactPinnedRowAvailable !== 'boolean') return fail('invalid-setting');
			settings.compactPinnedRowAvailable = patch.compactPinnedRowAvailable;
		}
		if (patch.groupColors !== undefined) {
			if (typeof patch.groupColors !== 'boolean') return fail('invalid-setting');
			settings.groupColors = patch.groupColors;
		}
		if (patch.softLimit !== undefined) {
			if (typeof patch.softLimit !== 'number' || !Number.isFinite(patch.softLimit)) {
				return fail('invalid-setting');
			}
			settings.softLimit = Math.min(
				MAX_SOFT_LIMIT,
				Math.max(MIN_SOFT_LIMIT, Math.round(patch.softLimit)),
			);
		}

		this.#commit({ ...this.#data, settings });
		return OK;
	}

	// --------------------------------------------------------------- internals

	#mapGroups(fn: (group: Group) => Group): TrayData {
		return { ...this.#data, groups: this.#data.groups.map(fn) };
	}

	#commit(next: TrayData): void {
		this.#data = next;
		for (const listener of this.#changeListeners) listener(next);
	}

	#checkSoftLimit(groupId: string): void {
		const group = findGroup(this.#data, groupId);
		if (!group) return;

		const limit = this.#data.settings.softLimit;
		if (group.members.length <= limit) {
			this.#warned.delete(groupId);
			return;
		}
		if (this.#warned.has(groupId)) return;

		this.#warned.add(groupId);
		this.#emitNotice({ type: 'soft-limit', groupId, count: group.members.length, limit });
	}

	#emitReject(reason: RejectReason, mutation: Mutation): void {
		for (const listener of this.#rejectListeners) listener(reason, mutation);
	}

	#emitNotice(notice: StoreNotice): void {
		for (const listener of this.#noticeListeners) listener(notice);
	}
}

const OK: Result<void, RejectReason> = { ok: true, value: undefined };

function fail(reason: RejectReason): Result<void, RejectReason> {
	return { ok: false, error: reason };
}

import { type App, Notice, type WorkspaceLeaf } from 'obsidian';
import type { RejectReason, StoreNotice, TrayStore } from './core/store';
import {
	COLOR_KEYS,
	type ColorKey,
	findGroup,
	findGroupOfPath,
	type Group,
	type Settings,
	type TrayData,
} from './core/types';
import type { I18n } from './i18n';
import { readDroppedFiles } from './integrations/dnd';
import { ConfirmModal } from './ui/confirm-modal';
import { baseName } from './ui/file-utils';
import { VIEW_TYPE_GROUPS } from './ui/view-types';
import type { WorkspaceExecutor } from './workspace/execute';
import type { FileFollow } from './workspace/file-follow';
import type { PinTracker } from './workspace/pin-tracker';
import {
	countOpen,
	type ExpandMode,
	type LeafSnapshot,
	listOpenTabs,
	type TabListEntry,
} from './workspace/plan';

/**
 * The facade every view talks to.
 *
 * Views are disposable subscribers (P5): they hold one snapshot, call actions,
 * and never touch the store, the workspace or the executor directly. That keeps
 * Svelte out of the Obsidian API and makes both views replaceable.
 */

export type SidebarMode = 'groups' | 'tabs';

export interface RuntimeState {
	data: TrayData;
	leaves: LeafSnapshot[];
	tabs: TabListEntry[];
	openCounts: ReadonlyMap<string, number>;
	missing: ReadonlySet<string>;
	pinned: ReadonlySet<string>;
	compactAvailable: boolean;
	/** Which face of the single sidebar view is showing. */
	sidebarMode: SidebarMode;
	/** R11: the window a click would act on right now. */
	currentWindowId: string;
	revision: number;
}

export interface ControllerDeps {
	app: App;
	store: TrayStore;
	tracker: PinTracker;
	fileFollow: FileFollow;
	executor: WorkspaceExecutor;
	i18n: I18n;
}

type NoticeKind = 'info' | 'warn' | 'error' | 'ok';

export class TrayController {
	readonly #app: App;
	readonly #store: TrayStore;
	readonly #tracker: PinTracker;
	readonly #fileFollow: FileFollow;
	readonly #executor: WorkspaceExecutor;
	readonly #i18n: I18n;

	readonly #listeners = new Set<(state: RuntimeState) => void>();
	readonly #unsubs: Array<() => void> = [];

	#state: RuntimeState;
	#revision = 0;
	#firstExpandShown = false;
	#sidebarMode: SidebarMode = 'groups';

	constructor(deps: ControllerDeps) {
		this.#app = deps.app;
		this.#store = deps.store;
		this.#tracker = deps.tracker;
		this.#fileFollow = deps.fileFollow;
		this.#executor = deps.executor;
		this.#i18n = deps.i18n;
		this.#state = this.#compute();
	}

	get state(): RuntimeState {
		return this.#state;
	}

	get i18n(): I18n {
		return this.#i18n;
	}

	start(): void {
		this.#unsubs.push(
			this.#store.on('change', () => this.#refresh()),
			this.#store.on('notice', (notice) => this.#onStoreNotice(notice)),
			this.#store.on('reject', (reason) => this.#onReject(reason)),
			this.#tracker.onChange(() => this.#refresh()),
			this.#fileFollow.onChange(() => this.#refresh()),
			this.#i18n.onChange(() => this.#refresh()),
		);
		this.#refresh();
	}

	onChange(listener: (state: RuntimeState) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	dispose(): void {
		for (const unsub of this.#unsubs) unsub();
		this.#unsubs.length = 0;
		this.#listeners.clear();
	}

	// ------------------------------------------------------------------ groups

	createGroup(name?: string): string | null {
		const groups = this.#state.data.groups;
		const color: ColorKey = COLOR_KEYS[groups.length % COLOR_KEYS.length] ?? 'blue';
		const result = this.#store.applyMutation({
			op: 'group.create',
			name: name ?? this.#i18n.t('group.defaultName'),
			color,
		});
		if (!result.ok) return null;

		const next = this.#store.snapshot().groups;
		return next[next.length - 1]?.id ?? null;
	}

	renameGroup(groupId: string, name: string): boolean {
		return this.#store.applyMutation({ op: 'group.rename', groupId, name }).ok;
	}

	recolorGroup(groupId: string, color: ColorKey): boolean {
		return this.#store.applyMutation({ op: 'group.recolor', groupId, color }).ok;
	}

	deleteGroup(groupId: string): void {
		const group = findGroup(this.#state.data, groupId);
		const result = this.#store.applyMutation({ op: 'group.delete', groupId });
		if (result.ok && group) {
			this.#notify(this.#i18n.t('notice.groupDeleted', { name: group.name }), 'info');
		}
	}

	reorderGroups(order: string[]): void {
		this.#store.applyMutation({ op: 'group.reorder', order });
	}

	// ----------------------------------------------------------------- members

	addMember(groupId: string, path: string): boolean {
		return this.#store.applyMutation({ op: 'member.add', groupId, path }).ok;
	}

	removeMember(groupId: string, path: string): void {
		this.#store.applyMutation({ op: 'member.remove', groupId, path });
	}

	moveMember(from: string, to: string, path: string): void {
		this.#store.applyMutation({ op: 'member.move', from, to, path });
	}

	reorderMembers(groupId: string, order: string[]): void {
		this.#store.applyMutation({ op: 'member.reorder', groupId, order });
	}

	/**
	 * One entry point for every drag result, so a cross-group drop and an
	 * in-group reorder follow the same rules.
	 */
	moveMemberTo(from: string, to: string, path: string, beforePath: string | null): void {
		if (beforePath === path) return;

		if (from === to) {
			const group = findGroup(this.#state.data, to);
			if (!group) return;
			const order = group.members.map((m) => m.path).filter((p) => p !== path);
			const index = beforePath === null ? order.length : order.indexOf(beforePath);
			order.splice(index < 0 ? order.length : index, 0, path);
			this.reorderMembers(to, order);
			return;
		}

		const result = this.#store.applyMutation({ op: 'member.move', from, to, path });
		if (!result.ok || beforePath === null) return;

		const group = findGroup(this.#store.snapshot(), to);
		if (!group) return;
		const order = group.members.map((m) => m.path).filter((p) => p !== path);
		const index = order.indexOf(beforePath);
		if (index < 0) return;
		order.splice(index, 0, path);
		this.reorderMembers(to, order);
	}

	/** F3-3: files dropped from the explorer onto a group. */
	addDroppedFiles(groupId: string, event: DragEvent): number {
		const paths = readDroppedFiles(this.#app, event);
		let added = 0;
		for (const path of paths) {
			if (this.addMember(groupId, path)) added += 1;
		}
		return added;
	}

	/** A1: deletion is confirmed before anything is written. */
	confirmDeleteGroup(groupId: string): void {
		const group = findGroup(this.#state.data, groupId);
		if (!group) return;

		new ConfirmModal(this.#app, {
			title: this.#i18n.t('modal.delete.title'),
			body: this.#i18n.t('modal.delete.body'),
			params: { name: group.name, count: group.members.length },
			bold: ['name', 'count'],
			cancel: this.#i18n.t('modal.delete.cancel'),
			confirm: this.#i18n.t('modal.delete.confirm'),
			onConfirm: () => this.deleteGroup(groupId),
		}).open();
	}

	// ---------------------------------------------------------- expand/collapse

	async expandGroup(groupId: string, mode: ExpandMode = 'replace'): Promise<void> {
		const group = findGroup(this.#state.data, groupId);
		if (!group || group.members.length === 0) return;

		const outcome = await this.#executor.expand(group, mode);

		if (outcome.skippedMissing > 0) {
			this.#notify(
				this.#i18n.t('notice.missingSkipped', { count: outcome.skippedMissing }),
				'warn',
			);
		}
		if (outcome.opened === 0) return;

		if (mode === 'replace' && outcome.closed > 0) {
			this.#notify(
				this.#i18n.t('notice.expandedReplaced', { name: group.name, count: outcome.opened }),
				'ok',
			);
			if (!this.#firstExpandShown) {
				this.#firstExpandShown = true;
				this.#notify(this.#i18n.t('notice.firstExpandHint'), 'info', 8000);
			}
			return;
		}

		this.#notify(
			this.#i18n.t('notice.expanded', { name: group.name, count: outcome.opened }),
			'ok',
		);
	}

	async collapseGroup(groupId: string): Promise<void> {
		const group = findGroup(this.#state.data, groupId);
		if (!group) return;

		const outcome = await this.#executor.collapse(group.members.map((m) => m.path));

		if (outcome.skippedPinned > 0) {
			this.#notify(
				this.#i18n.t('notice.collapsedPinned', { name: group.name, count: outcome.skippedPinned }),
				'warn',
				8000,
			);
			return;
		}
		if (outcome.closed === 0) {
			this.#notify(this.#i18n.t('notice.nothingToCollapse', { name: group.name }), 'info');
			return;
		}
		this.#notify(
			this.#i18n.t('notice.collapsed', { name: group.name, count: outcome.closed }),
			'ok',
		);
	}

	async toggleGroup(groupId: string, mode: ExpandMode = 'replace'): Promise<void> {
		// A modifier always means "add to what is there", even when the group is
		// already partly open — otherwise Ctrl+click would collapse instead.
		if (mode === 'append') {
			await this.expandGroup(groupId, 'append');
			return;
		}
		const open = this.#state.openCounts.get(groupId) ?? 0;
		if (open > 0) await this.collapseGroup(groupId);
		else await this.expandGroup(groupId, 'replace');
	}

	async tidyAll(): Promise<void> {
		const groups = this.#state.data.groups;
		if (groups.length === 0) return;

		const outcome = await this.#executor.tidyAll(groups);
		if (outcome.closed === 0) {
			this.#notify(this.#i18n.t('notice.nothingToCollapseAll'), 'info');
			return;
		}
		this.#notify(this.#i18n.t('notice.collapsedAll', { count: outcome.closed }), 'ok');
	}

	/** F6: "collapse the active group" — the group owning the active file (D12). */
	async collapseActiveGroup(): Promise<void> {
		const active =
			this.#state.leaves.find((leaf) => leaf.active && leaf.path !== null) ??
			this.#state.leaves.find((leaf) => leaf.leafId === this.#tracker.lastActiveEditorLeafId);
		const group = active?.path ? findGroupOfPath(this.#state.data, active.path) : undefined;
		if (!group) {
			this.#notify(this.#i18n.t('notice.noActiveGroup'), 'info');
			return;
		}
		await this.collapseGroup(group.id);
	}

	// -------------------------------------------------------------------- tabs

	async openMember(path: string, options: { newTab?: boolean } = {}): Promise<void> {
		const result = await this.#executor.openMember(path, options);
		if (result === 'failed') {
			this.#notify(this.#i18n.t('notice.openFailed', { name: baseName(path) }), 'error');
		}
	}

	async focusTab(path: string): Promise<void> {
		await this.#executor.focusPath(path);
	}

	async closeFile(path: string): Promise<void> {
		await this.#executor.closePaths([path]);
	}

	async closeOthers(path: string): Promise<void> {
		await this.#executor.closeOthers(path);
	}

	setPinned(path: string, pinned: boolean): void {
		this.#executor.setPinned(path, pinned);
	}

	// ------------------------------------------------------------------- misc

	groupOfPath(path: string): Group | null {
		return findGroupOfPath(this.#state.data, path) ?? null;
	}

	isPinned(path: string): boolean {
		return this.#state.pinned.has(path);
	}

	updateSettings(patch: Partial<Settings>): void {
		const languageChanged = patch.language !== undefined;
		const result = this.#store.applyMutation({ op: 'settings.update', patch });
		if (result.ok && languageChanged) this.#i18n.notify();
	}

	/** F1 + F9: one view, two faces. */
	setSidebarMode(mode: SidebarMode): void {
		if (this.#sidebarMode === mode) return;
		this.#sidebarMode = mode;
		this.#refresh();
	}

	async openSidebar(mode?: SidebarMode): Promise<void> {
		if (mode) this.setSidebarMode(mode);
		await this.#revealView(VIEW_TYPE_GROUPS, 'left');
	}

	notify(message: string, kind: NoticeKind = 'info', duration = 5000): void {
		this.#notify(message, kind, duration);
	}

	// --------------------------------------------------------------- internals

	#compute(): RuntimeState {
		const data = this.#store.snapshot();
		const leaves = this.#tracker.snapshot.leaves;
		const tabs = listOpenTabs(leaves, (path) => findGroupOfPath(data, path)?.id ?? null);

		const openCounts = new Map<string, number>();
		for (const group of data.groups) {
			openCounts.set(
				group.id,
				countOpen(
					group.members.map((member) => member.path),
					leaves,
				),
			);
		}

		const pinned = new Set<string>();
		for (const leaf of leaves) {
			if (leaf.isVaultFile && leaf.pinned && leaf.path) pinned.add(leaf.path);
		}

		return {
			data,
			leaves,
			tabs,
			openCounts,
			missing: this.#fileFollow.missing(),
			pinned,
			compactAvailable: data.settings.compactPinnedRowAvailable,
			sidebarMode: this.#sidebarMode,
			currentWindowId: this.#executor.currentWindowId(),
			revision: this.#revision,
		};
	}

	#refresh(): void {
		this.#revision += 1;
		this.#state = this.#compute();
		for (const listener of this.#listeners) listener(this.#state);
	}

	#onStoreNotice(notice: StoreNotice): void {
		if (notice.type === 'moved') {
			const to = findGroup(this.#state.data, notice.toGroupId);
			this.#notify(
				this.#i18n.t('notice.moved', {
					from: notice.fromGroupName,
					to: to?.name ?? '?',
				}),
				'info',
			);
			return;
		}
		const group = findGroup(this.#state.data, notice.groupId);
		this.#notify(
			this.#i18n.t('notice.softLimit', {
				name: group?.name ?? '?',
				count: notice.count,
				limit: notice.limit,
			}),
			'warn',
		);
	}

	#onReject(reason: RejectReason): void {
		if (reason === 'pinned') {
			this.#notify(this.#i18n.t('notice.pinnedBlocked'), 'error');
			return;
		}
		if (reason === 'external') {
			this.#notify(this.#i18n.t('notice.externalBlocked'), 'error');
			return;
		}
		if (reason === 'group-not-found' || reason === 'duplicate-id') {
			this.#notify(this.#i18n.t('notice.rejected', { reason }), 'warn');
		}
		// Validation failures are guarded by the UI and stay silent.
	}

	#notify(message: string, kind: NoticeKind, duration = 5000): void {
		const notice = new Notice(message, duration);
		notice.containerEl.addClass('tab-tray-notice', `tab-tray-notice-${kind}`);
	}

	#findLeaf(type: string): WorkspaceLeaf | null {
		let found: WorkspaceLeaf | null = null;
		this.#app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view?.getViewType?.() === type) found = leaf;
		});
		return found;
	}

	async #revealView(type: string, side: 'left' | 'right'): Promise<void> {
		const existing = this.#findLeaf(type);
		if (existing) {
			await this.#app.workspace.revealLeaf(existing);
			return;
		}

		const leaf =
			side === 'left'
				? this.#app.workspace.getLeftLeaf(false)
				: this.#app.workspace.getRightLeaf(false);
		if (!leaf) return;

		await leaf.setViewState({ type, active: true });
		await this.#app.workspace.revealLeaf(leaf);
	}
}

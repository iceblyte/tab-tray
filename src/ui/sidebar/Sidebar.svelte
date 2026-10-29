<script lang="ts">
	import { Menu, prepareFuzzySearch } from 'obsidian';
	import type { TrayController } from '../../controller';
	import { COLOR_KEYS, type ColorKey, type Group } from '../../core/types';
	import type { I18nKey } from '../../i18n';
	import { addToGroupMenuItem } from '../../integrations/menus';
	import type { TabListEntry } from '../../workspace/plan';
	import { baseName, iconForPath } from '../file-utils';
	import Icon from '../Icon.svelte';

	let { controller }: { controller: TrayController } = $props();

	// D20: one subscription point; the store hands out a fresh snapshot object.
	// The controller is fixed for the lifetime of this view, so reading it once
	// for the initial snapshot is intentional.
	// svelte-ignore state_referenced_locally
	let state = $state.raw(controller.state);
	$effect(() => controller.onChange((next) => (state = next)));

	const t = (key: I18nKey, params?: Record<string, string | number>) =>
		controller.i18n.t(key, params);

	let query = $state('');
	let folded = $state<string[]>([]);
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');
	let renameInput = $state<HTMLInputElement | null>(null);
	let menuGroupId = $state<string | null>(null);
	let paletteGroupId = $state<string | null>(null);

	let dragGroupId = $state<string | null>(null);
	let dragMember = $state<{ groupId: string; path: string } | null>(null);
	let groupDrop = $state<{ groupId: string; before: boolean } | null>(null);
	let memberDrop = $state<{ groupId: string; beforePath: string | null } | null>(null);
	let externalHoverId = $state<string | null>(null);

	/** Sentinel source for an open tab that is not in any group yet. */
	const UNGROUPED = '__ungrouped';

	type SectionKind = 'pinned' | 'ungrouped' | 'external';

	interface SystemSection {
		/** Section kind doubles as the fold key; group ids are UUIDs. */
		id: SectionKind;
		kind: SectionKind;
		entries: TabListEntry[];
	}

	/**
	 * Fixed order, deliberately not draggable: these three sections can only
	 * ever be sorted among themselves, so a reorder would be a hidden setting
	 * with no payoff. A rule separates them from the groups instead.
	 */
	const SECTION_ORDER: SectionKind[] = ['pinned', 'ungrouped', 'external'];

	const matcher = $derived(query.trim() ? prepareFuzzySearch(query.trim()) : null);

	function matches(path: string): boolean {
		const search = matcher;
		return search ? search(baseName(path)) !== null : true;
	}

	/** Groups keep their persistent members; a search only narrows what is shown. */
	const visibleGroups = $derived.by(() => {
		const search = matcher;
		if (!search) return state.data.groups.map((group) => ({ group, members: group.members }));

		const result: Array<{ group: Group; members: Group['members'] }> = [];
		for (const group of state.data.groups) {
			// A matching group name shows the whole group; otherwise filter its
			// members by file name.
			if (search(group.name) !== null) {
				result.push({ group, members: group.members });
				continue;
			}
			const members = group.members.filter((member) => search(baseName(member.path)) !== null);
			if (members.length > 0) result.push({ group, members });
		}
		return result;
	});

	/** Open tabs with no group: the old tab list's contribution to the merge. */
	/** Pinned tabs get their own section: they can never be group members. */
	const pinned = $derived(state.tabs.filter((entry) => entry.pinned && matches(entry.path)));

	const ungrouped = $derived(
		state.tabs.filter(
			(entry) =>
				!entry.pinned &&
				entry.isVaultFile &&
				entry.groupId === null &&
				matches(entry.path),
		),
	);

	const external = $derived(
		state.tabs.filter(
			(entry) => !entry.pinned && !entry.isVaultFile && matches(entry.path),
		),
	);

	const tabMap = $derived(new Map(state.tabs.map((entry) => [entry.path, entry])));
	const isEmpty = $derived(
		visibleGroups.length === 0 &&
			pinned.length === 0 &&
			ungrouped.length === 0 &&
			external.length === 0,
	);

	const systemSections = $derived.by((): SystemSection[] =>
		SECTION_ORDER.map((kind): SystemSection => {
			const entries = kind === 'pinned' ? pinned : kind === 'ungrouped' ? ungrouped : external;
			return { id: kind, kind, entries };
		}),
	);

	function sectionName(kind: SectionKind): string {
		if (kind === 'pinned') return t('tabs.section.pinned');
		if (kind === 'ungrouped') return t('tabs.section.ungrouped');
		return t('tabs.section.external');
	}

	$effect(() => {
		if (!renamingId || !renameInput) return;
		renameInput.focus();
		renameInput.select();
	});

	function createGroup(): void {
		// Naming and colour happen before anything is written, so cancelling
		// leaves no stray "New group" behind.
		controller.promptNewGroup();
	}

	function isFolded(groupId: string): boolean {
		return folded.includes(groupId);
	}

	function toggleFold(event: MouseEvent, groupId: string): void {
		event.stopPropagation();
		foldSection(groupId);
	}

	function foldSection(groupId: string): void {
		folded = isFolded(groupId) ? folded.filter((id) => id !== groupId) : [...folded, groupId];
	}

	function isInteractive(target: EventTarget | null): boolean {
		return target instanceof HTMLElement && !!target.closest('button, input, .tt-popover');
	}

	/**
	 * A click on the row folds the list, nothing else. Opening and closing the
	 * group's tabs is what the two chevron buttons are for — the row used to do
	 * both, so aiming at the twist often hit the row and closed tabs instead.
	 */
	function onGroupClick(event: MouseEvent, group: Group): void {
		if (isInteractive(event.target) || renamingId) return;
		foldSection(group.id);
	}

	function onGroupKeydown(event: KeyboardEvent, group: Group): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		if (isInteractive(event.target)) return;
		event.preventDefault();
		foldSection(group.id);
	}

	function expandGroup(event: MouseEvent, group: Group): void {
		event.stopPropagation();
		void controller.expandGroup(group.id, event.ctrlKey || event.metaKey ? 'append' : 'replace');
	}

	function collapseGroup(event: MouseEvent, group: Group): void {
		event.stopPropagation();
		void controller.collapseGroup(group.id);
	}

	function startRename(event: MouseEvent, group: Group): void {
		event.stopPropagation();
		menuGroupId = null;
		paletteGroupId = null;
		renamingId = group.id;
		renameValue = group.name;
	}

	function commitRename(): void {
		const id = renamingId;
		const name = renameValue.trim();
		renamingId = null;
		if (id && name) controller.renameGroup(id, name);
	}

	function cancelRename(): void {
		renamingId = null;
	}

	function onRenameKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitRename();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelRename();
		}
	}

	/** Blur commits, but not when focus moved to the ✓ / ✗ buttons. */
	function onRenameBlur(event: FocusEvent): void {
		const next = event.relatedTarget;
		if (next instanceof HTMLElement && next.closest('.rename-acts')) return;
		commitRename();
	}

	function toggleMenu(event: MouseEvent, groupId: string): void {
		event.stopPropagation();
		paletteGroupId = null;
		menuGroupId = menuGroupId === groupId ? null : groupId;
	}

	function openPalette(event: MouseEvent, groupId: string): void {
		event.stopPropagation();
		menuGroupId = null;
		paletteGroupId = groupId;
	}

	function pickColor(event: MouseEvent, groupId: string, color: ColorKey): void {
		event.stopPropagation();
		controller.recolorGroup(groupId, color);
		paletteGroupId = null;
	}

	function askDelete(event: MouseEvent, group: Group): void {
		event.stopPropagation();
		menuGroupId = null;
		controller.confirmDeleteGroup(group.id);
	}

	function openMember(path: string, newTab: boolean): void {
		void controller.openMember(path, newTab ? { newTab: true } : {});
	}

	function onMemberClick(event: MouseEvent, path: string): void {
		openMember(path, event.ctrlKey || event.metaKey);
	}

	function onMemberKeydown(event: KeyboardEvent, path: string): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		openMember(path, event.ctrlKey || event.metaKey);
	}

	function removeMember(event: MouseEvent, groupId: string, path: string): void {
		event.stopPropagation();
		controller.removeMember(groupId, path);
	}

	function memberHint(path: string): string {
		if (state.missing.has(path)) return t('member.missingHint');
		if (state.pinned.has(path)) return t('member.pinnedHint');
		return state.leaves.some((leaf) => leaf.path === path)
			? t('member.openHint')
			: t('member.closedHint');
	}

	// ------------------------------------------------------------------- tabs

	function isPopout(entry: TabListEntry): boolean {
		return !entry.windowIds.includes(state.currentWindowId);
	}

	function onEntryClick(entry: TabListEntry): void {
		void controller.focusTab(entry.path);
	}

	function onEntryKeydown(event: KeyboardEvent, entry: TabListEntry): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		onEntryClick(entry);
	}

	function closeEntry(event: MouseEvent, entry: TabListEntry): void {
		event.stopPropagation();
		void controller.closeFile(entry.path);
	}

	function onTabContextMenu(event: MouseEvent, entry: TabListEntry): void {
		event.preventDefault();
		event.stopPropagation();

		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle(entry.pinned ? t('tabs.unpin') : t('tabs.pin'))
				.setIcon('pin')
				.onClick(() => controller.setPinned(entry.path, !entry.pinned)),
		);

		// R12: out-of-vault tabs have no durable path, so only open tabs in the
		// vault can be added to a group.
		if (entry.isVaultFile) addToGroupMenuItem(menu, controller, entry.path);

		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle(t('tabs.close'))
				.setIcon('x')
				.onClick(() => {
					void controller.closeFile(entry.path);
				}),
		);
		menu.addItem((item) =>
			item
				.setTitle(t('tabs.closeOthers'))
				.setIcon('x-circle')
				.onClick(() => {
					void controller.closeOthers(entry.path);
				}),
		);

		menu.showAtMouseEvent(event);
	}

	/** Members are persistent, so the menu also works when the file is closed. */
	function onMemberContextMenu(event: MouseEvent, path: string): void {
		event.preventDefault();
		event.stopPropagation();

		const entry = tabMap.get(path);
		const menu = new Menu();

		if (entry) {
			menu.addItem((item) =>
				item
					.setTitle(entry.pinned ? t('tabs.unpin') : t('tabs.pin'))
					.setIcon('pin')
					.onClick(() => controller.setPinned(path, !entry.pinned)),
			);
		}

		addToGroupMenuItem(menu, controller, path);

		if (entry) {
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle(t('tabs.close'))
					.setIcon('x')
					.onClick(() => {
						void controller.closeFile(path);
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle(t('tabs.closeOthers'))
					.setIcon('x-circle')
					.onClick(() => {
						void controller.closeOthers(path);
					}),
			);
		}

		menu.showAtMouseEvent(event);
	}

	// ------------------------------------------------------------------- drag

	/**
	 * Where the current press started. `dragstart` fires on the draggable
	 * container, so its `event.target` is the row — never the button — and
	 * checking it there can't tell "pressed the twist" from "pressed the row".
	 * Remembering the mousedown target is the only reliable way to keep a
	 * press on a button from turning into a drag that swallows the click.
	 */
	let pressedOnButton = false;

	function rememberPress(event: MouseEvent): void {
		pressedOnButton =
			event.target instanceof HTMLElement && event.target.closest('button, input') !== null;
	}

	function startGroupDrag(event: DragEvent, groupId: string): void {
		if (pressedOnButton) {
			event.preventDefault();
			return;
		}
		event.stopPropagation();
		dragGroupId = groupId;
		dragMember = null;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('application/x-tab-tray-group', groupId);
			event.dataTransfer.setData('text/plain', groupId);
		}
	}

	function startMemberDrag(event: DragEvent, groupId: string, path: string): void {
		// Reordering a filtered subset would not match what the user sees.
		if (query.trim() || pressedOnButton) {
			event.preventDefault();
			return;
		}
		event.stopPropagation();
		dragMember = { groupId, path };
		dragGroupId = null;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('application/x-tab-tray-member', JSON.stringify({ groupId, path }));
			event.dataTransfer.setData('text/plain', path);
		}
	}

	function startOpenTabDrag(event: DragEvent, path: string): void {
		if (query.trim() || pressedOnButton) {
			event.preventDefault();
			return;
		}
		event.stopPropagation();
		dragMember = { groupId: UNGROUPED, path };
		dragGroupId = null;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData(
				'application/x-tab-tray-member',
				JSON.stringify({ groupId: UNGROUPED, path }),
			);
			event.dataTransfer.setData('text/plain', path);
		}
	}

	function dropMember(targetGroupId: string, beforePath: string | null): void {
		if (!dragMember) return;
		if (dragMember.groupId === UNGROUPED) {
			if (controller.addMember(targetGroupId, dragMember.path) && beforePath) {
				controller.moveMemberTo(targetGroupId, targetGroupId, dragMember.path, beforePath);
			}
			return;
		}
		controller.moveMemberTo(dragMember.groupId, targetGroupId, dragMember.path, beforePath);
	}

	function endDrag(): void {
		dragGroupId = null;
		dragMember = null;
		groupDrop = null;
		memberDrop = null;
		externalHoverId = null;
	}

	function onHeadDragOver(event: DragEvent, groupId: string): void {
		if (dragGroupId) {
			if (dragGroupId === groupId) return;
			event.preventDefault();
			event.stopPropagation();
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			groupDrop = { groupId, before: event.clientY < rect.top + rect.height / 2 };
			memberDrop = null;
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			return;
		}
		if (dragMember) {
			event.preventDefault();
			event.stopPropagation();
			groupDrop = null;
			memberDrop = { groupId, beforePath: null };
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		externalHoverId = groupId;
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function onMemberDragOver(event: DragEvent, groupId: string, path: string): void {
		if (!dragMember) return;
		event.preventDefault();
		event.stopPropagation();
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const before = event.clientY < rect.top + rect.height / 2;
		const group = state.data.groups.find((g) => g.id === groupId);
		const paths = group?.members.map((m) => m.path) ?? [];
		const index = paths.indexOf(path);
		memberDrop = { groupId, beforePath: before ? path : (paths[index + 1] ?? null) };
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	function onHeadDrop(event: DragEvent, groupId: string): void {
		event.preventDefault();
		event.stopPropagation();

		if (dragGroupId) {
			const order = state.data.groups.map((g) => g.id).filter((id) => id !== dragGroupId);
			const index = order.indexOf(groupId);
			const before = groupDrop?.before ?? true;
			order.splice(before ? index : index + 1, 0, dragGroupId);
			controller.reorderGroups(order);
		} else if (dragMember) {
			dropMember(groupId, null);
		} else {
			controller.addDroppedFiles(groupId, event);
		}
		endDrag();
	}

	function onMemberDrop(event: DragEvent, groupId: string): void {
		// Group drags are handled by their container.
		if (dragGroupId) return;
		event.preventDefault();
		event.stopPropagation();
		if (dragMember) {
			dropMember(groupId, memberDrop?.beforePath ?? null);
		} else {
			controller.addDroppedFiles(groupId, event);
		}
		endDrag();
	}

	function onGroupDragOver(event: DragEvent, groupId: string): void {
		event.preventDefault();

		if (dragGroupId) {
			if (dragGroupId === groupId) return;
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			groupDrop = { groupId, before: event.clientY < rect.top + rect.height / 2 };
			memberDrop = null;
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			return;
		}
		if (dragMember) {
			memberDrop = { groupId, beforePath: null };
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			return;
		}
		externalHoverId = groupId;
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function onGroupDrop(event: DragEvent, groupId: string): void {
		event.preventDefault();
		event.stopPropagation();

		if (dragGroupId) {
			const order = state.data.groups.map((g) => g.id).filter((id) => id !== dragGroupId);
			const index = order.indexOf(groupId);
			const before = groupDrop?.before ?? true;
			order.splice(before ? index : index + 1, 0, dragGroupId);
			controller.reorderGroups(order);
		} else if (dragMember) {
			dropMember(groupId, null);
		} else {
			controller.addDroppedFiles(groupId, event);
		}
		endDrag();
	}

	// ---------------------------------------------------------------- popovers

	function onDocumentClick(event: MouseEvent): void {
		if (isInteractive(event.target)) return;
		menuGroupId = null;
		paletteGroupId = null;
	}

	function onDocumentKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		menuGroupId = null;
		paletteGroupId = null;
		if (renamingId) cancelRename();
	}
</script>

<svelte:document onclick={onDocumentClick} onkeydown={onDocumentKeydown} />

{#snippet tabRow(entry: TabListEntry)}
	{@const canDrag = entry.isVaultFile && !entry.pinned}
	<div
		class="member tentry"
		class:active-row={entry.active}
		draggable={canDrag && !query.trim()}
		role="button"
		tabindex="0"
		title={entry.path}
		onmousedown={rememberPress}
		ondragstart={(event) => {
			if (!canDrag) {
				event.preventDefault();
				return;
			}
			startOpenTabDrag(event, entry.path);
		}}
		ondragend={endDrag}
		onclick={() => onEntryClick(entry)}
		onkeydown={(event) => onEntryKeydown(event, entry)}
		oncontextmenu={(event) => onTabContextMenu(event, entry)}
	>
		<Icon name={iconForPath(entry.path)} size={16} cls="micon" />
		<span class="mname">{baseName(entry.path)}</span>
		{#if entry.paneCount > 1}
			<span class="tpane" title={t('tabs.badge.panesHint', { count: entry.paneCount })}>
				{t('tabs.badge.panes', { count: entry.paneCount })}
			</span>
		{/if}
		{#if isPopout(entry)}
			<span class="tpane" title={t('tabs.badge.popoutHint')}>
				{t('tabs.badge.popout')}
			</span>
		{/if}
		{#if entry.pinned}
			<Icon name="pin" size={12} cls="mpin" />
		{/if}
		{#if !entry.isVaultFile}
			<span class="tflag">{t('tabs.badge.external')}</span>
		{/if}
		<button class="mx" title={t('tabs.close')} onclick={(event) => closeEntry(event, entry)}>
			<Icon name="x" size={12} />
		</button>
	</div>
{/snippet}

<div class="tt-view">
	<div class="view-head">
		<span class="vh-title">{t('view.groups.title')}</span>
		<button class="vh-new" onclick={createGroup}>
			<Icon name="plus" size={12} />
			<span>{t('view.groups.newGroup')}</span>
		</button>
	</div>

	<div class="tt-tabs">
		<div class="tm-tools">
			<input
				class="tm-search"
				bind:value={query}
				placeholder={t('tabs.search')}
				onkeydown={(event) => {
					if (event.key === 'Escape') query = '';
				}}
			/>
			<button class="tm-collapse" title={t('tabs.tidyAllHint')} onclick={() => controller.tidyAll()}>
				<Icon name="chevrons-left" size={14} />
				<span>{t('tabs.tidyAll')}</span>
			</button>
		</div>

		<div class="glist">
			{#each systemSections as section (section.id)}
				<div
					class="tsec"
					class:empty={section.entries.length === 0}
					class:folded={isFolded(section.id)}
					role="group"
					aria-label={sectionName(section.kind)}
				>
					<div
						class="tsec-head"
						role="button"
						tabindex="0"
						onclick={() => foldSection(section.id)}
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								foldSection(section.id);
							}
						}}
					>
						<button type="button" class="twist" onclick={(event) => toggleFold(event, section.id)}>
							<Icon name="chevron-down" size={14} />
						</button>
						{#if section.kind === 'pinned'}
							<Icon name="pin" size={13} cls="tsec-icon" />
						{:else}
							<span class="gdot tt-dot-muted"></span>
						{/if}
						<span class="tsec-name">{sectionName(section.kind)}</span>
						<span class="gcount" class:has={section.entries.length > 0}>
							{section.entries.length}
						</span>
					</div>

					{#if !isFolded(section.id) && section.entries.length > 0}
						<div class="members">
							{#each section.entries as entry (entry.path)}
								{@render tabRow(entry)}
							{/each}
						</div>
					{/if}
				</div>
			{/each}

			{#if visibleGroups.length > 0}
				<div class="tsec-rule" role="separator"></div>
			{/if}

			{#if isEmpty}
				<div class="tm-empty">{query.trim() ? t('tabs.noResults') : t('panel.empty')}</div>
			{/if}

			{#each visibleGroups as { group, members } (group.id)}
				{@const open = state.openCounts.get(group.id) ?? 0}
				{@const total = group.members.length}
				<div
					class="group gc-{group.color}"
					role="group"
					aria-label={group.name}
					class:folded={isFolded(group.id)}
					class:dragging={dragGroupId === group.id}
					class:drop-target={externalHoverId === group.id}
					ondragover={(event) => onGroupDragOver(event, group.id)}
					ondrop={(event) => onGroupDrop(event, group.id)}
				>
					{#if groupDrop?.groupId === group.id && groupDrop.before}
						<div class="drop-line"></div>
					{/if}

					<div
						class="ghead"
						class:drop-target={memberDrop?.groupId === group.id && memberDrop.beforePath === null}
						draggable="true"
						role="button"
						tabindex="0"
						title={isFolded(group.id) ? t('group.unfold') : t('group.fold')}
						onmousedown={rememberPress}
						ondragstart={(event) => startGroupDrag(event, group.id)}
						ondragend={endDrag}
						ondragover={(event) => onHeadDragOver(event, group.id)}
						ondrop={(event) => onHeadDrop(event, group.id)}
						onclick={(event) => onGroupClick(event, group)}
						onkeydown={(event) => onGroupKeydown(event, group)}
					>
						<button
							type="button"
							class="twist"
							title={isFolded(group.id) ? t('group.unfold') : t('group.fold')}
							onclick={(event) => toggleFold(event, group.id)}
						>
							<Icon name="chevron-down" size={14} />
						</button>
						<span class="gdot"></span>

						{#if renamingId === group.id}
							<input
								class="rename"
								bind:this={renameInput}
								bind:value={renameValue}
								placeholder={t('group.namePlaceholder')}
								onkeydown={onRenameKeydown}
								onblur={onRenameBlur}
								onclick={(event) => event.stopPropagation()}
							/>
							<span class="rename-acts">
								<button class="gact" title={t('group.renameConfirm')} onclick={commitRename}>
									<Icon name="check" size={14} />
								</button>
								<button class="gact" title={t('group.renameCancel')} onclick={cancelRename}>
									<Icon name="x" size={14} />
								</button>
							</span>
						{:else}
							<span class="gname">{group.name}</span>
							<span class="gcount" class:has={open > 0} title={t('group.count', { open, total })}>
								{open}/{total}
							</span>
							<span class="gacts">
								<button
									class="gact"
									title={t('group.expand')}
									onclick={(event) => expandGroup(event, group)}
								>
									<Icon name="chevrons-right" size={14} />
								</button>
								<button
									class="gact"
									title={t('group.collapse')}
									onclick={(event) => collapseGroup(event, group)}
								>
									<Icon name="chevrons-left" size={14} />
								</button>
								<button
									class="gact"
									title={t('group.more')}
									onclick={(event) => toggleMenu(event, group.id)}
								>
									<Icon name="more-horizontal" size={14} />
								</button>
							</span>
						{/if}
					</div>

					{#if !isFolded(group.id)}
						<div class="members">
							{#each members as member (member.path)}
								{@const tab = tabMap.get(member.path)}
								{#if memberDrop?.groupId === group.id && memberDrop.beforePath === member.path}
									<div class="drop-line"></div>
								{/if}
								<div
									class="member tentry"
									class:msusp={state.pinned.has(member.path)}
									class:mmiss={state.missing.has(member.path)}
									class:active-row={tab?.active === true}
									draggable={!query.trim()}
									role="button"
									tabindex="0"
									title={memberHint(member.path)}
									onmousedown={rememberPress}
									ondragstart={(event) => startMemberDrag(event, group.id, member.path)}
									ondragend={endDrag}
									ondragover={(event) => onMemberDragOver(event, group.id, member.path)}
									ondrop={(event) => onMemberDrop(event, group.id)}
									onclick={(event) => onMemberClick(event, member.path)}
									onkeydown={(event) => onMemberKeydown(event, member.path)}
									oncontextmenu={(event) => onMemberContextMenu(event, member.path)}
								>
									<Icon name={iconForPath(member.path)} size={16} cls="micon" />
									<span class="mname">{baseName(member.path)}</span>
									{#if tab && tab.paneCount > 1}
										<span
											class="tpane"
											title={t('tabs.badge.panesHint', { count: tab.paneCount })}
										>
											{t('tabs.badge.panes', { count: tab.paneCount })}
										</span>
									{/if}
									{#if tab && isPopout(tab)}
										<span class="tpane" title={t('tabs.badge.popoutHint')}>
											{t('tabs.badge.popout')}
										</span>
									{/if}
									{#if state.pinned.has(member.path)}
										<Icon name="pin" size={12} cls="mpin" />
									{/if}
									{#if state.missing.has(member.path)}
										<span class="mflag">{t('member.missing')}</span>
									{/if}
									<button
										class="mx"
										title={t('member.remove')}
										onclick={(event) => removeMember(event, group.id, member.path)}
									>
										<Icon name="x" size={12} />
									</button>
								</div>
							{/each}

							{#if memberDrop?.groupId === group.id && memberDrop.beforePath === null}
								<div class="drop-line"></div>
							{/if}
						</div>

						{#if total === 0}
							<div class="gempty">{t('group.empty')}</div>
						{/if}
					{/if}

					{#if groupDrop?.groupId === group.id && !groupDrop.before}
						<div class="drop-line"></div>
					{/if}

					{#if menuGroupId === group.id}
						<div class="tt-popover gmenu open">
							<button type="button" class="mi" onclick={(event) => startRename(event, group)}>
								<Icon name="pencil" size={14} cls="mico" />
								<span>{t('group.rename')}</span>
							</button>
							<button type="button" class="mi" onclick={(event) => openPalette(event, group.id)}>
								<Icon name="palette" size={14} cls="mico" />
								<span>{t('group.changeColor')}</span>
							</button>
							<div class="msep"></div>
							<button type="button" class="mi danger" onclick={(event) => askDelete(event, group)}>
								<Icon name="trash-2" size={14} cls="mico" />
								<span>{t('group.delete')}</span>
							</button>
						</div>
					{/if}

					{#if paletteGroupId === group.id}
						<div class="tt-popover gpalette open">
							{#each COLOR_KEYS as color (color)}
								<button
									class="sw gc-{color}"
									class:cur={group.color === color}
									aria-label={color}
									onclick={(event) => pickColor(event, group.id, color)}
								></button>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

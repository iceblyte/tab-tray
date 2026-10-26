<script lang="ts">
	import type { TrayController } from '../../controller';
	import { COLOR_KEYS, type ColorKey, type Group } from '../../core/types';
	import type { I18nKey } from '../../i18n';
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

	$effect(() => {
		if (!renamingId || !renameInput) return;
		renameInput.focus();
		renameInput.select();
	});

	function createGroup(): void {
		const id = controller.createGroup();
		if (!id) return;
		// Naming is the very next thing the user wants to do; start the inline
		// editor instead of leaving a "New group" row behind.
		folded = folded.filter((item) => item !== id);
		const group = controller.state.data.groups.find((item) => item.id === id);
		renamingId = id;
		renameValue = group?.name ?? '';
	}

	function isFolded(groupId: string): boolean {
		return folded.includes(groupId);
	}

	function toggleFold(event: MouseEvent, groupId: string): void {
		event.stopPropagation();
		folded = isFolded(groupId) ? folded.filter((id) => id !== groupId) : [...folded, groupId];
	}

	function isInteractive(target: EventTarget | null): boolean {
		return target instanceof HTMLElement && !!target.closest('button, input, .tt-popover');
	}

	function activateGroup(group: Group, append: boolean): void {
		if (renamingId) return;
		void controller.toggleGroup(group.id, append ? 'append' : 'replace');
	}

	function onGroupClick(event: MouseEvent, group: Group): void {
		if (isInteractive(event.target)) return;
		activateGroup(group, event.ctrlKey || event.metaKey);
	}

	function onGroupKeydown(event: KeyboardEvent, group: Group): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		if (isInteractive(event.target)) return;
		event.preventDefault();
		activateGroup(group, event.ctrlKey || event.metaKey);
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

	// ------------------------------------------------------------------- drag

	function startGroupDrag(event: DragEvent, groupId: string): void {
		dragGroupId = groupId;
		dragMember = null;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('application/x-tab-tray-group', groupId);
		}
	}

	function startMemberDrag(event: DragEvent, groupId: string, path: string): void {
		event.stopPropagation();
		dragMember = { groupId, path };
		dragGroupId = null;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('application/x-tab-tray-member', JSON.stringify({ groupId, path }));
		}
	}

	function endDrag(): void {
		dragGroupId = null;
		dragMember = null;
		groupDrop = null;
		memberDrop = null;
		externalHoverId = null;
	}

	function isExternalDrag(): boolean {
		return dragGroupId === null && dragMember === null;
	}

	function onHeadDragOver(event: DragEvent, groupId: string): void {
		if (dragGroupId) {
			if (dragGroupId === groupId) return;
			event.preventDefault();
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			groupDrop = { groupId, before: event.clientY < rect.top + rect.height / 2 };
			memberDrop = null;
			return;
		}
		if (dragMember) {
			event.preventDefault();
			event.stopPropagation();
			groupDrop = null;
			memberDrop = { groupId, beforePath: null };
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
			controller.moveMemberTo(dragMember.groupId, groupId, dragMember.path, null);
		} else {
			controller.addDroppedFiles(groupId, event);
		}
		endDrag();
	}

	function onMemberDrop(event: DragEvent, groupId: string): void {
		event.preventDefault();
		event.stopPropagation();
		if (dragMember) {
			controller.moveMemberTo(
				dragMember.groupId,
				groupId,
				dragMember.path,
				memberDrop?.beforePath ?? null,
			);
		} else {
			controller.addDroppedFiles(groupId, event);
		}
		endDrag();
	}

	function onGroupDragOver(event: DragEvent, groupId: string): void {
		// Group reordering is handled by the heads only.
		if (dragGroupId) return;
		event.preventDefault();
		if (dragMember) {
			memberDrop = { groupId, beforePath: null };
			return;
		}
		externalHoverId = groupId;
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function onGroupDrop(event: DragEvent, groupId: string): void {
		if (dragGroupId) return;
		event.preventDefault();
		if (dragMember) {
			controller.moveMemberTo(dragMember.groupId, groupId, dragMember.path, null);
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

<div class="tt-view">
	<div class="view-head">
		<span class="vh-title">{t('view.groups.title')}</span>
		<button class="vh-new" onclick={createGroup}>
			<Icon name="plus" size={12} />
			<span>{t('view.groups.newGroup')}</span>
		</button>
	</div>

	<div class="glist">
		{#each state.data.groups as group (group.id)}
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
					ondragstart={(event) => startGroupDrag(event, group.id)}
					ondragend={endDrag}
					ondragover={(event) => onHeadDragOver(event, group.id)}
					ondrop={(event) => onHeadDrop(event, group.id)}
					onclick={(event) => onGroupClick(event, group)}
					onkeydown={(event) => onGroupKeydown(event, group)}
				>
					<button
						class="twist"
						title={isFolded(group.id) ? t('group.expand') : t('group.collapse')}
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
						{#each group.members as member (member.path)}
							{#if memberDrop?.groupId === group.id && memberDrop.beforePath === member.path}
								<div class="drop-line"></div>
							{/if}
							<div
								class="member"
								class:msusp={state.pinned.has(member.path)}
								class:mmiss={state.missing.has(member.path)}
								draggable="true"
								role="button"
								tabindex="0"
								title={memberHint(member.path)}
								ondragstart={(event) => startMemberDrag(event, group.id, member.path)}
								ondragend={endDrag}
								ondragover={(event) => onMemberDragOver(event, group.id, member.path)}
								ondrop={(event) => onMemberDrop(event, group.id)}
								onclick={(event) => onMemberClick(event, member.path)}
								onkeydown={(event) => onMemberKeydown(event, member.path)}
							>
								<Icon name={iconForPath(member.path)} size={16} cls="micon" />
								<span class="mname">{baseName(member.path)}</span>
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

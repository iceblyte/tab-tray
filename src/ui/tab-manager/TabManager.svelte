<script lang="ts">
	import { Menu, prepareFuzzySearch } from 'obsidian';
	import type { TrayController } from '../../controller';
	import type { TabListEntry } from '../../workspace/plan';
	import type { I18nKey } from '../../i18n';
	import { addToGroupMenuItem } from '../../integrations/menus';
	import { baseName, iconForPath } from '../file-utils';
	import Icon from '../Icon.svelte';

	let { controller }: { controller: TrayController } = $props();

	// svelte-ignore state_referenced_locally
	let state = $state.raw(controller.state);
	$effect(() => controller.onChange((next) => (state = next)));

	const t = (key: I18nKey, params?: Record<string, string | number>) =>
		controller.i18n.t(key, params);

	let query = $state('');
	let folded = $state<string[]>([]);

	interface Section {
		id: string;
		name: string;
		color: string | null;
		entries: TabListEntry[];
	}

	const sections = $derived.by((): Section[] => {
		const match = query.trim() ? prepareFuzzySearch(query.trim()) : null;
		const visible = state.tabs.filter((entry) =>
			match ? match(baseName(entry.path)) !== null : true,
		);

		const result: Section[] = [];

		for (const group of state.data.groups) {
			const entries = visible.filter((entry) => entry.groupId === group.id);
			if (entries.length === 0) continue;
			result.push({ id: group.id, name: group.name, color: group.color, entries });
		}

		const ungrouped = visible.filter((entry) => entry.isVaultFile && entry.groupId === null);
		if (ungrouped.length > 0) {
			result.push({
				id: '__ungrouped',
				name: t('tabs.section.ungrouped'),
				color: null,
				entries: ungrouped,
			});
		}

		const external = visible.filter((entry) => !entry.isVaultFile);
		if (external.length > 0) {
			result.push({
				id: '__external',
				name: t('tabs.section.external'),
				color: null,
				entries: external,
			});
		}

		return result;
	});

	function isFolded(id: string): boolean {
		return folded.includes(id);
	}

	function foldSection(id: string): void {
		folded = isFolded(id) ? folded.filter((item) => item !== id) : [...folded, id];
	}

	function toggleFold(event: MouseEvent, id: string): void {
		event.stopPropagation();
		foldSection(id);
	}

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

	function onContextMenu(event: MouseEvent, entry: TabListEntry): void {
		event.preventDefault();
		event.stopPropagation();

		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle(entry.pinned ? t('tabs.unpin') : t('tabs.pin'))
				.setIcon('pin')
				.onClick(() => controller.setPinned(entry.path, !entry.pinned)),
		);

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

	function openHeaderMenu(event: MouseEvent): void {
		event.stopPropagation();
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle(t('cmd.collapseAllGroups'))
				.setIcon('chevrons-left')
				.onClick(() => {
					void controller.tidyAll();
				}),
		);
		menu.addItem((item) =>
			item
				.setTitle(t('cmd.openSidebar'))
				.setIcon('archive')
				.onClick(() => {
					void controller.openSidebar();
				}),
		);
		menu.showAtMouseEvent(event);
	}
</script>

<div class="tt-view tt-manager">
	<div class="view-head">
		<span class="vh-title">{t('view.tabs.title')}</span>
		<button class="vh-btn" title={t('group.more')} onclick={openHeaderMenu}>
			<Icon name="more-horizontal" size={14} />
		</button>
	</div>

	<div class="tm-tools">
		<input class="tm-search" bind:value={query} placeholder={t('tabs.search')} />
		<button class="tm-collapse" title={t('tabs.tidyAllHint')} onclick={() => controller.tidyAll()}>
			<Icon name="chevrons-left" size={14} />
			<span>{t('tabs.tidyAll')}</span>
		</button>
	</div>

	<div class="glist">
		{#if sections.length === 0}
			<div class="tm-empty">{query.trim() ? t('tabs.noResults') : t('tabs.empty')}</div>
		{/if}

		{#each sections as section (section.id)}
			<div class="tsec" class:empty={section.id === '__external'}>
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
					<button class="twist" onclick={(event) => toggleFold(event, section.id)}>
						<Icon name="chevron-down" size={14} />
					</button>
					{#if section.color}
						<span class="gdot gc-{section.color}"></span>
					{:else}
						<span class="gdot tt-dot-muted"></span>
					{/if}
					<span class="tsec-name">{section.name}</span>
					<span class="gcount" class:has={section.entries.length > 0}>{section.entries.length}</span>
				</div>

				{#if !isFolded(section.id)}
					<div class="members">
						{#each section.entries as entry (entry.path)}
							<div
								class="member tentry"
								class:active-row={entry.active}
								role="button"
								tabindex="0"
								title={entry.path}
								onclick={() => onEntryClick(entry)}
								onkeydown={(event) => onEntryKeydown(event, entry)}
								oncontextmenu={(event) => onContextMenu(event, entry)}
							>
								<Icon name={iconForPath(entry.path)} size={16} cls="micon" />
								<span class="mname">{baseName(entry.path)}</span>
								{#if entry.paneCount > 1}
									<span class="tpane">{t('tabs.badge.panes', { count: entry.paneCount })}</span>
								{/if}
								{#if isPopout(entry)}
									<span class="tpane">{t('tabs.badge.popout')}</span>
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
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

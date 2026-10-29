/**
 * F8 — English copy is the key set of record. `zh-cn.ts` is typed against it,
 * so a missing translation is a compile error rather than a runtime blank.
 */
export const en = {
	// Sidebar (F1)
	'view.groups.title': 'Tab Tray',
	'view.groups.newGroup': 'New group',
	'group.defaultName': 'New group',
	'group.expand': 'Expand (replaces the active pane) · Ctrl/Cmd = append',
	'group.collapse': 'Collapse',
	'group.more': 'More actions',
	'group.count': '{open} of {total} open',
	'group.empty': 'Drag files here, or right-click a file → “Add to group”',
	'group.fold': 'Fold list',
	'group.unfold': 'Unfold list',
	'group.rename': 'Rename',
	'group.changeColor': 'Change color',
	'group.delete': 'Delete group…',
	'group.namePlaceholder': 'Group name',
	'group.renameConfirm': 'Confirm (Enter)',
	'group.renameCancel': 'Cancel (Esc)',

	// Members
	'member.openHint': 'Opened → click to focus; Ctrl/Cmd opens a new tab',
	'member.closedHint': 'Not open → click to open in the active pane; Ctrl/Cmd opens a new tab',
	'member.missingHint': 'Missing: the file was moved or deleted outside Obsidian',
	'member.missing': 'missing',
	'member.pinnedHint': 'Pinned — skipped when collapsing; unpin to make it a normal member again',
	'member.remove': 'Remove from group',

	// Delete confirmation (A1)
	'modal.delete.title': 'Delete group',
	'modal.delete.body':
		'Delete group “{name}”? Its {count} members will be detached from the group, but no files will be deleted. This cannot be undone.',
	'modal.delete.cancel': 'Cancel',
	'modal.delete.confirm': 'Delete group',

	// New group (F3-6)
	'modal.newGroup.title': 'New group',
	'modal.newGroup.name': 'Name',
	'modal.newGroup.color': 'Colour',
	'modal.newGroup.cancel': 'Cancel',
	'modal.newGroup.create': 'Create group',

	// Tab manager (F9)
	'tabs.search': 'Search groups and tabs…',
	'tabs.tidyAll': 'Tidy all',
	'tabs.tidyAllHint': 'Collapse every group: pinned, external and ungrouped tabs stay',
	'tabs.section.pinned': 'Pinned',
	'tabs.section.ungrouped': 'Ungrouped',
	'tabs.section.external': 'External',
	'tabs.badge.external': 'external',
	'tabs.badge.panes': '×{count}',
	'tabs.badge.panesHint': 'Open in {count} panes',
	'tabs.badge.popoutHint': 'Open in another window',
	'tabs.badge.popout': 'Popout',
	'tabs.noResults': 'No matching items',
	'tabs.pin': 'Pin',
	'tabs.unpin': 'Unpin',
	'tabs.close': 'Close',
	'tabs.closeOthers': 'Close others',

	// Context menus (F3)
	'menu.addToGroup': 'Add to group',
	'menu.removeFromGroup': 'Remove from “{name}” group',
	'menu.newGroup': 'New group…',

	// Commands (F6)
	'cmd.openGroup': 'Open group: {name}',
	'cmd.collapseGroup': 'Collapse group: {name}',
	'cmd.newGroup': 'New group',
	'cmd.collapseActiveGroup': "Collapse the active group's tabs",
	'cmd.openSidebar': 'Open group sidebar',
	'cmd.openTabManager': 'Open tab manager',
	'cmd.collapseAllGroups': 'Collapse all groups',

	// Notices
	'notice.expanded': 'Expanded “{name}” — opened {count} tabs.',
	'notice.expandedReplaced': 'Expanded “{name}” — replaced {count} tabs in the active pane.',
	'notice.firstExpandHint': 'First-use hint: hold Ctrl/Cmd to append instead of replacing',
	'notice.collapsed': 'Collapsed “{name}” — closed {count} tabs.',
	'notice.collapsedPinned':
		'Collapsed “{name}”: {count} members were left open because they are pinned.',
	'notice.nothingToCollapse': 'No tabs from “{name}” are open in this window.',
	'notice.nothingToCollapseAll': 'No group tabs are open in this window.',
	'notice.collapsedAll': 'Collapsed all groups — closed {count} tabs.',
	'notice.pinnedBlocked': 'This tab is pinned — unpin it before adding it to a group.',
	'notice.externalBlocked': 'Files outside the vault cannot be added to a group.',
	'notice.moved': 'Moved from “{from}” to “{to}”.',
	'notice.softLimit': '“{name}” now has {count} members (soft limit {limit}). You can keep adding.',
	'notice.groupDeleted': 'Deleted group “{name}”.',
	'notice.pinnedRemoved': 'Pinned — removed “{file}” from “{group}”.',
	'notice.pinnedRemovedMany': 'Pinned — removed {count} members from their groups.',
	'notice.memberRemoved': 'Removed “{file}” from “{group}”.',
	'notice.noActiveGroup': 'The active tab does not belong to any group.',
	'notice.openFailed': 'Could not open “{name}”.',
	'notice.missingSkipped': '{count} missing members were skipped.',
	'notice.closeFailed': '{count} tabs could not be closed.',
	'notice.persistFailed':
		'The last change has not been written to disk yet — retrying automatically.',
	'notice.persistPaused':
		'data.json could not be read; writing is paused so your file is not overwritten.',
	'notice.loadedBackup': 'The main data file was damaged — loaded the backup instead.',
	'notice.syncConflict': 'A config sync conflict was detected — the newest version was loaded.',
	'notice.futureVersion':
		'This data file was created by a newer version of Tab Tray. It was left untouched.',
	'notice.unreadable': 'The data file could not be read. Starting with an empty configuration.',
	'notice.corruptPreserved': 'The unreadable data file was preserved as {file}.',
	'notice.compactUnavailable':
		'Compact pinned tabs are unavailable in this Obsidian version — grouping is unaffected.',
	'notice.rejected': 'The change was rejected ({reason}).',

	// Merged sidebar
	'panel.empty': 'No groups yet — right-click a file → “Add to group”, or drop files here.',

	// Settings
	'settings.subtitle': 'Group sidebar + compact pinned row',
	'settings.general.title': 'General',
	'settings.language.name': 'Language',
	'settings.language.desc': 'UI language; “Auto” follows the Obsidian language setting.',
	'settings.language.auto': 'Auto (follow Obsidian)',
	'settings.language.zh': '简体中文',
	'settings.language.en': 'English',
	'settings.compact.name': 'Compact pinned tabs',
	'settings.compact.desc':
		'Shrink pinned tabs into icons at the start of the tab bar, with full-name tooltips; right and middle click stay native. Turning this off restores the Obsidian default.',
	'settings.compact.unavailable':
		'Compact pinned tabs are unavailable in this Obsidian version — grouping is unaffected.',
	'settings.colors.name': 'Colour group tabs',
	'settings.colors.desc':
		'Tint the tab header of every group member with its group colour. Files outside a group are never tinted.',
	'settings.softLimit.name': 'Soft member limit',
	'settings.softLimit.desc':
		'Warn once when a group exceeds this member count, but never block adding.',
	'settings.data.title': 'Data & persistence',
	'settings.data.desc':
		'Groups live in `.obsidian/plugins/tab-tray/data.json`: every change is written within 500 ms using an atomic replace, rotating a `data.json.bak` copy first. A damaged main file falls back to the backup; sync-conflict copies are arbitrated by modification time. Disabling or uninstalling the plugin **never deletes** your data.',
	'settings.about.title': 'About',
	'settings.about.name': 'Tab Tray v{version} · MIT License',
	'settings.about.desc': 'Browser-style tab grouping and pinning for Obsidian desktop.',
	'settings.about.sponsor': 'Sponsor on Afdian',
} as const;

export type I18nKey = keyof typeof en;

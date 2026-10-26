import { Menu, type Plugin, TFile } from 'obsidian';
import type { TrayController } from '../controller';

/**
 * F3-1 / F3-2 / F3-6 — the "add to group" context-menu entry.
 *
 * Two lessons are baked in here.
 *
 * 1. No `source` filtering. The string Obsidian passes for the file explorer is
 *    not documented and differs from the tab header's, so filtering on it made
 *    the entry vanish from the file tree entirely. Every file menu gets the
 *    entry; a menu on a file is the right place for it anyway.
 *
 * 2. The group list opens on the *next* task, not inside the click. Obsidian
 *    closes menus with a document-level listener, and a menu created during the
 *    same click would be closed by that listener before it is ever painted —
 *    which looked exactly like "clicking does nothing".
 */

export function registerMenus(plugin: Plugin, controller: TrayController): void {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu: Menu, file) => {
			if (!(file instanceof TFile)) return;
			try {
				addToGroupMenuItem(menu, controller, file.path);
			} catch (error) {
				console.error('[tab-tray] could not build the file menu entry', error);
			}
		}),
	);
}

/** Shared by F3-1, F3-2 and F3-6 so all three behave identically. */
export function addToGroupMenuItem(menu: Menu, controller: TrayController, path: string): void {
	menu.addSeparator();
	menu.addItem((item) => {
		item
			.setTitle(controller.i18n.t('menu.addToGroup'))
			.setIcon('folder-plus')
			.onClick((event) => {
				// Defer past the current click so the parent menu's closing
				// handler cannot swallow the list we are about to open.
				window.setTimeout(() => openGroupMenu(event, controller, path), 0);
			});
	});
}

function openGroupMenu(
	event: MouseEvent | KeyboardEvent,
	controller: TrayController,
	path: string,
): void {
	const menu = new Menu();
	const owner = controller.groupOfPath(path);

	for (const group of controller.state.data.groups) {
		menu.addItem((item) =>
			item
				.setTitle(group.name)
				.setIcon(owner?.id === group.id ? 'check' : 'circle')
				.onClick(() => controller.addMember(group.id, path)),
		);
	}

	if (controller.state.data.groups.length > 0) menu.addSeparator();

	menu.addItem((item) =>
		item
			.setTitle(controller.i18n.t('menu.newGroup'))
			.setIcon('plus')
			.onClick(() => {
				const groupId = controller.createGroup();
				if (groupId) controller.addMember(groupId, path);
			}),
	);

	if (event instanceof MouseEvent) {
		menu.showAtMouseEvent(event);
		return;
	}

	const rect = (event.target as HTMLElement | null)?.getBoundingClientRect();
	menu.showAtPosition({ x: rect?.left ?? 120, y: rect?.bottom ?? 120 });
}

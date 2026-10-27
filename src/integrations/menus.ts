import {
	type App,
	FileView,
	Menu,
	type MenuItem,
	type Plugin,
	TFile,
	type WorkspaceLeaf,
} from 'obsidian';
import type { TrayController } from '../controller';

/**
 * F3-1 / F3-2 / F3-6 — the "add to group" context-menu entry.
 *
 * Three host facts shape this file, all verified against the shipped app:
 *
 * 1. `file-menu` is only fired from a tab header when the tab is *visible*.
 *    Obsidian guards its pane menu with `leaf.isVisible()`, so right-clicking a
 *    background tab produced a shorter menu with no entry. The supplement below
 *    recovers the same `Menu` instance from the contextmenu event and adds the
 *    entry there, which is why it now works on every tab.
 *
 * 2. `MenuItem.setSubmenu()` exists at runtime but is missing from the published
 *    typings. It builds the native hover flyout (the same one "Copy path ›"
 *    uses). When it is unavailable the entry falls back to a second menu on
 *    click, so the feature degrades instead of disappearing.
 *
 * 3. No `source` filtering for the file explorer. The string Obsidian passes
 *    there is not documented and differs from the tab header's, so filtering on
 *    it made the entry vanish from the file tree entirely.
 */

const TAB_HEADER_SELECTOR = '.workspace-tab-header';
const SIDEBAR_SELECTOR = '.mod-left-split, .mod-right-split';

interface SubmenuCapableItem extends MenuItem {
	setSubmenu?: () => Menu;
}

interface MenuInternals {
	items?: Array<{ titleEl?: HTMLElement }>;
}

interface MenuStatics {
	forEvent?: (event: MouseEvent) => Menu;
}

type LeafWithHeader = WorkspaceLeaf & { tabHeaderEl?: HTMLElement };

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

	const supplement = (event: MouseEvent) => {
		try {
			supplementTabHeaderMenu(plugin.app, event, controller);
		} catch (error) {
			console.error('[tab-tray] could not extend the tab menu', error);
		}
	};

	plugin.registerDomEvent(document, 'contextmenu', supplement);

	// Popout windows have their own document, and their tab headers deserve the
	// same entry. The event is cheap to register and is removed on unload.
	plugin.registerEvent(
		plugin.app.workspace.on('window-open', (_windowEl, win) => {
			if (!win?.document) return;
			plugin.registerDomEvent(win.document, 'contextmenu', supplement);
		}),
	);
}

/** Shared by F3-1, F3-2 and F3-6 so all three behave identically. */
export function addToGroupMenuItem(menu: Menu, controller: TrayController, path: string): void {
	const title = controller.i18n.t('menu.addToGroup');
	if (hasItem(menu, title)) return;

	menu.addSeparator();
	menu.addItem((item) => {
		item.setTitle(title);

		// Native flyout when the host supports it. `setSubmenu` is internal but
		// stable enough that its absence is the only thing we need to handle.
		// The leading icon is added only on the fallback path: a submenu item
		// already gets the host's chevron, and two icons look wrong.
		let submenu: Menu | null = null;
		try {
			submenu = (item as SubmenuCapableItem).setSubmenu?.() ?? null;
		} catch {
			submenu = null;
		}
		if (submenu) {
			fillGroupMenu(submenu, controller, path);
			return;
		}

		item.setIcon('folder-plus').onClick((event) => {
			// Defer past the current click so the parent menu's closing handler
			// cannot swallow the list we are about to open.
			window.setTimeout(() => openGroupMenu(event, controller, path), 0);
		});
	});
}

/**
 * Background tab headers never reach `file-menu`, so the menu is recovered from
 * the event itself. `Menu.forEvent` is the same helper Obsidian used to create
 * it: the event is the key, so this returns that exact instance.
 */
function supplementTabHeaderMenu(app: App, event: MouseEvent, controller: TrayController): void {
	// `defaultPrevented` is set by Obsidian's own handler. Without it the event
	// is some other right click, and asking for a menu would create a stray one.
	if (!event.defaultPrevented) return;

	const target = event.target;
	if (!(target instanceof HTMLElement)) return;

	const header = target.closest<HTMLElement>(TAB_HEADER_SELECTOR);
	if (!header || header.closest(SIDEBAR_SELECTOR)) return;

	const path = pathForHeader(app, header);
	if (!path) return;

	const menu = menuForEvent(event);
	if (!menu) return;

	addToGroupMenuItem(menu, controller, path);
}

function menuForEvent(event: MouseEvent): Menu | null {
	const factory = (Menu as unknown as MenuStatics).forEvent;
	if (typeof factory !== 'function') return null;
	const menu = factory(event);
	return menu instanceof Menu ? menu : null;
}

/**
 * Leaf → header pairing uses the leaf's own `tabHeaderEl` reference, not an
 * index. Index pairing was the original cause of the compact-row bug; this one
 * cannot drift when a tab is inserted or dragged.
 */
function pathForHeader(app: App, header: HTMLElement): string | null {
	let match: WorkspaceLeaf | null = null;

	app.workspace.iterateAllLeaves((leaf) => {
		if ((leaf as LeafWithHeader).tabHeaderEl === header) match = leaf;
	});

	if (!match) return null;
	const view = (match as WorkspaceLeaf).view;
	return view instanceof FileView ? (view.file?.path ?? null) : null;
}

function hasItem(menu: Menu, title: string): boolean {
	const items = (menu as unknown as MenuInternals).items;
	return Array.isArray(items) && items.some((item) => item.titleEl?.textContent === title);
}

function fillGroupMenu(menu: Menu, controller: TrayController, path: string): void {
	const owner = controller.groupOfPath(path);
	const groups = controller.state.data.groups;

	for (const group of groups) {
		menu.addItem((item) =>
			item
				.setTitle(group.name)
				.setIcon(owner?.id === group.id ? 'check' : 'circle')
				.onClick(() => controller.addMember(group.id, path)),
		);
	}

	if (groups.length > 0) menu.addSeparator();

	menu.addItem((item) =>
		item
			.setTitle(controller.i18n.t('menu.newGroup'))
			.setIcon('plus')
			.onClick(() => {
				// The group is created only after the user names it and picks a
				// colour; then the file joins it in one step.
				controller.promptNewGroup((groupId) => controller.addMember(groupId, path));
			}),
	);
}

function openGroupMenu(
	event: MouseEvent | KeyboardEvent,
	controller: TrayController,
	path: string,
): void {
	const menu = new Menu();
	fillGroupMenu(menu, controller, path);

	if (event instanceof MouseEvent) {
		menu.showAtMouseEvent(event);
		return;
	}

	const rect = (event.target as HTMLElement | null)?.getBoundingClientRect();
	menu.showAtPosition({ x: rect?.left ?? 120, y: rect?.bottom ?? 120 });
}

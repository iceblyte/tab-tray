import { Menu, type MenuItem, type Plugin, setIcon, TFile } from 'obsidian';
import type { TrayController } from '../controller';

/**
 * F3-1 / F3-2 / F3-6 — the context-menu entries.
 *
 * Both the file explorer and the tab header fire the official `file-menu`
 * event; `source` tells them apart. Obsidian has no submenu API on `MenuItem`,
 * so the nested list is injected into the item's element when that element is
 * reachable, and falls back to a second native menu on click (keyboard users
 * always take the fallback).
 */

const SUBMENU_CLASS = 'tab-tray-submenu';
const SUBMENU_OPEN_CLASS = 'is-open';

export function registerMenus(plugin: Plugin, controller: TrayController): void {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu: Menu, file, source: string) => {
			if (source !== 'file-explorer' && source !== 'tab-header') return;
			if (!(file instanceof TFile)) return;
			addToGroupMenuItem(menu, controller, file.path);
		}),
	);
}

/** Shared by F3-1, F3-2 and F3-6 so all three read identically. */
export function addToGroupMenuItem(menu: Menu, controller: TrayController, path: string): void {
	const holder: { item: MenuItem | null } = { item: null };

	menu.addSeparator();
	menu.addItem((item) => {
		holder.item = item;
		item.setTitle(controller.i18n.t('menu.addToGroup')).setIcon('folder-plus');
	});

	const item = holder.item;
	if (!item) return;

	const dom = (item as unknown as { dom?: HTMLElement }).dom;
	const submenu = dom instanceof HTMLElement ? attachSubmenu(dom, menu, controller, path) : null;

	item.onClick((event) => {
		if (submenu?.classList.contains(SUBMENU_OPEN_CLASS)) return;
		openFallbackMenu(event, controller, path, () => menu.close());
	});
}

function attachSubmenu(
	host: HTMLElement,
	menu: Menu,
	controller: TrayController,
	path: string,
): HTMLElement {
	const doc = host.ownerDocument;
	host.classList.add('has-submenu');

	const submenu = doc.createElement('div');
	submenu.className = `menu ${SUBMENU_CLASS}`;

	const owner = controller.groupOfPath(path);

	for (const group of controller.state.data.groups) {
		const entry = doc.createElement('div');
		entry.className = 'menu-item';

		const icon = doc.createElement('div');
		icon.className = 'menu-item-icon';
		icon.style.color = `var(--tt-g-${group.color})`;
		setIcon(icon, owner?.id === group.id ? 'check' : 'circle');

		const title = doc.createElement('div');
		title.className = 'menu-item-title';
		title.setText(group.name);

		entry.append(icon, title);
		entry.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			controller.addMember(group.id, path);
			menu.close();
		});
		submenu.append(entry);
	}

	if (controller.state.data.groups.length > 0) {
		const separator = doc.createElement('div');
		separator.className = 'menu-separator';
		submenu.append(separator);
	}

	const create = doc.createElement('div');
	create.className = 'menu-item';
	const createIcon = doc.createElement('div');
	createIcon.className = 'menu-item-icon';
	setIcon(createIcon, 'plus');
	const createTitle = doc.createElement('div');
	createTitle.className = 'menu-item-title';
	createTitle.setText(controller.i18n.t('menu.newGroup'));
	create.append(createIcon, createTitle);
	create.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		const groupId = controller.createGroup();
		if (groupId) controller.addMember(groupId, path);
		menu.close();
	});
	submenu.append(create);

	host.append(submenu);
	host.addEventListener('mouseenter', () => submenu.classList.add(SUBMENU_OPEN_CLASS));
	host.addEventListener('mouseleave', () => submenu.classList.remove(SUBMENU_OPEN_CLASS));

	return submenu;
}

function openFallbackMenu(
	event: MouseEvent | KeyboardEvent,
	controller: TrayController,
	path: string,
	beforeOpen?: () => void,
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

	beforeOpen?.();

	if (event instanceof MouseEvent) {
		menu.showAtMouseEvent(event);
		return;
	}

	const rect = (event.target as HTMLElement | null)?.getBoundingClientRect();
	menu.showAtPosition({ x: rect?.left ?? 120, y: rect?.bottom ?? 120 });
}

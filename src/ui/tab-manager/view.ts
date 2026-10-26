import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type { TrayController } from '../../controller';
import { VIEW_TYPE_MANAGER } from '../view-types';
import { mountTabManager } from './mount';

/** F9 — the tab manager panel in the right sidebar. */
export class TabManagerView extends ItemView {
	readonly #controller: TrayController;
	#destroy: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, controller: TrayController) {
		super(leaf);
		this.#controller = controller;
	}

	override getViewType(): string {
		return VIEW_TYPE_MANAGER;
	}

	override getDisplayText(): string {
		return this.#controller.i18n.t('view.tabs.title');
	}

	override getIcon(): string {
		return 'layout-list';
	}

	override async onOpen(): Promise<void> {
		this.contentEl.addClass('tab-tray-view', 'tab-tray-manager-view');
		this.#destroy = mountTabManager(this.contentEl, this.#controller);
	}

	override async onClose(): Promise<void> {
		this.#destroy?.();
		this.#destroy = null;
		this.contentEl.removeClass('tab-tray-view', 'tab-tray-manager-view');
	}
}

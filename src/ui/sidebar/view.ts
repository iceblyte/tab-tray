import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type { TrayController } from '../../controller';
import { VIEW_TYPE_GROUPS } from '../view-types';
import { mountSidebar } from './mount';

/** F1 — the group sidebar. A disposable subscriber of the controller (P5). */
export class GroupsView extends ItemView {
	readonly #controller: TrayController;
	#destroy: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, controller: TrayController) {
		super(leaf);
		this.#controller = controller;
	}

	override getViewType(): string {
		return VIEW_TYPE_GROUPS;
	}

	override getDisplayText(): string {
		return this.#controller.i18n.t('view.groups.title');
	}

	override getIcon(): string {
		return 'archive';
	}

	override async onOpen(): Promise<void> {
		this.contentEl.addClass('tab-tray-view');
		this.#destroy = mountSidebar(this.contentEl, this.#controller);
	}

	override async onClose(): Promise<void> {
		this.#destroy?.();
		this.#destroy = null;
		this.contentEl.removeClass('tab-tray-view');
	}
}

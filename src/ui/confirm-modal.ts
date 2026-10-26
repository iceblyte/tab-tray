import { type App, Modal } from 'obsidian';

export interface ConfirmOptions {
	title: string;
	body: string;
	params: Record<string, string | number>;
	/** Parameter names that render in <b>, mirroring the prototype's emphasis. */
	bold?: string[];
	cancel: string;
	confirm: string;
	onConfirm: () => void;
}

/** A1 — destructive actions always go through a native modal. */
export class ConfirmModal extends Modal {
	readonly #options: ConfirmOptions;

	constructor(app: App, options: ConfirmOptions) {
		super(app);
		this.#options = options;
	}

	override onOpen(): void {
		const { title, body, params, bold = [], cancel, confirm } = this.#options;

		this.titleEl.setText(title);
		const paragraph = this.contentEl.createEl('p', { cls: 'tt-modal-body' });
		renderTemplate(paragraph, body, params, bold);

		const actions = this.contentEl.createDiv({ cls: 'tt-modal-acts' });
		const cancelButton = actions.createEl('button', { text: cancel });
		cancelButton.onclick = () => this.close();

		const confirmButton = actions.createEl('button', {
			text: confirm,
			cls: 'mod-warning',
		});
		confirmButton.onclick = () => {
			this.close();
			this.#options.onConfirm();
		};
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Fills a dictionary template without ever parsing HTML: user-supplied values
 * (group names) are appended as text nodes, so a name like `<img onerror>` is
 * inert.
 */
export function renderTemplate(
	parent: HTMLElement,
	template: string,
	params: Record<string, string | number>,
	bold: string[],
): void {
	for (const part of template.split(/(\{\w+\})/)) {
		const match = /^\{(\w+)\}$/.exec(part);
		if (!match) {
			if (part) parent.appendText(part);
			continue;
		}

		const key = match[1] ?? '';
		const value = params[key];
		if (value === undefined) {
			parent.appendText(part);
			continue;
		}
		if (bold.includes(key)) parent.createEl('b', { text: String(value) });
		else parent.appendText(String(value));
	}
}

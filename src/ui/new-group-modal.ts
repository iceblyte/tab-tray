import { type App, Modal } from 'obsidian';
import { COLOR_KEYS, type ColorKey } from '../core/types';
import type { I18n } from '../i18n';

export interface NewGroupOptions {
	i18n: I18n;
	initialName: string;
	initialColor: ColorKey;
	/** Called only on submit; cancelling leaves the store untouched. */
	onSubmit: (name: string, color: ColorKey) => void;
}

/**
 * Name + colour in one step.
 *
 * The alternative — create a default group and rename it afterwards — made
 * "new group" from the add-to-group menu drop the file into a group the user
 * had not named yet, and made the colour a second trip through the group menu.
 * Here nothing is written until Create is pressed.
 */
export class NewGroupModal extends Modal {
	readonly #options: NewGroupOptions;
	#name: string;
	#color: ColorKey;
	#input: HTMLInputElement | null = null;

	constructor(app: App, options: NewGroupOptions) {
		super(app);
		this.#options = options;
		this.#name = options.initialName;
		this.#color = options.initialColor;
	}

	override onOpen(): void {
		this.modalEl.addClass('tab-tray-new-group');
		this.titleEl.setText(this.#options.i18n.t('modal.newGroup.title'));

		const nameField = this.contentEl.createDiv({ cls: 'tt-field' });
		nameField.createEl('label', {
			cls: 'tt-field-label',
			text: this.#options.i18n.t('modal.newGroup.name'),
		});

		const input = nameField.createEl('input', { type: 'text' });
		input.value = this.#name;
		input.placeholder = this.#options.i18n.t('group.namePlaceholder');
		input.addEventListener('input', () => {
			this.#name = input.value;
		});
		input.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter') return;
			event.preventDefault();
			this.#submit();
		});
		this.#input = input;

		const colorField = this.contentEl.createDiv({ cls: 'tt-field' });
		colorField.createEl('label', {
			cls: 'tt-field-label',
			text: this.#options.i18n.t('modal.newGroup.color'),
		});
		const swatches = colorField.createDiv({ cls: 'tt-swatches' });

		for (const color of COLOR_KEYS) {
			const swatch = swatches.createEl('button', {
				cls: `tt-swatch gc-${color}`,
				attr: { type: 'button', 'aria-label': color },
			});
			swatch.setAttribute('aria-pressed', String(color === this.#color));
			swatch.toggleClass('cur', color === this.#color);

			swatch.addEventListener('click', () => {
				this.#color = color;
				for (const el of Array.from(swatches.children)) {
					const current = el === swatch;
					el.toggleClass('cur', current);
					el.setAttribute('aria-pressed', String(current));
				}
			});
		}

		const actions = this.contentEl.createDiv({ cls: 'tt-modal-acts' });
		const cancel = actions.createEl('button', {
			text: this.#options.i18n.t('modal.newGroup.cancel'),
		});
		cancel.onclick = () => this.close();

		const create = actions.createEl('button', {
			text: this.#options.i18n.t('modal.newGroup.create'),
			cls: 'mod-cta',
		});
		create.onclick = () => this.#submit();

		// Focus after the modal's own open animation settles.
		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 0);
	}

	override onClose(): void {
		this.contentEl.empty();
		this.#input = null;
	}

	#submit(): void {
		const name = this.#name.trim();
		if (!name) {
			this.#input?.focus();
			return;
		}

		// Close first: the callback may open a Notice or another modal.
		this.close();
		this.#options.onSubmit(name, this.#color);
	}
}

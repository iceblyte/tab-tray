import { type App, type Plugin, PluginSettingTab, Setting, setIcon } from 'obsidian';
import type { Settings } from './core/types';
import { MAX_SOFT_LIMIT, MIN_SOFT_LIMIT } from './core/types';
import type { I18n, I18nKey } from './i18n';

/**
 * F4 / F8 / R9 — the settings page mirrors the prototype's rows.
 *
 * Native `Setting` rows are used on purpose: the prototype's settings screen is
 * a mock of Obsidian's own shell, so the real component is the closest match
 * and inherits theme, keyboard and accessibility behaviour for free.
 */

export interface SettingsHost {
	readonly i18n: I18n;
	readonly version: string;
	getSettings(): Settings;
	updateSettings(patch: Partial<Settings>): void;
}

const SPONSOR_URL = 'https://afdian.com/a/iceblyte';

export class TabTraySettingTab extends PluginSettingTab {
	readonly #host: SettingsHost;

	constructor(app: App, plugin: Plugin, host: SettingsHost) {
		super(app, plugin);
		this.#host = host;
	}

	override display(): void {
		const { containerEl } = this;
		const t = (key: I18nKey, params?: Record<string, string | number>) =>
			this.#host.i18n.t(key, params);
		const settings = this.#host.getSettings();

		containerEl.empty();
		containerEl.addClass('tab-tray-settings');

		const header = containerEl.createDiv({ cls: 'tab-tray-settings-header' });
		header.createEl('h2', { text: 'Tab Tray' });
		header.createEl('p', {
			text: `v${this.#host.version} · MIT · ${t('settings.subtitle')}`,
		});

		this.#heading(containerEl, t('settings.general.title'));

		new Setting(containerEl)
			.setName(t('settings.language.name'))
			.setDesc(t('settings.language.desc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('auto', t('settings.language.auto'))
					.addOption('zh-CN', t('settings.language.zh'))
					.addOption('en', t('settings.language.en'))
					.setValue(settings.language)
					.onChange((value) => {
						this.#host.updateSettings({ language: value as Settings['language'] });
						// Re-render so the page itself switches language immediately.
						this.display();
					}),
			);

		const compact = new Setting(containerEl)
			.setName(t('settings.compact.name'))
			.setDesc(t('settings.compact.desc'))
			.addToggle((toggle) =>
				toggle
					.setValue(settings.compactPinnedRow && settings.compactPinnedRowAvailable)
					.setDisabled(!settings.compactPinnedRowAvailable)
					.onChange((value) => this.#host.updateSettings({ compactPinnedRow: value })),
			);

		if (!settings.compactPinnedRowAvailable) {
			compact.settingEl.addClass('tab-tray-setting-degraded');
			containerEl.createDiv({
				cls: 'tab-tray-setting-note mod-warning',
				text: `⚠ ${t('settings.compact.unavailable')}`,
			});
		}

		new Setting(containerEl)
			.setName(t('settings.colors.name'))
			.setDesc(t('settings.colors.desc'))
			.addToggle((toggle) =>
				toggle
					.setValue(settings.groupColors)
					.onChange((value) => this.#host.updateSettings({ groupColors: value })),
			);

		new Setting(containerEl)
			.setName(t('settings.softLimit.name'))
			.setDesc(t('settings.softLimit.desc'))
			.addText((text) => {
				text.inputEl.type = 'number';
				text.inputEl.min = String(MIN_SOFT_LIMIT);
				text.inputEl.max = String(MAX_SOFT_LIMIT);
				text.inputEl.addClass('tab-tray-soft-limit');
				text.setValue(String(settings.softLimit)).onChange((value) => {
					const parsed = Number.parseInt(value, 10);
					if (Number.isFinite(parsed)) this.#host.updateSettings({ softLimit: parsed });
				});
			});

		this.#heading(containerEl, t('settings.data.title'));
		// Static dictionary copy — the only markup is our own <code>/<b>.
		containerEl.createDiv({ cls: 'tab-tray-setting-note' }).innerHTML = t('settings.data.desc');

		this.#heading(containerEl, t('settings.about.title'));
		const about = new Setting(containerEl)
			.setName(t('settings.about.name', { version: this.#host.version }))
			.setDesc(t('settings.about.desc'));

		const link = about.controlEl.createEl('a', {
			cls: 'tab-tray-sponsor',
			href: SPONSOR_URL,
			attr: { target: '_blank', rel: 'noreferrer' },
		});
		const icon = link.createSpan({ cls: 'tab-tray-sponsor-icon' });
		setIcon(icon, 'heart');
		link.createSpan({ text: t('settings.about.sponsor') });
	}

	#heading(parent: HTMLElement, title: string): void {
		parent.createEl('h3', { text: title, cls: 'setting-item-heading' });
	}
}

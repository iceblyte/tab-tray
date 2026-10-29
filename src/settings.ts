import {
	type App,
	type Plugin,
	PluginSettingTab,
	type SettingDefinitionItem,
	setIcon,
} from 'obsidian';
import type { Settings } from './core/types';
import { MAX_SOFT_LIMIT, MIN_SOFT_LIMIT } from './core/types';
import type { I18n, I18nKey } from './i18n';

/**
 * F4 / F8 / R9 — the settings page mirrors the prototype's rows.
 *
 * The declarative API is used on purpose: the host renders every row, indexes
 * it for the settings search, and re-renders the page on `update()`. A custom
 * `display()` would be skipped entirely once `getSettingDefinitions()` returns
 * rows, and would keep the page out of search.
 *
 * `getControlValue` / `setControlValue` bridge to the store, which stays the
 * single writer (D7) — `plugin.saveData()` is never used.
 */

export interface SettingsHost {
	readonly i18n: I18n;
	readonly version: string;
	getSettings(): Settings;
	updateSettings(patch: Partial<Settings>): void;
}

type Translate = (key: I18nKey, params?: Record<string, string | number>) => string;

const SPONSOR_URL = 'https://afdian.com/a/iceblyte';

export class TabTraySettingTab extends PluginSettingTab {
	readonly #host: SettingsHost;

	constructor(app: App, plugin: Plugin, host: SettingsHost) {
		super(app, plugin);
		this.#host = host;
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		const t: Translate = (key, params) => this.#host.i18n.t(key, params);
		const settings = this.#host.getSettings();
		const compactAvailable = settings.compactPinnedRowAvailable;

		return [
			{
				name: 'Tab Tray',
				desc: `v${this.#host.version} · MIT · ${t('settings.subtitle')}`,
			},
			{
				type: 'group',
				heading: t('settings.general.title'),
				items: [
					{
						name: t('settings.language.name'),
						desc: t('settings.language.desc'),
						control: {
							type: 'dropdown',
							key: 'language',
							options: {
								auto: t('settings.language.auto'),
								'zh-CN': t('settings.language.zh'),
								en: t('settings.language.en'),
							},
						},
					},
					{
						name: t('settings.compact.name'),
						desc: compactAvailable ? t('settings.compact.desc') : compactUnavailableDesc(t),
						control: {
							type: 'toggle',
							key: 'compactPinnedRow',
							disabled: !compactAvailable,
						},
					},
					{
						name: t('settings.colors.name'),
						desc: t('settings.colors.desc'),
						control: { type: 'toggle', key: 'groupColors' },
					},
					{
						name: t('settings.softLimit.name'),
						desc: t('settings.softLimit.desc'),
						control: {
							type: 'number',
							key: 'softLimit',
							min: MIN_SOFT_LIMIT,
							max: MAX_SOFT_LIMIT,
						},
					},
				],
			},
			{
				name: t('settings.data.title'),
				desc: storageNote(t('settings.data.desc')),
			},
			{
				name: t('settings.about.name', { version: this.#host.version }),
				desc: aboutDesc(t),
			},
		];
	}

	override getControlValue(key: string): unknown {
		return this.#host.getSettings()[key as keyof Settings];
	}

	override setControlValue(key: string, value: unknown): void {
		switch (key) {
			case 'language':
				this.#host.updateSettings({ language: value as Settings['language'] });
				// Every label on the page is translated, so the definitions
				// themselves change — only `update()` rebuilds them. Deferred
				// because the host is still finishing this control's own render
				// pass when the callback fires.
				window.setTimeout(() => this.update(), 0);
				return;
			case 'compactPinnedRow':
				this.#host.updateSettings({ compactPinnedRow: value === true });
				return;
			case 'groupColors':
				this.#host.updateSettings({ groupColors: value === true });
				return;
			case 'softLimit': {
				const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
				if (Number.isFinite(parsed)) this.#host.updateSettings({ softLimit: parsed });
				return;
			}
			default:
				return;
		}
	}
}

/**
 * The compact toggle explains itself when the host cannot provide the row, so
 * the degraded state is visible without a second, control-less row.
 */
function compactUnavailableDesc(t: Translate): DocumentFragment {
	const fragment = createFragment();
	fragment.appendText(t('settings.compact.desc'));
	fragment.createDiv({
		cls: 'tab-tray-setting-note mod-warning',
		text: `⚠ ${t('settings.compact.unavailable')}`,
	});
	return fragment;
}

/** The storage note is a callout, so it keeps the card styling. */
function storageNote(source: string): DocumentFragment {
	const fragment = createFragment();
	appendInlineCopy(fragment.createDiv({ cls: 'tab-tray-setting-note' }), source);
	return fragment;
}

function aboutDesc(t: Translate): DocumentFragment {
	const fragment = createFragment();
	fragment.appendText(t('settings.about.desc'));
	fragment.createEl('br');
	const link = fragment.createEl('a', {
		cls: 'tab-tray-sponsor',
		href: SPONSOR_URL,
		attr: { target: '_blank', rel: 'noreferrer' },
	});
	setIcon(link.createSpan({ cls: 'tab-tray-sponsor-icon' }), 'heart');
	link.createSpan({ text: t('settings.about.sponsor') });
	return fragment;
}

/**
 * Dictionary copy carries two inline tokens — `code` and **bold**. The nodes
 * are built one by one so no HTML string ever reaches the DOM.
 */
function appendInlineCopy(parent: HTMLElement, source: string): void {
	const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
	let cursor = 0;

	for (const match of source.matchAll(pattern)) {
		const start = match.index ?? 0;
		if (start > cursor) parent.appendText(source.slice(cursor, start));

		const code = match[1] !== undefined;
		parent.createEl(code ? 'code' : 'b', { text: match[1] ?? match[2] ?? '' });
		cursor = start + match[0].length;
	}

	if (cursor < source.length) parent.appendText(source.slice(cursor));
}

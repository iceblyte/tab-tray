import type { Language } from '../core/types';
import { en, type I18nKey } from './en';
import { zhCN } from './zh-cn';

export type { I18nKey } from './en';

export type ResolvedLanguage = 'en' | 'zh-CN';

const DICTIONARIES: Record<ResolvedLanguage, Record<I18nKey, string>> = {
	en,
	'zh-CN': zhCN,
};

/**
 * F8 / D15 — a two-language dictionary with type-safe keys.
 *
 * `auto` follows the host locale, which is passed in as a callback so this
 * module stays free of any Obsidian import (D9). Language changes notify
 * subscribers so open views and command names can be rebuilt.
 */
export class I18n {
	readonly #getPreference: () => Language;
	readonly #getHostLocale: () => string;
	#listeners = new Set<() => void>();

	constructor(getPreference: () => Language, getHostLocale: () => string) {
		this.#getPreference = getPreference;
		this.#getHostLocale = getHostLocale;
	}

	get language(): ResolvedLanguage {
		const preference = this.#getPreference();
		if (preference !== 'auto') return preference;
		return this.#getHostLocale().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
	}

	t(key: I18nKey, params?: Record<string, string | number>): string {
		const template = DICTIONARIES[this.language][key] ?? en[key] ?? key;
		if (!params) return template;

		return template.replace(/\{(\w+)\}/g, (match, name: string) => {
			const value = params[name];
			return value === undefined ? match : String(value);
		});
	}

	onChange(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** Call after the language preference changed. */
	notify(): void {
		for (const listener of this.#listeners) listener();
	}
}

/** Exposed for the i18n completeness test: every key must exist in both. */
export function dictionaryKeys(): I18nKey[] {
	return Object.keys(en) as I18nKey[];
}

export function dictionaries(): Record<ResolvedLanguage, Record<I18nKey, string>> {
	return DICTIONARIES;
}

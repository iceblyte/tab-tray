import { describe, expect, it } from 'vitest';
import type { Language } from '../src/core/types';
import { dictionaries, dictionaryKeys, I18n } from '../src/i18n';

function makeI18n(preference: Language, hostLocale = 'en') {
	let current = preference;
	const i18n = new I18n(
		() => current,
		() => hostLocale,
	);
	return {
		i18n,
		setLanguage(next: Language) {
			current = next;
			i18n.notify();
		},
	};
}

describe('dictionaries', () => {
	it('have exactly the same keys in both languages (F8)', () => {
		const english = Object.keys(dictionaries().en).sort();
		const chinese = Object.keys(dictionaries()['zh-CN']).sort();
		expect(chinese).toEqual(english);
	});

	it('never ship an empty string', () => {
		for (const key of dictionaryKeys()) {
			expect(dictionaries().en[key].length).toBeGreaterThan(0);
			expect(dictionaries()['zh-CN'][key].length).toBeGreaterThan(0);
		}
	});
});

describe('I18n.t', () => {
	it('interpolates named parameters', () => {
		const { i18n } = makeI18n('en');
		expect(i18n.t('cmd.openGroup', { name: 'Research' })).toBe('Open group: Research');
	});

	it('leaves unknown placeholders untouched', () => {
		const { i18n } = makeI18n('en');
		expect(i18n.t('cmd.openGroup', {})).toBe('Open group: {name}');
	});

	it('switches language on demand', () => {
		const { i18n, setLanguage } = makeI18n('en');
		expect(i18n.language).toBe('en');

		setLanguage('zh-CN');
		expect(i18n.language).toBe('zh-CN');
		expect(i18n.t('cmd.newGroup')).toBe('新建分组');
	});
});

describe('auto language resolution (D15)', () => {
	it('follows a Chinese host locale', () => {
		const { i18n } = makeI18n('auto', 'zh-cn');
		expect(i18n.language).toBe('zh-CN');
	});

	it('falls back to English for other locales', () => {
		const { i18n } = makeI18n('auto', 'de');
		expect(i18n.language).toBe('en');
	});

	it('lets an explicit preference win over the host locale', () => {
		const { i18n } = makeI18n('en', 'zh-cn');
		expect(i18n.language).toBe('en');
	});
});

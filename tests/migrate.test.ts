import { describe, expect, it } from 'vitest';
import { migrate } from '../src/core/migrate';
import { createEmptyData, SCHEMA_VERSION } from '../src/core/types';

describe('migrate', () => {
	it('upgrades a payload without schemaVersion to v1', () => {
		const result = migrate({
			groups: [{ id: 'g1', name: 'Research', color: 'blue', members: [] }],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.schemaVersion).toBe(SCHEMA_VERSION);
		expect(result.data.groups).toHaveLength(1);
		expect(result.data.settings).toEqual(createEmptyData().settings);
	});

	it('passes a current payload through unchanged', () => {
		const result = migrate({
			schemaVersion: SCHEMA_VERSION,
			settings: { language: 'en', softLimit: 12 },
			groups: [],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.settings.language).toBe('en');
		expect(result.data.settings.softLimit).toBe(12);
	});

	it('refuses a payload from a newer plugin version', () => {
		const result = migrate({ schemaVersion: SCHEMA_VERSION + 1, groups: [] });
		expect(result).toEqual({ ok: false, error: 'future-version' });
	});

	it('rejects a non-object payload', () => {
		expect(migrate('nope')).toEqual({ ok: false, error: 'not-object' });
		expect(migrate([])).toEqual({ ok: false, error: 'not-object' });
	});

	it('rejects a structurally broken payload', () => {
		expect(migrate({ schemaVersion: 1, groups: 'nope' })).toEqual({
			ok: false,
			error: 'invalid',
		});
	});
});

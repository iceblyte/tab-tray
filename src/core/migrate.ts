import { isRecord, parseTrayData, SCHEMA_VERSION, type TrayData } from './types';

/**
 * `schemaVersion` migration chain (F5).
 *
 * Each entry upgrades a payload from version N to N+1. Functions are pure and
 * must never throw: a broken payload is reported as `invalid`, not as a crash.
 */

export type MigrateError = 'not-object' | 'invalid' | 'future-version';

export type MigrateResult = { ok: true; data: TrayData } | { ok: false; error: MigrateError };

type RawRecord = Record<string, unknown>;
type Migration = (raw: RawRecord) => RawRecord;

const MIGRATIONS: Record<number, Migration> = {
	// v0 = "a data.json written before schemaVersion existed". There is no such
	// release, but tolerating it costs one line and makes the chain testable.
	0: (raw) => ({ ...raw, schemaVersion: 1 }),
};

export function migrate(raw: unknown): MigrateResult {
	if (!isRecord(raw)) return { ok: false, error: 'not-object' };

	const rawVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
	if (!Number.isFinite(rawVersion) || rawVersion < 0) return { ok: false, error: 'invalid' };

	// A file from a newer plugin build is never downgraded or overwritten.
	if (rawVersion > SCHEMA_VERSION) return { ok: false, error: 'future-version' };

	let current: RawRecord = raw;
	for (let version = rawVersion; version < SCHEMA_VERSION; version += 1) {
		const migration = MIGRATIONS[version];
		if (!migration) return { ok: false, error: 'invalid' };
		current = migration(current);
	}

	const data = parseTrayData(current);
	if (!data) return { ok: false, error: 'invalid' };

	return { ok: true, data: { ...data, schemaVersion: SCHEMA_VERSION } };
}

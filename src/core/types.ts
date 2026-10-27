/**
 * Schema v1 for Tab Tray.
 *
 * Everything in this file is framework-agnostic and Obsidian-agnostic: it is
 * unit-testable in plain Node (see DESIGN §3.1 — only `core/` has no host
 * dependency).
 */

/** R8: a fixed 10-colour palette. No free colour picker in v1. */
export const COLOR_KEYS = [
	'red',
	'orange',
	'yellow',
	'green',
	'teal',
	'blue',
	'indigo',
	'purple',
	'pink',
	'gray',
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];

export const DEFAULT_COLOR: ColorKey = 'blue';

/** Bumped whenever the on-disk shape changes; `migrate()` walks the chain. */
export const SCHEMA_VERSION = 1;

export const LANGUAGE_VALUES = ['auto', 'zh-CN', 'en'] as const;
export type Language = (typeof LANGUAGE_VALUES)[number];

export const DEFAULT_SOFT_LIMIT = 30;
export const MIN_SOFT_LIMIT = 1;
export const MAX_SOFT_LIMIT = 999;

export interface Member {
	/** Vault-relative path. R1: the only durable identity across restarts. */
	path: string;
	/** Epoch ms, used as a stable tiebreaker when sorting. */
	addedAt: number;
}

export interface Group {
	/** `crypto.randomUUID()`. Stable anchor for commands (D10). */
	id: string;
	/** Display name; duplicates are allowed because everything resolves by id. */
	name: string;
	color: ColorKey;
	/** Array order is the in-group order; drag-to-reorder rewrites it. */
	members: Member[];
}

/**
 * The three sections below the groups in the sidebar. They are derived views,
 * not data, so only their display order is persisted.
 */
export const SECTION_KINDS = ['pinned', 'ungrouped', 'external'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export function isSectionKind(value: unknown): value is SectionKind {
	return typeof value === 'string' && (SECTION_KINDS as readonly string[]).includes(value);
}

/**
 * Repairs an order array: unknown entries dropped, duplicates dropped, and any
 * section the user has never dragged appended in the default position. This is
 * what keeps a hand-edited or older data.json from hiding a section.
 */
export function parseSectionOrder(raw: unknown): SectionKind[] {
	if (!Array.isArray(raw)) return [...SECTION_KINDS];

	const seen: SectionKind[] = [];
	for (const value of raw) {
		if (isSectionKind(value) && !seen.includes(value)) seen.push(value);
	}
	for (const kind of SECTION_KINDS) {
		if (!seen.includes(kind)) seen.push(kind);
	}
	return seen;
}

export interface Settings {
	language: Language;
	/** F4: user-facing switch for the compact pinned row. */
	compactPinnedRow: boolean;
	/** F4: cached result of the DOM feature probe; false greys the switch out. */
	compactPinnedRowAvailable: boolean;
	/** v1 addition (user-confirmed): tint member tab headers with the group colour. */
	groupColors: boolean;
	/** R9: warn once past this many members in a group, never block. */
	softLimit: number;
	/** Display order of the pinned / ungrouped / external sections. */
	sectionOrder: SectionKind[];
}

export interface TrayData {
	schemaVersion: number;
	settings: Settings;
	/** Array order is the group order. R3: vault-scoped, isolated per data.json. */
	groups: Group[];
}

export const DEFAULT_SETTINGS: Settings = {
	language: 'auto',
	compactPinnedRow: true,
	compactPinnedRowAvailable: true,
	groupColors: true,
	softLimit: DEFAULT_SOFT_LIMIT,
	sectionOrder: [...SECTION_KINDS],
};

export function createEmptyData(): TrayData {
	return {
		schemaVersion: SCHEMA_VERSION,
		settings: { ...DEFAULT_SETTINGS },
		groups: [],
	};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isColorKey(value: unknown): value is ColorKey {
	return typeof value === 'string' && (COLOR_KEYS as readonly string[]).includes(value);
}

export function isLanguage(value: unknown): value is Language {
	return typeof value === 'string' && (LANGUAGE_VALUES as readonly string[]).includes(value);
}

/**
 * D21: every path that enters the store or takes part in a comparison goes
 * through this first. Mirrors Obsidian's `normalizePath` semantics for the
 * subset we care about: POSIX separators, collapsed duplicates, no leading or
 * trailing slash, trimmed.
 *
 * Case is deliberately NOT folded: paths only ever come from `TFile.path`, and
 * folding would create false collisions on case-sensitive filesystems.
 */
export function normalizeVaultPath(path: string): string {
	const posix = path.trim().replace(/\\/g, '/');
	const collapsed = posix.replace(/\/{2,}/g, '/');
	return collapsed.replace(/^\/+/, '').replace(/\/+$/, '');
}

function clampSoftLimit(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_SOFT_LIMIT;
	return Math.min(MAX_SOFT_LIMIT, Math.max(MIN_SOFT_LIMIT, Math.round(value)));
}

/**
 * Settings are repaired field-by-field on purpose: a bad `language` value must
 * not cost the user their groups. Structural damage to `groups` is still a
 * hard reject.
 */
export function parseSettings(raw: unknown): Settings {
	if (!isRecord(raw)) return { ...DEFAULT_SETTINGS };

	return {
		language: isLanguage(raw.language) ? raw.language : DEFAULT_SETTINGS.language,
		compactPinnedRow:
			typeof raw.compactPinnedRow === 'boolean'
				? raw.compactPinnedRow
				: DEFAULT_SETTINGS.compactPinnedRow,
		compactPinnedRowAvailable:
			typeof raw.compactPinnedRowAvailable === 'boolean'
				? raw.compactPinnedRowAvailable
				: DEFAULT_SETTINGS.compactPinnedRowAvailable,
		groupColors:
			typeof raw.groupColors === 'boolean' ? raw.groupColors : DEFAULT_SETTINGS.groupColors,
		softLimit:
			typeof raw.softLimit === 'number'
				? clampSoftLimit(raw.softLimit)
				: DEFAULT_SETTINGS.softLimit,
		sectionOrder: parseSectionOrder(raw.sectionOrder),
	};
}

function parseMember(raw: unknown): Member | null {
	if (!isRecord(raw)) return null;
	if (typeof raw.path !== 'string') return null;

	const path = normalizeVaultPath(raw.path);
	if (path.length === 0) return null;

	const addedAt = typeof raw.addedAt === 'number' && Number.isFinite(raw.addedAt) ? raw.addedAt : 0;
	return { path, addedAt };
}

function parseGroup(raw: unknown, seenIds: Set<string>, seenPaths: Set<string>): Group | null {
	if (!isRecord(raw)) return null;
	if (typeof raw.id !== 'string' || raw.id.length === 0) return null;
	if (typeof raw.name !== 'string') return null;
	if (!isColorKey(raw.color)) return null;
	if (!Array.isArray(raw.members)) return null;
	if (seenIds.has(raw.id)) return null;

	const members: Member[] = [];
	for (const rawMember of raw.members) {
		const member = parseMember(rawMember);
		if (!member) continue;
		// R2: a path may live in exactly one group. First occurrence wins.
		if (seenPaths.has(member.path)) continue;
		seenPaths.add(member.path);
		members.push(member);
	}

	seenIds.add(raw.id);
	return { id: raw.id, name: raw.name, color: raw.color, members };
}

/**
 * Strict structural guard for the on-disk payload. Returns `null` when the
 * shape is unusable — callers must then fall back to `.bak`, a conflict copy,
 * or an empty dataset, and must never overwrite the unparsable file.
 */
export function parseTrayData(raw: unknown): TrayData | null {
	if (!isRecord(raw)) return null;
	if (!Array.isArray(raw.groups)) return null;

	const seenIds = new Set<string>();
	const seenPaths = new Set<string>();
	const groups: Group[] = [];

	for (const rawGroup of raw.groups) {
		const group = parseGroup(rawGroup, seenIds, seenPaths);
		if (group) groups.push(group);
	}

	return {
		schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : SCHEMA_VERSION,
		settings: parseSettings(raw.settings),
		groups,
	};
}

export function findGroup(data: TrayData, groupId: string): Group | undefined {
	return data.groups.find((group) => group.id === groupId);
}

export function findGroupOfPath(data: TrayData, path: string): Group | undefined {
	const normalized = normalizeVaultPath(path);
	return data.groups.find((group) => group.members.some((m) => m.path === normalized));
}

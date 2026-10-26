import type { EventRef } from 'obsidian';

/** Minimal surface of `Plugin` the workspace adapters need. */
export interface EventHost {
	registerEvent(eventRef: EventRef): void;
}

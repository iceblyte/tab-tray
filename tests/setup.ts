/**
 * The core layer reaches the host through `window.*` timers, which is what
 * Obsidian requires for popout compatibility, and plain Node has no `window`.
 *
 * Aliasing it to the global keeps the suite running there: `vi.useFakeTimers()`
 * patches `globalThis.setTimeout`, and `window` is that same object, so a fake
 * timer installed by a test is the one the plugin calls.
 */
if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
	(globalThis as { window?: unknown }).window = globalThis;
}

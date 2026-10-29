/**
 * Timer access for the host-agnostic core (D9).
 *
 * `window.setTimeout` is the supported form: a timer must belong to the main
 * window, or a popout window can be handed a callback bound to another one.
 * Plain Node — the unit-test runtime — has no `window`, so the global is the
 * fallback there. The reference is read at call time, which is what lets the
 * test suite swap in fake timers.
 */

export type HostTimer = number;

export function setHostTimer(handler: () => void, delay: number): HostTimer {
	if (typeof window !== 'undefined') return window.setTimeout(handler, delay);
	return globalThis.setTimeout(handler, delay) as unknown as HostTimer;
}

export function clearHostTimer(timer: HostTimer): void {
	if (typeof window !== 'undefined') {
		window.clearTimeout(timer);
		return;
	}
	globalThis.clearTimeout(timer);
}

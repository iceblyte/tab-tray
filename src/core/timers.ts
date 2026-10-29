/**
 * Timer access for the core layer.
 *
 * `window.setTimeout` is the supported form: the timer then belongs to the main
 * window, which is what keeps a popout from being handed a callback bound to
 * another one. `window` is always present in the host, so there is no branch
 * here; the unit tests alias it to the Node global (see `tests/setup.ts`).
 */

export type HostTimer = number;

export function setHostTimer(handler: () => void, delay: number): HostTimer {
	return window.setTimeout(handler, delay);
}

export function clearHostTimer(timer: HostTimer): void {
	window.clearTimeout(timer);
}

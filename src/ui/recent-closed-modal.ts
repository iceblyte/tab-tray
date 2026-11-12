import { type App, Modal, prepareFuzzySearch } from 'obsidian';
import type { I18n, I18nKey } from '../i18n';
import type { ClosedEntry, CloseReason } from '../workspace/closed-stack';
import { displayName } from './file-utils';

const REASON_KEY: Record<CloseReason, I18nKey> = {
	expand: 'recent.reason.expand',
	collapse: 'recent.reason.collapse',
	close: 'recent.reason.close',
	'close-others': 'recent.reason.closeOthers',
};

/** Local wall-clock time. The stack only ever holds the current session. */
function clock(epochMs: number): string {
	return new Date(epochMs).toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
	});
}

export interface RecentClosedOptions {
	i18n: I18n;
	/** Newest first, as the stack stores them. */
	entries: readonly ClosedEntry[];
	/** Called once, after the modal closes, with the paths to reopen. */
	onPick: (paths: string[]) => void;
}

/**
 * H1 — the list form of undo.
 *
 * A single command only restores the newest batch; this is for the other case,
 * "I closed that file ten minutes ago". The list is a snapshot taken when it
 * opens: the stack cannot change underneath it while it is modal, and a stale
 * row that fails to reopen is reported by the normal notice.
 */
export class RecentClosedModal extends Modal {
	readonly #options: RecentClosedOptions;
	#query = '';
	#listEl: HTMLElement | null = null;

	constructor(app: App, options: RecentClosedOptions) {
		super(app);
		this.#options = options;
	}

	override onOpen(): void {
		const t = this.#options.i18n;
		this.modalEl.addClass('tab-tray-recent-closed');
		this.titleEl.setText(t.t('modal.recentClosed.title'));

		if (this.#options.entries.length === 0) {
			this.contentEl.createEl('p', {
				cls: 'tt-modal-body',
				text: t.t('modal.recentClosed.empty'),
			});
			return;
		}

		const input = this.contentEl.createEl('input', {
			type: 'search',
			cls: 'tt-search',
			attr: { 'aria-label': t.t('modal.recentClosed.search') },
		});
		input.placeholder = t.t('modal.recentClosed.search');
		input.addEventListener('input', () => {
			this.#query = input.value;
			this.#render();
		});

		this.#listEl = this.contentEl.createDiv({ cls: 'tt-recent-list' });
		this.#render();

		const actions = this.contentEl.createDiv({ cls: 'tt-modal-acts' });
		const cancel = actions.createEl('button', { text: t.t('modal.recentClosed.cancel') });
		cancel.onclick = () => this.close();

		const all = actions.createEl('button', {
			cls: 'mod-cta',
			text: t.t('modal.recentClosed.reopenAll'),
		});
		all.onclick = () => {
			const paths = this.#visible().map((entry) => entry.path);
			if (paths.length === 0) return;
			this.close();
			this.#options.onPick(paths);
		};

		window.setTimeout(() => input.focus(), 0);
	}

	override onClose(): void {
		this.contentEl.empty();
		this.#listEl = null;
	}

	#visible(): ClosedEntry[] {
		const query = this.#query.trim();
		if (!query) return [...this.#options.entries];

		const search = prepareFuzzySearch(query);
		return this.#options.entries.filter((entry) => search(displayName(entry.path)) !== null);
	}

	#render(): void {
		const list = this.#listEl;
		if (!list) return;

		const t = this.#options.i18n;
		const entries = this.#visible();
		list.empty();

		if (entries.length === 0) {
			list.createEl('p', { cls: 'tt-recent-empty', text: t.t('tabs.noResults') });
			return;
		}

		for (const entry of entries) {
			const row = list.createEl('button', {
				cls: 'tt-recent-row',
				attr: { type: 'button' },
			});
			row.title = entry.path;
			row.createSpan({ cls: 'tt-recent-name', text: displayName(entry.path) });
			row.createSpan({
				cls: 'tt-recent-meta',
				text: `${t.t(REASON_KEY[entry.reason])} · ${clock(entry.closedAt)}`,
			});

			row.onclick = () => {
				this.close();
				this.#options.onPick([entry.path]);
			};
		}
	}
}

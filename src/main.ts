import { moment, Notice, Plugin } from 'obsidian';
import { TrayController } from './controller';
import { type PersistEvent, PersistenceEngine } from './core/persist';
import type { ObsidianPort } from './core/port';
import { type MemberGate, TrayStore } from './core/store';
import { createEmptyData, type TrayData } from './core/types';
import { I18n } from './i18n';
import { CommandRegistry } from './integrations/commands';
import { registerMenus } from './integrations/menus';
import { TabTraySettingTab } from './settings';
import { baseName } from './ui/file-utils';
import { registerTrayIcon, TRAY_ICON_ID } from './ui/icons';
import { PinnedRow } from './ui/pinned-row';
import { GroupsView } from './ui/sidebar/view';
import { LEGACY_VIEW_TYPE_MANAGER, VIEW_TYPE_GROUPS } from './ui/view-types';
import { probeCompactPinnedRow } from './workspace/compat';
import { WorkspaceExecutor } from './workspace/execute';
import { FileFollow } from './workspace/file-follow';
import { PinTracker } from './workspace/pin-tracker';

/**
 * Assembly point (DESIGN §3.1): the only module that knows about every layer.
 *
 * Startup order matters — data is loaded first so the first render already has
 * the real groups, then the core is wired, then the host surfaces are
 * registered, and only then do the event-driven engines start.
 */
export default class TabTrayPlugin extends Plugin {
	#data: TrayData = createEmptyData();
	#pendingEvents: PersistEvent[] = [];
	#persist!: PersistenceEngine;
	#store!: TrayStore;
	#i18n!: I18n;
	#tracker!: PinTracker;
	#fileFollow!: FileFollow;
	#executor!: WorkspaceExecutor;
	#controller!: TrayController;
	#pinnedRow!: PinnedRow;
	#commands!: CommandRegistry;
	#probeAttempts = 0;

	override async onload(): Promise<void> {
		const persist = new PersistenceEngine(this.#createPort(), { dir: this.#pluginDir() });
		const unbuffer = persist.on((event) => this.#pendingEvents.push(event));

		const loaded = await persist.load();
		this.#data = loaded.data;
		this.#persist = persist;

		this.#buildCore();
		this.#persist.bind(() => this.#store.snapshot());
		this.#persist.on((event) => this.#onPersistEvent(event));

		unbuffer();
		const pending = this.#pendingEvents;
		this.#pendingEvents = [];
		for (const event of pending) this.#onPersistEvent(event);

		// An earlier build shipped a second sidebar view; drop any leaf still
		// holding it so upgrading cannot leave an "unknown view" behind.
		this.app.workspace.detachLeavesOfType(LEGACY_VIEW_TYPE_MANAGER);

		this.#registerHostSurfaces();
		this.#startEngines();
	}

	override onunload(): void {
		// The sidebar leaf is deliberately left in place. Obsidian tears the
		// view down itself when the plugin unloads, and `GroupsView.onClose()`
		// is what unmounts the Svelte tree; detaching here would additionally
		// drop the leaf back to its default location, undoing a placement the
		// user chose on purpose.

		// Best effort only: F5 never relies on the exit path for correctness.
		void this.#persist?.flush();
		this.#commands?.dispose();
		this.#controller?.dispose();
		this.#pinnedRow?.dispose();
		this.#tracker?.dispose();
		this.#fileFollow?.dispose();
		this.#persist?.dispose();
	}

	// ------------------------------------------------------------------ wiring

	#buildCore(): void {
		this.#tracker = new PinTracker(this.app);

		const gate: MemberGate = {
			check: (path) => {
				// R12 first: an external file is never a candidate, pinned or not.
				if (this.#tracker.isExternalPath(path)) return 'external';

				const pinned = this.#tracker.isPinned(path);

				// A path the vault index knows is a normal candidate.
				if (this.#tracker.isVaultPath(path)) return pinned ? 'pinned' : null;

				// A tracked path that the index no longer knows is a missing file,
				// not an out-of-vault one — moving it between groups must still work.
				const tracked = this.#store
					?.snapshot()
					.groups.some((group) => group.members.some((member) => member.path === path));
				if (tracked) return pinned ? 'pinned' : null;

				// R12: everything else has no durable vault-relative path.
				return 'external';
			},
		};

		this.#store = new TrayStore(this.#data, { gate });
		this.#i18n = new I18n(
			() => this.#store.snapshot().settings.language,
			() => moment.locale(),
		);
		this.#fileFollow = new FileFollow(this.app, this.#store);
		this.#executor = new WorkspaceExecutor(this.app, this.#tracker);
		this.#controller = new TrayController({
			app: this.app,
			store: this.#store,
			tracker: this.#tracker,
			fileFollow: this.#fileFollow,
			executor: this.#executor,
			i18n: this.#i18n,
		});
		this.#pinnedRow = new PinnedRow(this.app, this.#controller);

		// The tracker rescans on a short debounce, which is long enough for a
		// freshly activated tab to paint one frame without its tint. Re-running
		// the pass on the event itself keeps the tab body and its corners in
		// the same frame as the selection.
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => this.#pinnedRow.refresh()),
		);
		this.#commands = new CommandRegistry(this, this.#controller);

		// D7: settings and groups share one write path, so `saveData` is never used.
		this.#store.on('change', () => this.#persist.markDirty());
	}

	#registerHostSurfaces(): void {
		this.registerView(VIEW_TYPE_GROUPS, (leaf) => new GroupsView(leaf, this.#controller));

		// One view, one ribbon entry: the open-tab list lives inside it as the
		// second mode, so there is nothing left to open separately. The icon is
		// registered up front because `addRibbonIcon` resolves it immediately.
		registerTrayIcon();
		this.addRibbonIcon(TRAY_ICON_ID, this.#i18n.t('cmd.openSidebar'), () => {
			void this.#controller.openSidebar();
		});

		this.addSettingTab(
			new TabTraySettingTab(this.app, this, {
				i18n: this.#i18n,
				version: this.manifest.version,
				getSettings: () => this.#store.snapshot().settings,
				updateSettings: (patch) => this.#controller.updateSettings(patch),
			}),
		);

		registerMenus(this, this.#controller);
		this.#commands.start();
	}

	#startEngines(): void {
		this.#tracker.start(this);
		this.#fileFollow.start(this);
		this.#controller.start();

		this.app.workspace.onLayoutReady(() => {
			// `start()` already scanned once, but that ran before the layout was
			// guaranteed to be restored. Rescanning here is what makes the
			// sidebar's open-tab sections correct on the very first paint.
			this.#tracker.rescan();
			this.#probeCompactPinnedRow();
			this.#pinnedRow.start();
		});
	}

	// ------------------------------------------------------------------- probe

	#probeCompactPinnedRow(): void {
		const probe = probeCompactPinnedRow(this.app);

		if (probe.status === 'pending') {
			// An empty workspace has no header to inspect yet; try again shortly.
			if (this.#probeAttempts < 20) {
				this.#probeAttempts += 1;
				window.setTimeout(() => this.#probeCompactPinnedRow(), 500);
			}
			return;
		}

		const available = probe.status === 'ok';
		const settings = this.#store.snapshot().settings;

		if (!available && settings.compactPinnedRowAvailable) {
			this.#controller.updateSettings({ compactPinnedRowAvailable: false });
			this.#controller.notify(this.#i18n.t('notice.compactUnavailable'), 'warn', 8000);
		} else if (available && !settings.compactPinnedRowAvailable) {
			this.#controller.updateSettings({ compactPinnedRowAvailable: true });
		}

		this.#pinnedRow.refresh();
	}

	// ---------------------------------------------------------------- persist

	#onPersistEvent(event: PersistEvent): void {
		const t = this.#i18n;
		switch (event.type) {
			case 'load-fallback':
				this.#controller.notify(t.t('notice.loadedBackup'), 'warn', 8000);
				break;
			case 'load-conflict':
				this.#controller.notify(t.t('notice.syncConflict'), 'warn', 8000);
				break;
			case 'load-unreadable':
				this.#controller.notify(t.t('notice.unreadable'), 'error', 10_000);
				break;
			case 'load-future-version':
				this.#controller.notify(t.t('notice.futureVersion'), 'error', 10_000);
				break;
			case 'persist-error':
				this.#controller.notify(
					event.willRetry ? t.t('notice.persistFailed') : t.t('notice.persistPaused'),
					'error',
					8000,
				);
				break;
			case 'persist-ok':
				if (event.preservedAs) {
					this.#controller.notify(
						t.t('notice.corruptPreserved', { file: event.preservedAs }),
						'warn',
						8000,
					);
				}
				break;
		}
	}

	// ------------------------------------------------------------------- infra

	#pluginDir(): string {
		return this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
	}

	#createPort(): ObsidianPort {
		const adapter = this.app.vault.adapter;

		return {
			readText: (path) => adapter.read(path),
			writeText: (path, data) => adapter.write(path, data),
			process: (path, fn) => adapter.process(path, fn),
			list: async (path) => {
				const listing = await adapter.list(path);
				// The engine works with file names inside the plugin folder.
				return {
					files: listing.files.map(baseName),
					folders: listing.folders.map(baseName),
				};
			},
			exists: (path) => adapter.exists(path),
			stat: async (path) => {
				const stat = await adapter.stat(path);
				if (!stat) return null;
				return { mtime: stat.mtime, size: stat.size, type: stat.type };
			},
			remove: (path) => adapter.remove(path),
			rename: (from, to) => adapter.rename(from, to),
			notice: (message) => {
				new Notice(message);
			},
			now: () => Date.now(),
			log: (message, ...args) => {
				console.debug(message, ...args);
			},
		};
	}
}

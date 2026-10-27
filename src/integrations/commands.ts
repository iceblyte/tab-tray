import type { Plugin } from 'obsidian';
import type { TrayController } from '../controller';

interface CommandSpec {
	name: string;
	callback: () => void;
}

/**
 * F6 — commands are rebuilt from the current group list.
 *
 * Ids are derived from the group id (D10), so renaming a group changes only its
 * display name and any hotkey the user bound keeps working. `Plugin.removeCommand`
 * is public API, which is what makes dynamic unregistration safe.
 */
export class CommandRegistry {
	readonly #plugin: Plugin;
	readonly #controller: TrayController;
	readonly #registered = new Set<string>();
	readonly #names = new Map<string, string>();
	#signature = '';
	#unsub: (() => void) | null = null;

	constructor(plugin: Plugin, controller: TrayController) {
		this.#plugin = plugin;
		this.#controller = controller;
	}

	start(): void {
		this.#unsub = this.#controller.onChange(() => this.sync());
		this.sync();
	}

	dispose(): void {
		this.#unsub?.();
		this.#unsub = null;
		for (const id of this.#registered) this.#plugin.removeCommand(id);
		this.#registered.clear();
		this.#names.clear();
		this.#signature = '';
	}

	sync(): void {
		const desired = this.#desired();
		const signature = Array.from(desired, ([id, spec]) => `${id}\u0000${spec.name}`).join('|');
		if (signature === this.#signature) return;
		this.#signature = signature;

		for (const id of Array.from(this.#registered)) {
			if (desired.has(id)) continue;
			this.#plugin.removeCommand(id);
			this.#registered.delete(id);
			this.#names.delete(id);
		}

		for (const [id, spec] of desired) {
			if (this.#names.get(id) === spec.name) continue;
			if (this.#registered.has(id)) this.#plugin.removeCommand(id);
			this.#plugin.addCommand({ id, name: spec.name, callback: spec.callback });
			this.#registered.add(id);
			this.#names.set(id, spec.name);
		}
	}

	#desired(): Map<string, CommandSpec> {
		const t = this.#controller.i18n;
		const commands = new Map<string, CommandSpec>();

		commands.set('new-group', {
			name: t.t('cmd.newGroup'),
			callback: () => {
				this.#controller.promptNewGroup();
			},
		});
		commands.set('collapse-active-group', {
			name: t.t('cmd.collapseActiveGroup'),
			callback: () => {
				void this.#controller.collapseActiveGroup();
			},
		});
		commands.set('open-sidebar', {
			name: t.t('cmd.openSidebar'),
			callback: () => {
				void this.#controller.openSidebar();
			},
		});
		commands.set('open-tab-manager', {
			name: t.t('cmd.openTabManager'),
			callback: () => {
				void this.#controller.openSidebar();
			},
		});
		commands.set('collapse-all-groups', {
			name: t.t('cmd.collapseAllGroups'),
			callback: () => {
				void this.#controller.tidyAll();
			},
		});

		for (const group of this.#controller.state.data.groups) {
			commands.set(`open-group-${group.id}`, {
				name: t.t('cmd.openGroup', { name: group.name }),
				callback: () => {
					void this.#controller.expandGroup(group.id, 'replace');
				},
			});
			commands.set(`collapse-group-${group.id}`, {
				name: t.t('cmd.collapseGroup', { name: group.name }),
				callback: () => {
					void this.#controller.collapseGroup(group.id);
				},
			});
		}

		return commands;
	}
}

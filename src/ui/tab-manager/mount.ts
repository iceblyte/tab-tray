import { mount, unmount } from 'svelte';
import type { TrayController } from '../../controller';
import TabManager from './TabManager.svelte';

export function mountTabManager(target: HTMLElement, controller: TrayController): () => void {
	const component = mount(TabManager, { target, props: { controller } });
	return () => {
		void unmount(component);
	};
}

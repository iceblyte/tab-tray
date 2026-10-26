import { mount, unmount } from 'svelte';
import type { TrayController } from '../../controller';
import Sidebar from './Sidebar.svelte';

/**
 * The single contact surface between the view and Obsidian (DESIGN §2.3).
 * Returning a teardown keeps `ItemView.onClose` trivial and leak-free.
 */
export function mountSidebar(target: HTMLElement, controller: TrayController): () => void {
	const component = mount(Sidebar, { target, props: { controller } });
	return () => {
		void unmount(component);
	};
}

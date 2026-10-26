<script lang="ts">
	import { setIcon } from 'obsidian';

	/**
	 * Thin wrapper around Obsidian's own icon set so the views use exactly the
	 * glyphs the host uses (and inherit its sizing/colour behaviour).
	 */
	let {
		name,
		size = 16,
		cls = '',
	}: { name: string; size?: number; cls?: string } = $props();

	let host: HTMLSpanElement | undefined = $state();

	$effect(() => {
		if (!host) return;
		setIcon(host, name);
		host.style.setProperty('--tt-icon-size', `${size}px`);
	});
</script>

<span bind:this={host} class="tt-icon {cls}" aria-hidden="true"></span>

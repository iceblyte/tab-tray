import { Plugin } from 'obsidian';

/**
 * Assembly point (DESIGN §3.1).
 *
 * Only this file is allowed to know about every layer; everything else depends
 * downwards. The wiring lands with the milestones that introduce each layer.
 */
export default class TabTrayPlugin extends Plugin {
	override onload(): void {
		// Layers are registered here as they are implemented.
	}
}

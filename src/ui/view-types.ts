/**
 * The plugin ships one sidebar view with two faces (groups / open tabs).
 * `tab-tray-manager` was a separate view in an earlier build and is detached on
 * load so upgrading does not leave a dead leaf behind.
 */
export const VIEW_TYPE_GROUPS = 'tab-tray-groups';
export const LEGACY_VIEW_TYPE_MANAGER = 'tab-tray-manager';

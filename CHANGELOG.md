# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-29

First public release. Desktop only, Obsidian 1.14.0 or newer.

### Added

- **Tab groups** — create, rename inline, recolour from a fixed 10-colour
  palette, drag to reorder, delete with a confirmation that says how many
  members are affected and that no file is touched.
- **One-click open and collapse** — expanding replaces the active pane, or
  appends with Ctrl/Cmd; collapsing closes the group's tabs in the current
  window only. Popout windows are never touched.
- **Durable storage** — every mutation goes through one validated path with
  debounced, atomic writes and a backup. Groups survive a restart, a crash and
  a hand-edited `data.json`.
- **Merged sidebar** — pinned, ungrouped and out-of-vault sections at the top,
  then a rule, then the groups. Search, focus, close, pin, add and remove all
  live in the same list; clicking a member focuses its tab or opens a new one,
  never replacing what you are reading.
- **Compact pinned row** — pinned tabs shrink to icons at the start of the tab
  bar, keeping the native tooltip and all three click behaviours.
- **Group colouring** — member tab headers are tinted with their group colour,
  using the host's own tab variables so the body, outline and bottom corners
  stay in sync.
- **Out-of-vault handling** — external files are recognised by their `file:`
  path, never join a group, and are never tinted; their tab still pins and
  focuses like any other.
- **Commands and hotkeys** — per-group open/collapse commands plus global ones,
  all usable with the sidebar closed.
- **Bilingual UI** — English and Simplified Chinese, following Obsidian's
  language by default.

### Known limitations

- Desktop only (`isDesktopOnly: true`); the layout work depends on the desktop
  tab strip.
- The three derived sections sort among themselves only, never above the
  groups; their order is fixed rather than persisted.
- Folding a section is session state and is not written to `data.json`.

## [1.0.1] - 2026-10-29

Community-plugin review fixes, plus three restart regressions found by hand.

### Fixed

- **Restored tabs were invisible to the sidebar** — Obsidian defers every
  background tab after a restart, so its view carries no file and the open-tab
  sections came up empty until each tab had been clicked once. The leaf's own
  view state now supplies the path.
- **A click opened a duplicate tab** — the same missing path made "focus it if
  it is already open" fall through to opening a second copy of the file.
- **The first click collapsed a section** — showing a deferred tab leaves one
  frame without a readable path, so the row dropped out of the list and came
  back a scan later. The last readable path now stands in while the view type
  is unchanged.
- **The settings page is declarative** — it appears in Obsidian's settings
  search on 1.13 and later, and refreshes through `update()`.
- Group colours and the tab-header "add to group" entry now resolve deferred
  tabs too, so both work on a restored tab before it has been shown.
- Timers go through `window.*` for popout compatibility, the sidebar leaf is no
  longer detached on unload, and the storage note is built node by node instead
  of through `innerHTML`.

### Changed

- vitest 4.1.12 → 5.0.5. npm 10 cannot resolve 4.1.12 at all, which is what
  left the lockfile stale and the esbuild platform package missing.

## [1.0.2] - 2026-10-29

Second round of community-plugin review fixes.

### Changed

- Release assets are built and attested by GitHub Actions, so the `main.js`
  and `styles.css` a user installs can be traced back to the commit they were
  built from. The manual zip is gone: Obsidian only downloads `main.js`,
  `manifest.json` and `styles.css`, and anything else is an unsupported file.

### Fixed

- Timers go through `window.setTimeout` / `window.clearTimeout` with no
  `globalThis` fallback, which is what keeps a popout window from running a
  callback bound to another one.
- `activeLeaf` is deprecated and is replaced by `getMostRecentLeaf()`. The
  panel now keeps the last read tab highlighted instead of dropping the
  highlight whenever the panel itself has focus.

## [1.0.3] - 2026-11-04

Correctness and release-integrity fixes found by the v1 audit. No schema
change, no new feature.

### Fixed

- A `data.json` that cannot be parsed is no longer overwritten when it cannot be
  moved aside first. Previously the rename failure only logged, and the write
  continued over the bytes the plugin had never managed to read; now the write
  is aborted and retried, so the original file survives.
- Files opened from outside the vault show their file name on Windows. The
  external section listed the full `file:C:\notes\note.md` pseudo-path because
  the name was split on `/` only; `\` and the `file:` prefix are now handled.
- The pinned tooltip on a member said unpinning restores it to the group. It
  now says what actually happens: pinned tabs stay outside groups.

### Changed

- Releases run lint, typecheck and tests through the new CI workflow before any
  asset is published, so a tag can no longer ship a build that fails its suite.
- Removed the leftover `tab-tray-1.0.0.zip` / `1.0.1.zip` artifacts and three
  unused interface strings.

## [Unreleased]

### Added

- **Undo** — expanding, collapsing and "close others" now put an undo button in
  their notice, and two commands cover the case where the notice is gone:
  "Reopen closed tabs" restores the last action, "Recently closed…" lists
  everything closed since the session started, with search.
- The list is memory-only and capped at 20. Closing a popout window does not
  fill it: losing a window on purpose is not a mistake to undo.

[1.0.3]: https://github.com/iceblyte/tab-tray/releases/tag/1.0.3
[1.0.2]: https://github.com/iceblyte/tab-tray/releases/tag/1.0.2
[1.0.1]: https://github.com/iceblyte/tab-tray/releases/tag/1.0.1
[1.0.0]: https://github.com/iceblyte/tab-tray/releases/tag/1.0.0

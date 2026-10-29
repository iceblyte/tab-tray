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

[1.0.0]: https://github.com/iceblyte/tab-tray/releases/tag/1.0.0

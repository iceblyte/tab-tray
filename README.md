# Tab Tray

Browser-style tab groups for Obsidian desktop: named, coloured groups you can
open and collapse in one click, plus a compact pinned row.

The point of this plugin is not just grouping — it is that the groups are still
there after a restart. Every write goes through a debounced, atomic, backed-up
save path, and the fallbacks are tested rather than assumed.

中文说明见 [README.zh.md](./README.zh.md)。

## Features

- **Group sidebar** — colour dot, name, member count and an `n/m` open counter
  that deduplicates across panes and windows. Create, rename inline, recolour
  from a fixed 10-colour palette, drag to reorder, delete with confirmation.
- **Open and collapse** — expanding replaces the active pane (hold Ctrl/Cmd to
  append instead); collapsing closes every tab of the group in the current
  window. Other windows, including popouts, are never touched.
- **Six ways to add a file** — file explorer menu, tab header menu, drag from
  the explorer, the remove/× button, drag between groups, and the tab manager.
  All of them land on the same validated mutation, so they cannot drift apart.
- **Compact pinned row** — pinned tabs shrink to icons at the start of the tab
  bar, with the native tooltip intact. Left, right and middle click all keep
  their native behaviour.
- **Group colouring** — member tab headers are tinted with their group colour.
  Files outside a group are never tinted.
- **Tab manager panel** — every open tab across all windows, grouped by
  ownership, with focus, close, pin, add-to-group and fuzzy search.
- **Commands and hotkeys** — per-group open/collapse commands plus global ones,
  all usable with the sidebar closed.
- **Bilingual** — English and Simplified Chinese, following Obsidian's language
  by default.

## Requirements

- Obsidian desktop **1.14.0** or newer.
- Desktop only: the plugin works on the tab bar and the workspace layout, which
  mobile does not have.

## Install

Until the plugin is in the community store, install it manually:

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Put them in `<your vault>/.obsidian/plugins/tab-tray/`.
3. Enable **Tab Tray** in Settings → Community plugins.

## Usage

Open the group sidebar from the ribbon (archive icon) or with the command
**Open group sidebar**. Create a group, then add files by right-clicking them in
the file explorer or on a tab header.

Clicking a group name toggles it: it collapses if any member is open in the
current window, and expands otherwise. Holding Ctrl/Cmd while expanding appends
instead of replacing.

A member whose tab is pinned natively shows a 📌 marker. It is skipped when the
group collapses or replaces, and becomes a normal member again the moment you
unpin it — there is no state to repair, because the pin state is read from the
tab itself rather than stored.

## Your data

Groups live in `.obsidian/plugins/tab-tray/data.json`.

- Every change is written within about 500 ms using an atomic replace, after
  rotating the previous contents into `data.json.bak`.
- If the main file cannot be parsed, the backup is loaded instead and you are
  told; the unreadable file is renamed aside, never overwritten.
- If a sync tool leaves a conflict copy (`data.sync-conflict-*.json`), the
  newest parsable version wins and the conflict file is left alone.
- Disabling or uninstalling the plugin never deletes your data.
- The plugin makes no network requests and collects no telemetry. It reads file
  paths and metadata only, never file contents.

Pinned state and "missing file" markers are derived at runtime and deliberately
never written to disk, so they cannot go stale.

## Development

```bash
npm install
npm run dev        # esbuild watch -> main.js
npm run build      # typecheck + production bundle
npm test           # Vitest, core and planning layers
npm run lint       # Biome
npm run typecheck  # tsc --noEmit
```

Architecture, the persistence design and the decision log are in
[docs/DESIGN.md](./docs/DESIGN.md); the requirement baseline is
[docs/PRD.md](./docs/PRD.md); the manual acceptance checklist is
[docs/ACCEPTANCE.md](./docs/ACCEPTANCE.md). The UI prototypes the implementation
follows are in [prototype/](./prototype/index.html).

## Support

If Tab Tray saves you some tab wrangling, you can
[sponsor the author on Afdian](https://afdian.com/a/iceblyte).

## License

MIT

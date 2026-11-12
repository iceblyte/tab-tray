# 设计方案：撤销关闭 + 标签栏内分组（v1.1 / v1.2）

| | |
|---|---|
| 状态 | **A 已实现；B 待 spike** |
| 日期 | 2026-11-11（2026-11-12 决议回写） |
| 范围 | A：撤销关闭的标签（参考 Recent Files）；B：在标签栏内折叠/展开分组（Chrome 式） |
| 上游 | [ROADMAP-v2.md](./ROADMAP-v2.md) §2（H1）、[AUDIT-2026-10-31](./AUDIT-2026-10-31.md) §3.2 |
| 调研方法 | 读 Recent Files 源码（`main.ts`，763 行）；读本机 Obsidian 1.14.x 的 `obsidian.asar` 中 `app.js` / `app.css` |

## 决议（2026-11-11 用户确认）

| # | 问题 | 决定 |
|---|---|---|
| 1 | B 的排期 | v1.1 只做 spike，**v1.2 交付** |
| 2 | 折叠状态 | **持久化**（原建议为会话级，已按用户决定改为写盘；方案见 §3.5） |
| 3 | pill 显示组名 | **显示组名 + 计数** |
| 4 | 撤销范围 | 「重新打开最近一批」**加上**一个「最近关闭」列表视图（已实现，见 §2.6） |
| 5 | 前置重构 | 同意，但调研后发现**不需要**（见 §3.6 的更正） |

> **§3.6 更正**：原方案假设「紧凑行」与「染色」是两个模块在写同一批标签头。实际 `src/ui/pinned-row.ts` 一个类同时负责两者（`COMPACT_CLASS` 与 `GROUPED_CLASS`），JS 侧已经是单写者，CSS 全部从 `--tt-group-color` 派生。所以**不做独立的 `tab-decorator` 重构**，标签栏折叠的类名直接加在 `PinnedRow.refresh()` 里即可。

---

## 0. 结论先说

**A（撤销关闭）可以直接做**，风险低。但要注意：Recent Files **并不追踪「关闭」**，它只记录「打开过」。可借鉴的是它的列表纪律与路径维护，关闭检测得我们自己从工作区快照的差集里算。

**B（标签栏内分组）能做，但不能按「往标签栏里插一个分组块」的思路做。** 本机 `app.js` 里 `updateTabDisplay()` 每次刷新都会调用 `tabsInnerEl.setChildrenInPlace(标签头数组)`，把容器的子节点同步成「标签头列表」——我们插进去的元素不在这个列表里，会被清掉或错位。所以只能**改现有标签头的类名 + 用伪元素画 pill**，这条路和现有的 `pinned-row.ts` 是同一套机制，已被证明能跨重渲染存活。

B 有 6 个必须先验证的技术点（§3.9），我建议 **v1.1 只做 spike，v1.2 交付**。

---

## 1. 调研结果

### 1.1 Recent Files 的实际实现

源码：`tgrosinger/recent-files-obsidian` → `main.ts`（根目录，单文件 763 行）。

**数据模型**

```ts
interface FilePath { path: string; basename: string }

interface RecentFilesData {
  recentFiles: FilePath[];
  omittedPaths: string[];
  omittedTags: string[];
  omitBookmarks: boolean;
  updateOn: 'file-edit' | 'file-open';
  maxLength?: number;          // 默认 50
}
```

**事件**

```ts
this.registerEvent(this.app.vault.on('rename', this.handleRename));
this.registerEvent(this.app.vault.on('delete', this.handleDelete));
this.registerEvent(this.app.workspace.on('file-open', this.onFileOpen));
```

**记录一条**

```ts
this.data.recentFiles = this.data.recentFiles.filter(c => c.path !== file.path);
if (this.shouldAddFile(file)) {
  this.data.recentFiles.unshift({ basename: file.basename, path: file.path });
}
await this.pruneLength();      // splice 掉尾部超出 maxLength 的
await this.saveData();
```

**结论：它只记录「打开」，不记录「关闭」。** 整个文件里没有 detach / close 相关的事件或逻辑。所以「参考 Recent Files 做 undo」只能借鉴它的**列表纪律**，关闭事件必须另找来源。

### 1.2 该借鉴什么、不该照搬什么

| 借鉴 | 理由 |
|---|---|
| **去重 → unshift → 截断**的三步纪律 | 简单、经受过 5 年使用验证；顺序天然就是「最近优先」 |
| `vault.on('rename')` / `on('delete')` 维护条目 | 我们已经有 `FileFollow` 做同样的事，复用它的订阅即可，不要重复注册 |
| **上限可配置**（默认 50） | 我们取 20，但保留为常量而非硬编码 |
| 「视图通过 getter 读数据」 | 他们 1.7.10 的 bug：视图在构造时捕获了 data 对象，`loadData()` 换成新对象后视图渲染的是孤儿副本。我们的 `store.snapshot()` + 订阅模型已经规避，但新模块要守住同一条：**不缓存快照** |

| 不照搬 | 理由 |
|---|---|
| `plugin.saveData()` 直接写 | 违反 D7。我们必须走 `PersistenceEngine`（原子写 + `.bak`） |
| 存 `basename` 冗余字段 | 会随 rename 过期。我们有 `displayName(path)` 派生即可 |
| 无 `schemaVersion` / 无迁移 | 我们已有迁移链，新数据必须进链 |
| 记录「打开历史」 | 我们要的是「关闭」，语义不同，不要混在一起 |

### 1.3 Obsidian 标签栏的 DOM 事实（本机 1.14.x 实测）

从 `obsidian.asar` 里提取 `app.js` / `app.css` 读出来的：

```js
// 容器创建
var r = i.tabHeaderContainerEl = i.containerEl.createDiv("workspace-tab-header-container"),
    o = i.tabsInnerEl        = r.createDiv("workspace-tab-header-container-inner"),
    a = i.tabsContainerEl    = i.containerEl.createDiv("workspace-tab-container");
```

`workspace-tab-header-container` 下还有三个**非标签**子节点：`workspace-tab-header-new-tab`（+ 按钮）、`workspace-tab-header-spacer`、`workspace-tab-header-tab-list`（▾ 列表）。它们挂在**外层**容器上，不在 `-inner` 里。

**关键约束（决定方案 B 的形态）**：

```js
// updateTabDisplay()，每次标签变化都会跑
for (var a = [], ...) { var u = (L = c[l]).tabHeaderEl; a.push(u); ... }
this.tabHeaderEls = a;
...
i.setChildrenInPlace(a)     // i = tabsInnerEl
```

容器子节点被**同步成「标签头数组」**。任何我们插进去的额外节点都不在这个数组里 → 不可靠。

另外两条：

```js
// 点击是事件委托 + 索引
i.containerEl.on("click", ".workspace-tab-header", function (e, t) {
  var n = i.tabHeaderEls.indexOf(t);
  if (n !== -1) { i.selectTabIndex(n); ... }
});

// 拖拽落点用 bounding rect
t.prototype.getTabInsertLocation = function (e) {
  for (var t = this.tabHeaderEls, ...) { var s = n[a].tabHeaderEl.getBoundingClientRect(); ... }
}
```

**1.14.x 没有原生标签分组**：`app.css` 里没有任何 `tab-group` 类；`app.js` 里唯一的 `tabGroup` 符号是设置页的 `vertical-tab-header-group`，与此无关。

### 1.4 Chrome 分组交互拆解（我们要对齐的部分）

| 行为 | Chrome | 我们要不要 |
|---|---|---|
| 分组在标签栏里显示为一段带颜色的区域 | ✅ | ✅ 用组色下划线/底色 |
| 组名 chip 显示在组的最左侧 | ✅ | ✅（可关） |
| 点 chip / 组头 → 折叠成 pill | ✅ | ✅ **这是本次的核心诉求** |
| 折叠后 pill 显示「组名 + 数量」 | ✅ | ✅ |
| 点 pill → 展开 | ✅ | ✅ |
| 新标签加入组后**自动归拢**到组末尾 | ✅ | ❌ 不做（见 §3.8） |
| 拖标签到组上入组 | ✅ | ❌ 不做（v1.3 再评估） |
| 空分组也显示 pill | ✅ | ❌ 做不到（见 §3.8） |

---

## 2. 方案 A：撤销关闭的标签

> **状态：已实现**（`closed-stack.ts`、`close-tracker.ts`、`executor.reopen`、命令 `reopen-closed-tabs` / `recent-closed`、Notice 撤销按钮、`RecentClosedModal`）。本节保留设计依据，实现与下列描述一致。

### 2.1 目标与非目标

**目标**
- 展开 / 收起 / 关闭后，能用**一个动作**把刚关掉的标签原样开回来。
- 误操作 5 秒内可撤回，且不打断当前正在读的内容。
- 不新增任何持久化字段（v1.1 不动 schema）。

**非目标**
- 不跨重启（重启后栈清空）。
- 不做完整浏览历史（只保留最近 20 条关闭）。
- 不恢复窗格布局（只恢复「哪些文件开着」）。

### 2.2 数据模型

```ts
// src/workspace/closed-stack.ts
export interface ClosedEntry {
  /** vault 路径，或库外文件的 `file:` 伪路径（R12）。 */
  path: string;
  /** 关闭发生的窗口；重开优先回到这个窗口。 */
  windowId: string;
  reason: 'expand' | 'collapse' | 'close' | 'close-others';
  closedAt: number;
}
```

**为什么不需要 `basename`**：Recent Files 存了，但那是一份会过期的冗余；我们用 `displayName(path)` 派生。

**为什么 `reason` 要存**：`expand` / `collapse` 关掉的是「一整批」，撤销时应当整批恢复；用户手动关单个标签时只恢复一个。Notice 文案也不同（「已关闭 5 个标签 · 撤销」vs「已关闭 a.md · 撤销」）。

### 2.3 关闭从哪里来（三条来源）

Obsidian **没有** `tab-close` 事件，只能自己算。

| 来源 | 检测方式 | 记录时机 |
|---|---|---|
| **我们的操作**（展开/收起/关闭/关闭其他） | 在 `execute.ts` detach 之前显式记录 | 同步，带准确 `reason` |
| **用户关标签**（× / Ctrl+W / 右键菜单） | 两次 `PinTracker` 快照求差：`prev.leafId` 集合 − `next.leafId` 集合 | 下一次 rescan（防抖 100ms） |
| **关闭 popout 窗口** | 同上，但差值是一整窗 | 用 `window-close` 标记，**不入栈**（一次关 8 个是噪音，不是误操作） |

**差集能成立的前提**：`PinTracker` 的 `leafId` 来自 `WeakMap<WorkspaceLeaf, string>`（`pin-tracker.ts:30`），**同一个 leaf 对象在多次扫描间 id 稳定**。所以差集就是「哪些 leaf 消失了」。

**不缓存快照**：`closed-stack` 只在 `onChange` 回调里拿到新旧两份，算完即丢，不持有引用。

### 2.4 栈的维护

```
push(entry):
  1. 去掉栈里同 path 的旧条目        // 同一文件反复关闭只保留最新一次
  2. unshift(entry)
  3. 截断到 20 条
```

**rename / delete**：由 `CloseTracker.start()` 自己订阅 `vault.on('rename' | 'delete')` 维护栈内路径，**不挂在 `FileFollow` 上**。理由：栈是这个模块的数据，自己维护比让另一个适配器反向回调更清楚；`FileFollow` 的职责仍然只是分组成员的丢失标记。

### 2.5 重开算法

```
reopenLast():
  1. 取栈顶那一批（同一个 reason + 同一个 closedAt 毫秒内算一批）
  2. 按 path 去重，保持原顺序
  3. 逐个：
     - 文件已不存在 → 跳过，计数
     - 已在当前窗口打开 → 聚焦，不重复开
     - 否则 getLeaf('tab') + openFile(active:false)
  4. 激活第一个成功的
  5. 从栈中移除已恢复的条目
  6. Notice: 「已重新打开 3 个标签（跳过 1 个已删除的文件）」
```

**为什么 `active:false`**：批量重开时逐个激活会让界面闪 5 次；只在最后激活第一个。这和现有 `expand` 的做法一致（`execute.ts:88-104`）。

### 2.6 入口

| 入口 | 形态 | 说明 |
|---|---|---|
| 命令 | `reopen-closed-tabs`（「重新打开关闭的标签」） | `checkCallback` 在栈空时返回 false → 不出现在面板 |
| Notice 动作 | 展开/收起/关闭其他的 Notice 里加一个「撤销」按钮 | 最关键：误点的瞬间就在眼前，不需要去命令面板找 |
| 命令 | `recent-closed`（「最近关闭的标签…」） | 打开列表视图：搜索、单条重开、全部重开 |

**「最近关闭」为什么是模态框而不是侧栏第四节**：侧栏已经有「已固定 / 未分组 / 库外 + 分组」四段，再加一段会把常用的分组挤下去；而「找十分钟前关掉的那个文件」是低频、短时的动作，适合用完即走。列表只在打开时快照一次，栈在模态期间不会变。

**Notice 里的按钮怎么加**：`new Notice()` 后拿 `notice.messageEl`（1.8.7+ 正式字段），`createEl('button')` 并绑 `onclick`。popout 里的 Notice 是否可点仍需实测。

### 2.7 边界情况

| 情况 | 处理 |
|---|---|
| 同一文件被关两次 | 栈内去重，只留最新 |
| 文件在关闭后被重命名 | `CloseTracker` 的 `vault.on('rename')` 同步栈内路径 |
| 文件被删除 | `vault.on('delete')` 移除；重开时若已不存在则跳过并提示 |
| 库外文件（`file:` 路径） | 尝试 `getAbstractFileByPath` → `openFile`；失败则跳过 |
| 退出 Obsidian | `onunload` 先 `dispose()`，`#disposed` 后不再入栈 |
| 关闭 popout | `window-close` 置 `#skipNextScan`，整批跳过不入栈 |
| 栈里 20 条全是同一批 | 允许（用户连点 4 次展开就想要 4 次撤销） |

### 2.8 落点与测试

**新增（已落地）**
- `src/workspace/closed-stack.ts` — 纯数据 + `snapshotTabs` / `diffClosed`，**不 import obsidian**
- `src/workspace/close-tracker.ts` — 宿主胶水：订阅快照变化、标注 reason、维护 rename/delete
- `src/ui/recent-closed-modal.ts` — 「最近关闭」列表
- `tests/closed-stack.test.ts` — 18 条

**改动（已落地）**
- `src/workspace/execute.ts` — 新增 `reopen(paths)`，返回 `{ opened, focused, missing }`
- `src/controller.ts` — `#withReason()` 包裹执行器调用、`#notifyUndoable()`、`reopenLastClosed()`、`openRecentClosed()`
- `src/integrations/commands.ts` — `reopen-closed-tabs` / `recent-closed`（`checkCallback` 在栈空时隐藏）
- `src/main.ts` — 装配 `ClosedStack` + `CloseTracker`，`closeTracker.start()` 排在 `tracker.start()` 之后
- `src/i18n/*`、`styles.css` — 文案与 Notice 按钮、列表样式

**未覆盖**：`CloseTracker` 的胶水逻辑没有单测（需要 fake app + fake tracker）。纯逻辑已由 `diffClosed` 覆盖，胶水部分靠真实 Obsidian 验收。

---

## 3. 方案 B：标签栏内折叠/展开分组

### 3.1 目标交互

```
展开态（组有 3 个成员打开）：
┌──────────┬──────────┬──────────┬─────────┐
│▎Research │▎b.md     │▎c.md     │ 其他标签 │   ← 左侧 2px 组色竖条
└──────────┴──────────┴──────────┴─────────┘
  └ 组名 chip（点它折叠）

折叠态：
┌──────────────────┬─────────┐
│ ▐ Research  +3   │ 其他标签 │   ← pill：组色块 + 组名 + 计数
└──────────────────┴─────────┘
  点 pill → 展开
```

### 3.2 关键技术约束

**不能注入元素**（§1.3）。所以：

- **折叠** = 给成员标签头加 `tt-g-collapsed` 类，CSS `display: none`。
- **pill** = 给代表标签头（组内第一个**可见**成员）加 `tt-g-pill` 类，用 `::before` / `::after` 画色块与文字。
- **组色** = 在标签头上设 `--tt-g-color`，CSS 用它画竖条与 pill 底色。

这条路线和 `ui/pinned-row.ts` 完全同构：那个模块也是「只加类名，不动 DOM 结构」，并且已经在 `layout-change` 下反复重刷而不出问题。

**宽度会自然变宽**：`--tab-width: 200px` / `--tab-max-width: 320px` 是主题级 CSS 变量，标签头是 flex 子项。隐藏几个之后剩下的会自动长到 max-width 为止——正是想要的效果。**但要实测**：如果宿主某处用 `clientWidth` 锁定了宽度（`hasLockedTabWidths` / `unlockTabWidths` 这两个字段名暗示存在这种机制），折叠可能失效。

### 3.3 类名与状态

| 类 | 加在 | 作用 |
|---|---|---|
| `tt-g` | 每个组员标签头 | 标记归属；`--tt-g-color` 提供颜色 |
| `tt-g-first` | 组内第一个可见成员 | 承载组名 chip |
| `tt-g-collapsed` | 被折叠的成员 | `display: none` |
| `tt-g-pill` | 折叠时的代表标签 | 隐藏标题、画 pill、收窄宽度 |

**代表标签选谁**：折叠前**当前可见的组内第一个**。如果那个标签后来被关闭，重新选。

### 3.4 点击语义（capture 阶段拦截）

宿主的点击是事件委托（§1.3），所以我们要在**捕获阶段**先拿到并 `stopPropagation()`：

```ts
container.addEventListener('click', (event) => {
  const header = (event.target as HTMLElement).closest('.workspace-tab-header');
  if (!header) return;
  if (header.classList.contains('tt-g-pill')) {      // 折叠态：点 pill 展开
    event.stopPropagation();
    event.preventDefault();
    toggleGroup(groupId, false);
    return;
  }
  if (header.classList.contains('tt-g-first') && event.offsetX < CHIP_W) {  // 展开态：点 chip 折叠
    event.stopPropagation();
    toggleGroup(groupId, true);
  }
}, true);
```

两个待验证点：
1. **capture 是否真的抢在委托之前** —— 宿主监听器挂在同一个 `containerEl` 上（冒泡阶段），capture 监听器在同元素上先触发，理论上成立，必须实测。
2. **chip 命中区** —— 伪元素不产生独立的 `event.target`，只能用 `offsetX` 判断。若不可靠，退化方案见 §3.9 的 S-4。

### 3.5 折叠状态存哪（**已决定：持久化**）

原建议是会话级内存，理由是「折叠是视图状态，不该写盘」。用户 2026-11-11 决定改为**持久化**：重启后仍保持折叠，对「长期只用一个分组」的人是省事而不是风险。

**落在 `Settings` 而不是 `TrayData` 顶层**：

```ts
interface Settings {
  // …
  /** v1.2 新增：被折叠的分组 id。写盘，重启后保持。 */
  collapsedGroups: string[];
}
```

三个理由：
1. `parseSettings` 本来就是**逐字段修复**的宽容区（坏一个字段不牵连分组），折叠状态是最不需要硬失败的数据。
2. 走现成的 `settings.update` 变更路径，不必新增 mutation 类型。
3. **不需要升 `schemaVersion`**：这是可选字段，v1 数据缺它就取默认 `[]`；v2 的解析器也只读已知键，属于前向兼容的增量。降级到 v1 时该字段会被丢弃——只丢视图状态，不丢分组。

**启动时要对账**：`collapsedGroups` 里可能存在已被删除的分组 id。加载后按当前分组 id 过滤一次，与 `#reconcilePinnedMembers` 同一时点。v2.0 引入智能组后同样适用（按 id，与 `kind` 无关）。

**实现位置**：v1.2 随 S0 一起做，v1.1 不引入（v1.1 不改 `Settings` 的字段集）。

### 3.6 与现有标签头装饰器的共存（**已更正：不需要重构**）

初稿假设「紧凑行」与「染色」是两个模块在写同一批标签头，因此提议抽出 `tab-decorator.ts` 做单写者。**实际读代码后这个前提不成立**：

`src/ui/pinned-row.ts` 一个类同时负责两者——`COMPACT_CLASS`（紧凑行）、`GROUPED_CLASS` + `--tt-group-color`（染色），并且 CSS 里所有染色效果都从 `--tt-group-color` 派生（`styles.css` 的 `.tab-tray-grouped` 系列）。JS 侧从来没有第二个写者。

所以：

- **不做** `tab-decorator.ts` 重构。它只会是一次纯改名，没有收益。
- 标签栏折叠的类名（`tt-g` / `tt-g-first` / `tt-g-collapsed` / `tt-g-pill`）**直接加在 `PinnedRow.refresh()` 的同一个循环里**。那里已经拿到了 `header`、`path`、`pinned`、`color`，是唯一正确的写点。
- 唯一要新增的输入是「哪些组被折叠」与「每个 header 属于哪个组」——前者来自 `Settings.collapsedGroups`，后者由现有的 `pathByHeader()` + `buildColorIndexByPath` 派生，不需要新扫描。

> 这个更正省掉约一天的重构，也避免把已经稳定的 `pinned-row.ts` 拆成两半。

### 3.7 拖拽与隐藏标签的冲突

`getTabInsertLocation` 用 `getBoundingClientRect()` 算落点。`display:none` 的元素 rect 全 0 → 拖拽插入位置会算错。

**缓解**：拖拽开始时临时展开所有折叠组，结束后恢复。

```ts
container.addEventListener('dragstart', () => { document.body.classList.add('tt-drag-open'); }, true);
container.addEventListener('dragend',  () => { document.body.classList.remove('tt-drag-open'); }, true);
```

CSS：`body.tt-drag-open .tt-g-collapsed { display: revert }`。

若 Obsidian 用的是 pointer 事件而非 HTML5 DnD（`dragManager` 的存在暗示是自定义实现），则改用 `pointerdown` + 200ms 延时展开作为兜底。**需实测**。

### 3.8 明确不做

| 不做 | 原因 |
|---|---|
| 新标签自动归拢到组末尾 | 要移动 leaf，会打断用户已建立的标签顺序；且 `setChildrenInPlace` 的同步行为不可控 |
| 拖标签到另一个标签上入组 | 需要接管宿主的拖拽语义，风险高，收益低（侧栏已有六种入组入口） |
| 空分组显示 pill | 没有可挂载的标签头。侧栏仍然是「分组存在性」的唯一视图 |
| 折叠状态写盘 | 见 §3.5 |

### 3.9 Spike 清单（动工前必须逐条验证）

每条 20–30 分钟，做完再决定是否继续。**任何一条失败都要走对应兜底，不能硬上。**

| # | 问题 | 怎么验 | 失败兜底 |
|---|---|---|---|
| S-1 | 加 `display:none` 后，宿主的 `tabHeaderEls.indexOf(header)` 与 `children` 是否仍然对齐？ | 折叠 3 个后点第 4 个标签，看打开的是不是它 | 改 `visibility:hidden` + `width:0`（仍占索引位）；再不行放弃折叠，只做「高亮分组」 |
| S-2 | `setChildrenInPlace` 会不会清掉我们注入的节点？ | 往 `-inner` 里 `appendChild` 一个 div，切一次标签看还在不在 | 已知风险高，**默认按「会清掉」设计**，只用伪元素 |
| S-3 | 隐藏后剩余标签是否自动变宽？ | 折叠 5 个观察宽度 | 手动覆盖 `--tab-width`（pinned-row 已有先例） |
| S-4 | capture 阶段 `stopPropagation` 能否阻止宿主激活标签？ | 折叠态点 pill，看是否打开文件 | 改为「点击 pill 时不拦截，但立刻再折叠回去」；或把折叠入口只放在右键菜单 |
| S-5 | chip 的 `offsetX` 命中判断是否可靠？ | 点 chip 左半与右半 | 把 chip 做成独立的一格（占用标签头左侧固定宽度，标题让位） |
| S-6 | 折叠/展开会不会触发 `layout-change` 反复抖动？ | 观察 rescan 次数 | 折叠时加 `#suppress` 标记，跳过该次 rescan |

### 3.10 落点与测试

**新增**
- `src/ui/tab-decorator.ts` — 单写者（§3.6）
- `src/ui/tab-groups.ts` — 折叠状态、点击拦截、拖拽临时展开
- `tests/tab-decorator.test.ts` — 纯函数部分（给定输入 → 期望的类名集合）

**改动**
- `src/ui/pinned-row.ts` — 交出类名控制权，只保留探测与尺寸
- `src/controller.ts` — `collapsedGroups: Set<string>`、`toggleGroupCollapsed(id)`
- `styles.css` — `.tt-g*` 系列；注意与现有染色规则的特异性关系
- `src/i18n/*` — pill 的 tooltip（「Research · 3 个标签 · 点击展开」）

---

## 4. 实施顺序

| 阶段 | 内容 | 前置 | 状态 |
|---|---|---|---|
| ~~0~~ | ~~`tab-decorator` 重构~~ | — | **取消**（§3.6 更正：已是单写者） |
| **1** | 方案 A：`closed-stack` + 关闭检测 + 命令 + Notice 撤销 + 「最近关闭」列表 | 无 | **已完成** |
| **2** | 方案 B 的 S-1 ~ S-6 六个 spike | 无 | 待做（需要真实 Obsidian 交互） |
| **3** | 方案 B 实现（含 `Settings.collapsedGroups` 持久化） | spike 全过 | 1.2.0 headline |
| **4** | Smart Groups（G1…） | 1.2.0 | 2.0.0 |

---

## 5. 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 标签栏是宿主私有 DOM，1.15 改结构就失效 | **高** | 全部走类名 + 伪元素，不注入节点；`compat.ts` 加一次运行时自检；失效时静默降级（分组仍可用，只是标签栏不折叠） |
| `display:none` 破坏点击索引 | 高 | S-1 先验；兜底 `visibility` + `width:0` |
| 折叠状态写盘后与分组删除不同步 | 中 | 启动时按当前分组 id 过滤一次（与 `#reconcilePinnedMembers` 同时点） |
| 撤销恢复顺序与用户预期不符 | 中 | 按关闭顺序恢复；Notice 明确说「已恢复 N 个」 |
| 持久化折叠让用户找不到标签 | 中 | pill 上有组名与计数；侧栏始终显示全部；命令可一键全部展开（v1.2 待加） |

---

## 6. 决议记录

2026-11-11 用户确认：

1. **方案 B 的排期**：v1.1 只 spike，v1.2 交付。
2. **折叠状态**：持久化 → 落在 `Settings.collapsedGroups`（§3.5）。
3. **pill 显示组名 + 计数**。
4. **方案 A 的范围**：「重新打开最近一批」**加上**「最近关闭」列表视图 → 已实现。
5. **前置重构**：同意，但调研后确认不需要（§3.6）→ 已取消，省一天。

# Tab Tray 路线图：先加固，再智能

| | |
|---|---|
| 决策日期 | 2026-11-07 |
| 当前版本 | 1.0.3 |
| 上游文档 | [AUDIT-2026-10-31](./AUDIT-2026-10-31.md) §5–§7、[PRD](./PRD.md) §5.3 V5、[DESIGN](./DESIGN.md) |
| 本文件性质 | **计划**，不是需求基线。每个阶段的实现细节仍要在动工前回写 DESIGN 的 ADR |

---

## 0. 决议

2026-11-07 用户确认：**主线选 A（Smart Groups），同时要做 D（只加固）**。

这两条不是二选一，而是**顺序**：

```
D（加固）  ──────────►  A（智能分组）
v1.1「可信」→ v1.2「顺手」→ v2.0「自动」
```

理由：

1. **D 是 A 的前提**。智能分组会让「一次展开打开 80 个标签」成为常态。在没有 undo / 回收站之前，这个功能本身就是风险源——用户误点一次就丢掉整个窗格的标签。先有「可恢复」，才敢上「大批量打开」。
2. **D 不产生沉没成本**。加固项（undo、诊断、a11y、自检）无论 v2 走哪条线都需要，做完不会白做。
3. **A 需要 schema 变更**。一旦写进 `schemaVersion: 2`，回退成本高。所以它必须排在最后，且等 4 周反馈门给一个明确的 go 信号。

**决策门**：2026-12-05（上线满 5 周）复盘一次。若反馈集中在「误关标签 / 不敢用」→ 继续加固，A 顺延；若集中在「不想手动建组」→ 启动 A；若两者都有 → 按本文件顺序执行。

---

## 1. 总览

| 版本 | 主题 | 核心问题 | 规模 | 是否改 schema |
|---|---|---|---|---|
| **1.1.0** | 可信 | 用户不敢用、坏了没法查 | 3–4 周 | 否 |
| **1.2.0** | 顺手 + 补完 | 日常操作太慢；分组在标签栏里看不见 | 4–5 周 | 否 |
| **2.0.0** | 自动 | 手动建组成本太高 | 8–10 周 | **是（v1 → v2）** |
| 2.1.0 | 共享 | 分组不可迁移 | 3 周（可选） | 是（v2 内加字段） |

规模按「单人 + 每周数小时」估算，不承诺日期，按 DoD 推进。1.2.0 加了标签栏分组（S0）后从 2–3 周变为 4–5 周。

> **2026-11-11 补充**：用户指出「浏览器式分组未完全实现」，新增 H9 / S0（标签栏内折叠展开）。撤销与标签栏分组的完整方案见 [DESIGN-v1.1.md](./DESIGN-v1.1.md)。

---

## 2. 阶段一：v1.1「可信」

**P0 已在 1.0.3 清零**（CI、损坏文件覆盖）。以下是剩余项，按「信任收益 / 成本」排序。

### H1 · undo / 重新打开关闭的标签 ★最高优先 —— **已实现（待发版）**

**问题**：替换式展开会关掉当前窗格所有非固定标签，收起会关掉整组成员。误点一次无法恢复——这是新用户最不敢用的地方，也是 PRD §5.1 R5 明确承诺过的兜底。

**改动点（已落地）**
- `src/workspace/closed-stack.ts`：内存栈，容量 20，条目 `{ path, windowId, reason, closedAt }`。**不持久化**（重启即清空，避免第二套事实源）。
- `src/workspace/close-tracker.ts`：用 `PinTracker` 前后快照按稳定 `leafId` 求差得到关闭；rename/delete 维护路径；popout 整窗关闭不入栈。
- `WorkspaceExecutor.reopen(paths)`：已打开则聚焦、否则新开，只激活第一个。
- `controller` 的 `#withReason()` 给关闭批次打标签，`#notifyUndoable()` 在 Notice 里放「撤销」。
- 命令 `reopen-closed-tabs` + `recent-closed`（「最近关闭」列表），栈空时都不出现在面板。

**验收**：展开 A 组（替换掉 5 个标签）→ 执行命令 → 5 个标签按原顺序回来；重启 Obsidian 后栈为空且命令不可用；文件已删除时跳过并提示。

**注意**：`planCollapse` 的 `notOpenPaths` 不要入栈（那些本来就没开）。实现细节（关闭检测的三条来源、栈的维护、重开算法）见 [DESIGN-v1.1.md](./DESIGN-v1.1.md) §2。

### H9 · 标签栏内折叠/展开分组（Chrome 式）

**问题**：分组目前只存在于左侧栏。标签栏本身没有任何分组表达——用户点分组只能去侧栏，标签栏里看到的仍是一排无差别的标签。这是「浏览器式分组」缺的最后一块。

**为什么单独列出来**：它不是加固，是补完 v1 的产品承诺；但技术风险明显高于其它项，所以 **v1.1 只做 spike，v1.2 交付**。

**核心约束**（本机 1.14.x `app.js` 实测）：`updateTabDisplay()` 每次都会 `tabsInnerEl.setChildrenInPlace(标签头数组)`，把容器子节点同步成标签头列表——**注入的节点会被清掉**。因此只能给现有标签头加类名、用伪元素画 pill。

**改动点**：折叠类名直接加进 `PinnedRow.refresh()`（调研确认它已是标签头的唯一写者，**不需要**额外的单写者重构）；`tt-g*` 类名 + 伪元素 pill；捕获阶段点击拦截；拖拽时临时展开；折叠状态存 `Settings.collapsedGroups`（用户已决定持久化）。六个 spike 与兜底见 [DESIGN-v1.1.md](./DESIGN-v1.1.md) §3.9。

**验收**：点组名 chip → 该组标签收起为 pill（显示组名 + 数量）；点 pill → 原样展开；拖拽排序在折叠态下仍落点正确；重启后全部展开；宿主 DOM 变化时静默降级（分组仍可用，标签栏不折叠）。

### H2 · 紧凑固定行的运行时自检

**问题**：`compat.ts` 只做静态探测（`.workspace-tab-header-inner` / `-title`），而 `pinned-row.ts:68` 依赖 `.workspace-tab-header-status-icon.mod-pinned`。若 Obsidian 改了这个类名，静态探测照样通过，紧凑行**静默失效**，设置开关还是亮的——违反 D18 的「运行时自检级」。

**改动点**
- `compat.ts` 新增 `verifyPinnedIndicator(leaf)`：取一个 `leaf.getViewState().pinned === true` 的 leaf，检查 `leaf.tabHeaderEl` 内是否存在固定指示器。
- 首次 pin 事件时执行一次；不匹配 → `compactPinnedRowAvailable = false` + 一次性 Notice，并置灰开关。
- 无固定标签时不判定（返回 `pending`），不能因为「用户没固定过」就误判不支持。

**验收**：临时把选择器改成不存在的类名 → 首次固定后收到降级提示、开关置灰、标签栏不再变形；恢复选择器后重新启用需重启（或加「重新检测」按钮）。

### H3 · popout 窗口的 document 绑定

**问题**：`Sidebar.svelte:573` 的 `<svelte:document onclick onkeydown>` 编译到全局 `document`。侧栏被拖进 popout 后，点外面关不掉菜单、Escape 不生效。`menus.ts:63-72` 的 contextmenu 也只在 `window-open` 时给新窗口注册，启动时已存在的 popout 会漏。

**改动点**
- `Sidebar.svelte`：改为 `$effect` 里对 `contentEl.ownerDocument` 注册 / 清理监听。
- `menus.ts`：启动时遍历 `app.workspace.iterateAllLeaves` 收集所有 `ownerDocument` 注册一次；`window-open` 时补注册并去重（`WeakSet<Document>`）。

**验收**（需真实 Obsidian）：把侧栏拖进 popout → 点空白处菜单关闭、Escape 清搜索；在 popout 里右键后台标签能出现「添加到分组」。

### H4 · a11y 收尾

**问题**：`Sidebar.svelte:655-667` / `:716-738` 是 `div role="button"` 内再放 `button`，键盘会停两次、读屏语义混乱；图标按钮只有 `title` 没有 `aria-label`；`styles.css:425,556` 对输入框 `outline:none`，焦点不可见。

**改动点**
- 行容器改 `role="group"`，可折叠的行加 `aria-expanded` / `aria-controls`；折叠按钮保留 `aria-expanded`。
- 所有图标按钮补 `aria-label`（用现有 i18n 键）；搜索框补 `aria-label`。
- `styles.css` 增加 `:focus-visible` 规则（只给键盘焦点描边，不影响鼠标点击）。
- 折叠动效加 `@media (prefers-reduced-motion: reduce)` 降级。

**验收**：只用键盘可以完成「搜索 → 选中 → 展开 → 收起」；Tab 不会在同一个行上停两次；焦点框可见。

### H5 · 诊断出口

**问题**：没有 telemetry 是对的，但用户报「不收缩 / 不染色」时维护者拿不到任何上下文。

**改动点**
- 命令 `copy-debug-info`：把以下内容写入剪贴板（**用户主动触发，不自动上传**）：插件版本、Obsidian 版本、平台、组数 / 成员数 / 打开标签数、`compactPinnedRowAvailable` 与探测原因、`groupColors` 设置、`data.json` 路径、最近 30 条 `[tab-tray]` 日志。
- 日志加环形缓冲（`src/core/log-buffer.ts`，200 条），`main.ts` 的 `port.log` 写入。

**验收**：命令执行后剪贴板是可直接贴进 issue 的纯文本；内容里没有文件正文、没有绝对路径以外的隐私数据。

### H6 · 命令去重

`commands.ts:81-92` 的 `open-sidebar` 与 `open-tab-manager` 回调完全相同。保留 `open-sidebar`，`open-tab-manager` 标记 legacy 并在 1.2.0 移除（先改名加「（旧）」过渡，避免直接断掉用户的快捷键）。

### H7 · 测试补齐

- `file-follow`：rename / delete / create 用 fake app 覆盖（现在完全没测）。
- `commands`：动态注册 / 注销。
- `persist`：已补 rename 失败 2 条（1.0.3）。

**DoD**：`test` ≥ 150；CI 绿；真实 Obsidian 复跑 A1–A10 + M1–M10。

### H8 · 引导与演示（可与 H1 并行）

- 空态三步引导：「右键任意文件 → 添加到分组」→「点组头展开」→「固定标签会自动移出」。
- 30 秒 GIF：建组 → 加文件 → 展开 → 固定 → 重启仍在。README 顶部替换静态图。

---

## 3. 阶段二：v1.2「顺手」

不引入 schema 变更，全部是交互层。

| ID | 内容 | 关键约束 |
|---|---|---|
| **S0** | **标签栏内折叠/展开分组（headline）** | 见 H9 与 [DESIGN-v1.1.md](./DESIGN-v1.1.md) §3；六个 spike 全过才动工 |
| S1 | 多选：Ctrl/Cmd 点选、Shift 连选，批量关闭 / 移动 / 固定 | 批量固定会触发「固定即移出」，必须二次确认；不得破坏 R2 / R5 / R12 |
| S2 | 逐窗格跳转：点 ×N 徽标 → 菜单列出窗口 / 窗格 → 聚焦 | 复用 `TabListEntry.leafIds`，不新增扫描 |
| S3 | 快速跳转命令「Switch to open tab…」 | 模糊搜索全部窗口的打开标签，Enter 聚焦；不碰 Store |
| S4 | 分组命令补充：「收起其他分组」「在新窗口打开分组」 | 后者需确认窗口归属，`getLeaf('window')` |
| S5 | 面板键盘导航：↑/↓、Enter、Delete、Esc | 与 H4 的 a11y 结构一起做，不要分两次改 DOM |

**DoD**：键盘可完成「搜索 → 选中 → 聚焦 / 关闭 / 加入分组」；1.2.0 Release + A1–A10 回归。

---

## 4. 阶段三：v2.0「自动」— Smart Groups

### 4.1 一句话

让分组从「手工维护的桶」变成「按规则自动归位的视图」，但**规则是持久资产，成员是派生结果**——不引入第二套成员事实源（DESIGN P2）。

### 4.2 数据模型（schema v2）

```ts
export type GroupKind = 'manual' | 'smart';

export type SmartRule =
  | { type: 'folder'; prefix: string; includeSubfolders: boolean }
  | { type: 'tag'; tag: string }                        // 不带 #
  | { type: 'property'; key: string; value?: string }    // value 为空 = 有该 key 即可
  | { type: 'glob'; pattern: string };                   // 高级

export interface Group {
  id: string;
  name: string;
  color: ColorKey;
  /** v2 新增；v1 数据迁移后一律为 'manual'。 */
  kind: GroupKind;
  /** manual：真实成员，落盘。smart：**恒为空数组**，绝不写派生结果。 */
  members: Member[];
  /** 仅 smart 有值。一个智能组一条规则。 */
  rule?: SmartRule;
}
```

`Settings` 新增：`smartExpandLimit: number`（默认 100，范围 10–500）。

**为什么一个组只允许一条规则**：`folder + tag` 这类组合的 UI（AND / OR / 括号）是另一个量级的工作，而用户可以用「建两个组」覆盖大多数需求。多规则留到 2.1，且用数组 `rules: SmartRule[]` + `match: 'all' | 'any'` 扩展，不破坏 v2 结构。

### 4.3 五条语义决议

**S-1 · 手动组优先（排除，不合并）**
一个文件若已在某个手动组里，则**不出现在任何智能组的派生成员中**。这让「一个文件最多属于一个分组」（R2）在全系统仍是真话，染色也不会出现歧义。手动加入因此成为「把文件从智能视图里摘出来」的显式手段。
→ 智能组头在存在被排除文件时显示一行浅色说明：「{n} 个文件已在手动分组中」。

**S-2 · 固定标签排除**
派生成员过滤掉当前处于 pinned 状态的路径（与 R6 的「固定即移出」一致）。智能组不产生写操作，取消固定后文件自动回到智能视图。
→ 副作用：分母 m 会随固定状态变化。这是诚实的，`n/m` 仍表示「当前可展开的成员」。

**S-3 · 智能组可以重叠**
一个文件可同时匹配多个智能组（视图语义）。染色遇到多个不同颜色 → 不染色（`tab-color-index.ts` 的 `resolve()` 已实现「冲突即丢弃」），不需要新逻辑。

**S-4 · 展开上限**
`smartExpandLimit` 默认 100。超过时弹确认：「将打开 N 个标签，继续？」。手动组不设此限（R9 的软阈值继续只管手动组）。

**S-5 · 智能组不可直接增删成员**
六个成员入口对智能组一律拒绝（新 `RejectReason: 'smart-group'`），UI 也不渲染这些菜单项。要改成员就改规则；要把派生结果固化，用「Convert to manual…」把当前派生成员物化。

### 4.4 规则求值

| 规则 | 匹配依据 | 注意 |
|---|---|---|
| folder | `file.path` 前缀 | `includeSubfolders=false` 时只匹配该层；`prefix` 为空 = 全库（用于 glob 之外的兜底） |
| tag | `metadataCache.getFileCache(file)?.tags` | 含正文标签与 frontmatter 标签；比较前剥 `#`、大小写不敏感；支持嵌套 `#a/b` |
| property | `getFileCache(file)?.frontmatter` | `value` 为空表示「存在该 key」；值比较用字符串相等 |
| glob | `file.path` | 只支持 `*` / `**` / `?`，编译成正则并缓存；不引入 minimatch 依赖 |

**求值时机**：`metadataCache.on('resolved')`、`vault.on('create' | 'delete' | 'rename')`、规则变更。防抖 300ms，**单次全量重算**（不做增量：10k 文件的单遍扫描比维护增量索引更可靠，先量化再优化）。

**库外文件天然排除**：`app.vault.getFiles()` 只返回 vault 内文件，R12 无需额外判断。

### 4.5 模块落点

**新增**
- `src/core/smart.ts` — 纯函数：`matchRule(rule, file)`、`compileGlob(pattern)`、`resolveGroupMembers(data, derived, pinned)`。**不 import obsidian**，可在 Node 下单测。
- `src/workspace/smart-index.ts` — 订阅 vault / metadataCache，维护 `Map<groupId, string[]>`，暴露 `snapshot()` 与 `on('change')`。

**改动**
- `core/types.ts` — `GroupKind` / `SmartRule` / `Group.kind` / `Group.rule` / `SCHEMA_VERSION = 2` / `parseGroup` 校验规则形状。
- `core/migrate.ts` — 新增 `MIGRATIONS[1]`：给每个组补 `kind: 'manual'`，`schemaVersion: 2`。
- `core/store.ts` — `group.create` 接受 `kind` / `rule`；新增 `group.setRule`、`group.convertToManual`；`member.add/remove/move/reorder` 对 smart 组返回 `smart-group`。
- `controller.ts#compute` — `openCounts` 与 `tabs.groupId` 改用「有效成员」而非 `group.members`。
- `workspace/plan.ts` — 不需要改：它接收 `members: string[]`，调用方传入有效成员即可。**这是 v1 分层设计的红利。**
- `ui/sidebar/Sidebar.svelte` — 组头 Smart 徽标、菜单项、空态、排除提示。
- `ui/new-group-modal.ts` — Manual / Smart 切换 + 规则编辑器 + 实时预览「匹配 N 个文件」。
- `ui/tab-color-index.ts` — 输入改为有效成员（若 S-1 成立，语义不变）。
- `i18n/en.ts` + `zh-cn.ts` — 约 20 个新键。

### 4.6 UI 变更

| 位置 | 变更 |
|---|---|
| 新建分组对话框 | 顶部 Manual / Smart 分段控件；Smart 时显示规则类型下拉 + 字段 + 预览 |
| 组头 | Smart 组显示小徽标（`smart` 图标，`currentColor` 描边）；计数 `n/m` 照旧 |
| 组右键菜单 | 新增「编辑规则…」「转换为手动分组…」；不显示「添加成员」类项 |
| 空智能组 | 「没有文件匹配这条规则」+「编辑规则」按钮 |
| 命令面板 | 「从文件夹创建分组」：扫描顶层文件夹，一次生成 N 个智能组（10 秒看到价值的关键入口） |

### 4.7 迁移与回滚

- v1 → v2：纯函数迁移，组顺序、id、颜色、成员全部保持不变；仅追加 `kind`。
- 迁移前 `PersistenceEngine` 已有 `.bak` 轮换，天然留一份 v1 数据。
- **降级**：v1 版插件读到 `schemaVersion: 2` → `future-version` → 只读 + 不覆盖（`persist.ts` 现有行为）。用户不会丢数据，但会看到「写入已暂停」的提示。发布说明必须写明这一点。
- 迁移单测：v1 样本 → v2，逐字段断言；损坏的 `rule` 降级为 `manual` 而不是丢组。

### 4.8 Issue 拆解

| ID | 标题 | 依赖 | 验收 |
|---|---|---|---|
| G1 | `feat(schema): add group kind and smart rule to v2` | — | 迁移单测：v1 → v2 字段不变；`SCHEMA_VERSION = 2` |
| G2 | `feat(core): rule matcher for folder, tag, property, glob` | G1 | 单测覆盖嵌套 tag、大小写、`includeSubfolders`、glob 边界 |
| G3 | `feat(workspace): derive smart members from the vault index` | G2 | 10k 文件 / 20 组求值 < 50ms；防抖 300ms |
| G4 | `feat(store): reject member edits on smart groups` | G1 | `member.*` 对 smart 组返回 `smart-group`；`setRule` / `convertToManual` 有单测 |
| G5 | `feat(core): resolve effective members (manual wins, pinned excluded)` | G2,G4 | `resolveGroupMembers` 单测：排除、重叠、固定 |
| G6 | `feat(plan): expand cap with confirmation` | G5 | 超过上限弹确认；取消则不打开任何标签 |
| G7 | `feat(ui): smart group editor with live match count` | G2,G4 | 改规则实时更新预览；保存后列表立即变化 |
| G8 | `feat(ui): smart badge, menu items and empty state` | G7 | 智能组不显示成员入口；空态可直达编辑规则 |
| G9 | `feat: create groups from folders` | G7 | 一次生成 N 组；重名自动加后缀 |
| G10 | `feat(ui): tint smart members` | G5 | 多组匹配不染色；单组匹配正常染色 |
| G11 | `docs: v2 migration and rollback notes` | G1 | README + CHANGELOG 写明降级后果 |

**建议排期**：G1 → G2 → G3 是地基（约 3 周）；G4 → G5 是语义（约 2 周）；G6 → G10 是 UI（约 3–4 周）；G11 收尾。每完成一批就发一次 beta（`2.0.0-beta.N`），不要攒到最后。

### 4.9 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 规则概念用户不理解 | 高 | 只做 folder / tag / property；glob 藏在「高级」；新建对话框给示例 |
| 展开导致标签爆炸 | 高 | 上限 100 + 确认；组头显示匹配数 |
| 10k 文件求值卡顿 | 中 | 防抖 + 单遍扫描 + 基准；超 50ms 再上增量 |
| 迁移损坏 | 高 | 迁移前 `.bak` 已有；单测 + 损坏规则降级为 manual |
| 智能组与手动组语义混淆 | 中 | Smart 徽标 + 排除提示 + 文档；S-1 是唯一需要用户学习的规则 |
| 降级后只读让人恐慌 | 中 | Notice 文案说明「数据安全，请升级回 v2」 |

### 4.10 DoD

- 迁移：v1 数据 → v2，组 / 成员 / 颜色 / 顺序逐项不变。
- 规则：folder / tag / property / glob 单测；嵌套 tag、大小写、库外排除。
- 语义：S-1 / S-2 / S-3 / S-5 各有单测；展开上限有确认流程测试。
- 性能：10k 文件、20 个智能组，单次求值 < 50ms；面板 200 标签刷新 < 16ms。
- 真实 Obsidian：建智能组 → 新建匹配文件 → 自动出现 → 展开 / 收起 → 重启 → 规则仍在。
- 发布：`2.0.0` + 迁移说明 + 回滚说明；`test` ≥ 200。

---

## 5. 明确不做

| 项 | 理由 |
|---|---|
| 垂直标签栏 | 正面竞争 Vertical Tabs（87k 下载、活跃发版）；稀释「原生标签栏内」定位 |
| 会话保存 / 恢复 | 分组即持久会话；再建一套就是第二事实源 |
| 标签休眠 | Obsidian 无此概念 |
| 云同步 / 后端 | `data.json` 随配置漫游，够了 |
| 遥测 | 隐私红线；用 H5 的「复制调试信息」替代 |
| AI 自动命名 / 分类 | 隐私 + 不可预测；规则已覆盖主要场景 |
| 多规则 AND / OR | 2.1 再评估，v2 先保证单规则扎实 |
| 自由取色器 | 固定 10 色保证明暗对比 |
| 移动端 | 无桌面标签栏（PRD 非目标） |

---

## 6. 成功指标

- **可靠性**：90 天内 0 起数据丢失 issue；每次 Release 复跑 M1–M10。
- **可恢复**：H1 上线后，「误关标签」类 issue 应在 24h 内可自助解决。
- **性能**：200 标签 / 20 组，面板刷新 < 16ms，rescan < 8ms；智能组求值 < 50ms。
- **质量**：CI 全绿；v1.1 ≥ 150 tests；v2.0 ≥ 200 tests；P0 / P1 零积压。
- **口碑**：商店评分 ≥ 4.5；issue 首次响应 < 48h。
- **增长**：4 周后看下载与评价质量，不以功能数量为指标。

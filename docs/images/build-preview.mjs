import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Renders `docs/images/preview*.html`, the static mock the README screenshots
 * are taken from. It reuses the prototype's Obsidian shell and the plugin's
 * real `styles.css`, so the panel is styled by the stylesheet that ships —
 * only the data is fake.
 */
const root = process.cwd();
const proto = readFileSync(path.join(root, 'prototype/screens/01-workspace.html'), 'utf8');

const head = proto.slice(0, proto.indexOf('<body')).replaceAll('../assets/', '../../prototype/assets/');
const shell = proto.slice(proto.indexOf('<div class="window">'), proto.indexOf('<div class="sidebar">'));

const icon = (paths, size = 16, cls = 'micon') =>
	`<span class="tt-icon ${cls}" style="--tt-icon-size:${size}px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;

const FILE =
	'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>';
const CANVAS = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18"/>';
const X = '<path d="M18 6 6 18M6 6l12 12"/>';
const PIN =
	'<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/>';
const DOWN = '<path d="m6 9 6 6 6-6"/>';
const PLUS = '<path d="M12 5v14M5 12h14"/>';
const CHEV_L = '<path d="m17 7-5 5 5 5"/><path d="m10 7-5 5 5 5"/>';
const CHEV_R = '<path d="m7 17 5-5-5-5"/><path d="m14 17 5-5-5-5"/>';
const MORE =
	'<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></g>';

const COPY = {
	en: {
		lang: 'en',
		files: 'Files',
		groups: 'Groups',
		newGroup: 'New group',
		search: 'Search groups and tabs…',
		tidy: 'Tidy all',
		sections: ['Pinned', 'Ungrouped', 'External'],
		external: 'external',
		missing: 'missing',
		pinned: ['Paper draft.md', 'Weekly-Oct.md'],
		ungrouped: ['Ideas.md', 'Lit review.md', 'Meeting notes.md'],
		externalFiles: ['budget.xlsx'],
		research: {
			name: 'Research',
			color: 'blue',
			open: 1,
			total: 4,
			rows: ['Data.canvas', 'References.md', 'Old note.md', 'Chapter 3.md'],
			missing: 'Old note.md',
		},
		writing: {
			name: 'Writing',
			color: 'green',
			open: 1,
			total: 3,
			rows: ['Chapter 1.md', 'Chapter 2.md', 'Index.md'],
		},
		archive: { name: 'Archive', color: 'purple', open: 0, total: 6 },
		tabs: ['Data.canvas', 'Ideas.md', 'Lit review.md', 'Meeting notes.md'],
		doc: {
			title: 'Ideas.md',
			path: 'Notes / Ideas.md',
			h2a: 'Why tabs pile up',
			p1: 'Research, writing and a project move at the same time. Twenty tabs later the tab bar is a queue, not a map, and finding the one you want costs more than reopening it.',
			p2: 'Groups fix the shape of the problem: a handful of named buckets you open and close in one gesture. The hard part is not the gesture — it is that the buckets are still there tomorrow.',
			callout:
				'[!info] The three tabs of “Research” are wrapped in a blue capsule — that is the group colour, painted on the host tab header.',
			h2b: 'Next',
			li1: 'Collect the durability bugs of the alternatives',
			li2: 'File the interview notes under “Writing”',
		},
	},
	zh: {
		lang: 'zh',
		files: '文件',
		groups: '分组',
		newGroup: '新建分组',
		search: '搜索分组与标签…',
		tidy: '一键收纳',
		sections: ['已固定', '未分组', '库外'],
		external: '库外',
		missing: '丢失',
		pinned: ['论文草稿.md', '周报-十月.md'],
		ungrouped: ['灵感收集.md', '文献综述.md', '会议记录.md'],
		externalFiles: ['预算.xlsx'],
		research: {
			name: '研究',
			color: 'blue',
			open: 1,
			total: 4,
			rows: ['数据整理.canvas', '参考文献.md', '旧笔记.md', '第三章.md'],
			missing: '旧笔记.md',
		},
		writing: {
			name: '写作',
			color: 'green',
			open: 1,
			total: 3,
			rows: ['第一章.md', '第二章.md', '索引.md'],
		},
		archive: { name: '归档', color: 'purple', open: 0, total: 6 },
		tabs: ['数据整理.canvas', '灵感收集.md', '文献综述.md', '会议记录.md'],
		doc: {
			title: '灵感收集.md',
			path: '笔记 / 灵感收集.md',
			h2a: '标签为什么会堆起来',
			p1: '研究、写作与项目并行推进时，标签栏很快就变成一条队列而不是一张地图：找到想要的那个，比重新打开它还费劲。',
			p2: '分组解决的是形状问题——几个有名字的桶，一个手势开关。难的不是手势，而是明天打开 Obsidian 时这些桶还在。',
			callout:
				'[!info]「研究」的 3 个已打开标签以蓝色胶囊环绕——这是按分组染色的效果，色点与胶囊同源。',
			h2b: '待补充',
			li1: '竞品持久化缺陷案例整理',
			li2: '访谈纪要归档到「写作」',
		},
	},
};

function tabRow(name, { glyph = FILE, pin = false, active = false, external = false, missing = false }, c) {
	const badge = external ? `<span class="tflag">${c.external}</span>` : '';
	const flag = missing ? `<span class="mflag">${c.missing}</span>` : '';
	return `
              <div class="member tentry${active ? ' active-row' : ''}" title="${name}">
                ${icon(glyph)}
                <span class="mname">${name}</span>${pin ? icon(PIN, 12, 'mpin') : ''}${badge}${flag}
                <button class="mx" title="close">${icon(X, 12, '')}</button>
              </div>`;
}

function section(c, kind, rows) {
	const label =
		kind === 'pinned' ? c.sections[0] : kind === 'ungrouped' ? c.sections[1] : c.sections[2];
	const mark = kind === 'pinned' ? icon(PIN, 13, 'tsec-icon') : '<span class="gdot tt-dot-muted"></span>';
	return `
        <div class="tsec" role="group">
          <div class="tsec-head" role="button" tabindex="0">
            <button type="button" class="twist">${icon(DOWN, 14, '')}</button>
            ${mark}
            <span class="tsec-name">${label}</span>
            <span class="gcount has">${rows.length}</span>
          </div>
          <div class="members">${rows.join('')}
          </div>
        </div>`;
}

function group(c, spec, isOpen) {
	return `
        <div class="group gc-${spec.color}${isOpen ? '' : ' folded'}" role="group">
          <div class="ghead" draggable="true" role="button" tabindex="0">
            <button type="button" class="twist">${icon(DOWN, 14, '')}</button>
            <span class="gdot"></span>
            <span class="gname">${spec.name}</span>
            <span class="gcount${spec.open > 0 ? ' has' : ''}">${spec.open}/${spec.total}</span>
            <span class="gacts">
              <button class="gact" title="expand">${icon(CHEV_R, 14, '')}</button>
              <button class="gact" title="collapse">${icon(CHEV_L, 14, '')}</button>
              <button class="gact" title="more">${icon(MORE, 14, '')}</button>
            </span>
          </div>
          ${
						isOpen
							? `<div class="members">${spec.rows
									.map((name) =>
										tabRow(name, {
											glyph: name.endsWith('.canvas') ? CANVAS : FILE,
											active: false,
											missing: name === spec.missing,
										}, c),
									)
									.join('')}
          </div>`
							: ''
					}
        </div>`;
}

function sidebar(c) {
	const pinned = c.pinned.map((n) => tabRow(n, { pin: true, active: false }, c));
	const ungrouped = c.ungrouped.map((n, i) => tabRow(n, { active: i === 0 }, c));
	const external = c.externalFiles.map((n) => tabRow(n, { external: true }, c));

	return `
    <div class="sidebar tab-tray-view">
      <div class="side-tabs">
        <div class="stab"><svg class="i14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>${c.files}</div>
        <div class="stab active"><svg class="i14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>${c.groups}</div>
      </div>

      <div class="tt-view">
        <div class="view-head">
          <span class="vh-title">Tab Tray</span>
          <button class="vh-new">${icon(PLUS, 12, '')}${c.newGroup}</button>
        </div>

        <div class="tt-tabs">
          <div class="tm-tools">
            <input class="tm-search" placeholder="${c.search}" readonly>
            <button class="tm-collapse">${icon(CHEV_L, 14, '')}${c.tidy}</button>
          </div>

          <div class="glist">${section(c, 'pinned', pinned)}${section(c, 'ungrouped', ungrouped)}${section(c, 'external', external)}
            <div class="tsec-rule" role="separator"></div>${group(c, c.research, true)}${group(c, c.writing, true)}${group(c, c.archive, false)}
          </div>
        </div>
      </div>
    </div>
`;
}

function main(c) {
	const tabs = c.tabs
		.map((name, i) => {
			const grouped = i === 0;
			const active = i === 1;
			return `
          <div class="tab${grouped ? ' grouped gc-blue' : ''}${active ? ' active' : ''}">
            ${grouped ? '<span class="tdot"></span>' : ''}
            <svg class="i14 ticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${name.endsWith('.canvas') ? CANVAS : FILE}</svg>
            <span class="ttitle">${name}</span>
            <button class="tclose">${icon(X, 12, '')}</button>
          </div>`;
		})
		.join('');

	return `
    <div class="main" style="display:flex;flex-direction:column;flex:1;min-width:0;">
      <div class="tabbar">
        <div class="pinrow" title="compact pinned row">
          <button class="pintab gc-blue">${icon(FILE, 14, '')}<span class="pindot"></span></button>
          <button class="pintab">${icon(FILE, 14, '')}</button>
        </div>
        <div class="tabs">${tabs}
        </div>
        <div class="tb-acts">
          <button class="tb-btn">${icon(PLUS, 14, '')}</button>
          <button class="tb-btn">${icon(MORE, 14, '')}</button>
        </div>
      </div>

      <div class="editor">
        <div class="note">
          <h1 class="nt-title">${c.doc.title}</h1>
          <div class="nt-path">${c.doc.path}</div>
          <h2 class="nt-h2">${c.doc.h2a}</h2>
          <p class="nt-p">${c.doc.p1}</p>
          <p class="nt-p">${c.doc.p2}</p>
          <div class="callout">${c.doc.callout}</div>
          <h2 class="nt-h2">${c.doc.h2b}</h2>
          <p class="nt-li">${c.doc.li1}</p>
          <p class="nt-li">${c.doc.li2}</p>
        </div>
      </div>
    </div>

  </div>
</div>
`;
}

const SHIM = `
<style>
  /* Obsidian theme variables the plugin reads, mapped onto the mock's tokens. */
  body {
    --background-primary: var(--bg-primary);
    --background-secondary: var(--bg-secondary);
    --background-modifier-border: var(--border);
    --background-modifier-border-hover: var(--border-strong);
    --background-modifier-hover: var(--bg-hover);
    --background-modifier-active-hover: var(--bg-active);
    --interactive-accent: var(--accent);
    --text-on-accent: var(--on-accent);
    --text-error: var(--error);
    --color-red-rgb: 227, 93, 107;
    --shadow-s: var(--shadow-pop);
    --shadow-l: var(--shadow-win);
  }
  .sidebar.tab-tray-view { width: 300px; }
</style>
`;

for (const [key, c] of Object.entries(COPY)) {
	const file = key === 'en' ? 'preview.html' : 'preview.zh.html';
	const headOut = head
		.replace(/<title>[^<]*<\/title>/, '<title>Tab Tray · preview</title>')
		.replace('</head>', `<link rel="stylesheet" href="../../styles.css">\n${SHIM}\n</head>`);
	const html = `${headOut}<body class="theme-dark lang-${c.lang}">${shell}${sidebar(c)}${main(c)}`;
	writeFileSync(path.join(root, 'docs/images', file), html, 'utf8');
	console.log('written', file, html.length, 'bytes');
}

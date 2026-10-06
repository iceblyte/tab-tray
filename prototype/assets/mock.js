/* ============================================================
   Tab Tray UI 原型 · 演示脚本（无产品逻辑，仅开关演示）
   - 主题切换：body.theme-dark / theme-light（默认暗）
   - 双语切换：body.lang-zh / lang-en（默认中文）
   - 染色开关：body.color-off（仅标签染色演示页出现）
   - 弹层开关：[data-toggle="#id"] 点击开合，点击外部关闭
   ============================================================ */
(function () {
  var body = document.body;

  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* 主题 */
  all('[data-act="theme"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var dark = body.classList.toggle('theme-dark');
      body.classList.toggle('theme-light', !dark);
      btn.textContent = dark ? '☾' : '☀';
      btn.title = dark ? '切换到亮色主题' : 'Switch to dark theme';
    });
  });

  /* 双语 */
  all('[data-act="lang"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var zh = body.classList.toggle('lang-zh');
      body.classList.toggle('lang-en', !zh);
      btn.textContent = zh ? '中' : 'EN';
      btn.title = zh ? 'Switch to English' : '切换到中文';
      /* <option> 内不能放双语 span，这里手动换第一项文案 */
      all('select.ctl-select').forEach(function (sel) {
        if (sel.options[0]) sel.options[0].textContent = zh ? '自动（跟随 Obsidian）' : 'Auto (follow Obsidian)';
      });
    });
  });

  /* 染色开关（按分组染色演示） */
  all('[data-act="color"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      body.classList.toggle('color-off');
    });
  });

  /* 弹层开合 */
  all('[data-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var target = document.querySelector(btn.getAttribute('data-toggle'));
      if (target) target.classList.toggle('open');
    });
  });
  document.addEventListener('click', function (e) {
    all('.popover.open').forEach(function (p) {
      if (!p.contains(e.target)) p.classList.remove('open');
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') all('.popover.open').forEach(function (p) { p.classList.remove('open'); });
  });

  /* 色板选择演示：点击色格仅移动选中环（不改数据） */
  all('.gpalette').forEach(function (pal) {
    pal.addEventListener('click', function (e) {
      var sw = e.target.closest('.sw');
      if (!sw) return;
      Array.prototype.slice.call(pal.querySelectorAll('.sw')).forEach(function (s) {
        s.classList.remove('cur');
      });
      sw.classList.add('cur');
    });
  });
})();

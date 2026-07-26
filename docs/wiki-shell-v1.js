(function () {
  'use strict';

  /* ── 主题：留灯 / 熄灯 ── */
  var root = document.documentElement;
  var toggle = document.getElementById('wiki-theme-toggle');
  function currentTheme() {
    var t = root.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function paintToggle() {
    if (toggle) toggle.textContent = currentTheme() === 'dark' ? '☀' : '☾';
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('wiki-theme', next); } catch (e) {}
      paintToggle();
    });
    paintToggle();
  }

  /* ── 顶栏：当前卷高亮 ── */
  var links = Array.prototype.slice.call(document.querySelectorAll('#wiki-topbar .tb-links a'));
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
  var watched = Object.keys(byId).map(function (id) { return document.getElementById(id); }).filter(Boolean);
  if ('IntersectionObserver' in window && watched.length) {
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) current = entry.target.id; });
      links.forEach(function (a) { a.classList.toggle('on', a === byId[current]); });
    }, { rootMargin: '-15% 0px -75% 0px' });
    watched.forEach(function (s) { io.observe(s); });
  }

  /* ── 快搜：⌘K 搜这一生 ── */
  var overlay = document.getElementById('wiki-find');
  var input = document.getElementById('wiki-find-input');
  var list = document.getElementById('wiki-find-list');
  var countEl = document.getElementById('wiki-find-count');
  var openBtn = document.getElementById('wiki-find-open');
  if (!overlay || !input || !list) return;

  function normalize(v) {
    return String(v || '').toLocaleLowerCase('zh-CN').replace(/\s+/g, '').replace(/["'“”‘’《》]/g, '');
  }

  /* ── 怪物图鉴：总览卡点击后展开运行时画像与完整机制 ── */
  var beastDialog = document.createElement('dialog');
  beastDialog.className = 'beast-detail-dialog';
  beastDialog.setAttribute('aria-labelledby', 'beast-detail-title');
  var beastShell = document.createElement('div');
  beastShell.className = 'beast-detail-shell';
  var beastHead = document.createElement('header');
  beastHead.className = 'beast-detail-head';
  var beastKicker = document.createElement('span');
  beastKicker.textContent = '叙事外观档案';
  var beastTitle = document.createElement('strong');
  beastTitle.id = 'beast-detail-title';
  var beastClose = document.createElement('button');
  beastClose.type = 'button';
  beastClose.className = 'beast-detail-close';
  beastClose.textContent = '×';
  beastClose.title = '关闭';
  beastClose.setAttribute('aria-label', '关闭怪物详情');
  var beastBody = document.createElement('div');
  beastBody.className = 'beast-detail-body';
  beastHead.append(beastKicker, beastTitle, beastClose);
  beastShell.append(beastHead, beastBody);
  beastDialog.appendChild(beastShell);
  document.body.appendChild(beastDialog);

  var beastReturnFocus = null;
  function openBeastDetail(card, trigger) {
    var name = card.querySelector('.nm');
    var copy = card.cloneNode(true);
    beastTitle.textContent = name ? name.textContent.trim() : '怪物详情';
    copy.classList.add('beast-detail-card');
    copy.removeAttribute('data-beast-detail');
    copy.removeAttribute('role');
    copy.removeAttribute('tabindex');
    copy.removeAttribute('aria-label');
    copy.querySelectorAll('img').forEach(function (img) {
      img.loading = 'eager';
      img.removeAttribute('loading');
    });
    beastBody.replaceChildren(copy);
    beastReturnFocus = trigger || card;
    if (typeof beastDialog.showModal === 'function') beastDialog.showModal();
    else beastDialog.setAttribute('open', '');
    beastClose.focus();
  }

  beastClose.addEventListener('click', function () { beastDialog.close(); });
  beastDialog.addEventListener('click', function (event) {
    if (event.target === beastDialog) beastDialog.close();
  });
  beastDialog.addEventListener('close', function () {
    if (beastReturnFocus && document.contains(beastReturnFocus)) beastReturnFocus.focus();
    beastReturnFocus = null;
  });

  document.querySelectorAll('#beasts .item.beast').forEach(function (card) {
    var name = card.querySelector('.nm');
    card.setAttribute('data-beast-detail', '1');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', (name ? name.textContent.trim() : '怪物') + ' · 查看外观与机制详情');
    card.addEventListener('click', function () { openBeastDetail(card, card); });
    card.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openBeastDetail(card, card);
      }
    });
  });

  var index = null;
  function buildIndex() {
    if (index) return index;
    index = [];
    var report = window.WIKI_RUNTIME_STATUS_V1;
    if (report && report.items) {
      report.items.forEach(function (item) {
        index.push({
          type: '道具',
          name: item.name,
          sub: item.flavor || item.summary,
          hay: normalize([item.id, item.name, item.flavor, item.summary, item.positive, item.negative, item.source].join(' ')),
          item: item,
          run: function () {
            close();
            if (typeof window.__wikiOpenRelic === 'function') window.__wikiOpenRelic(item.id, openBtn);
          },
        });
      });
    }
    document.querySelectorAll('#beasts .item.beast').forEach(function (card) {
      var nm = card.querySelector('.nm');
      if (!nm) return;
      var fl = card.querySelector('.fl');
      var img = card.querySelector('img.enemy-portrait');
      index.push({
        type: '怪物',
        name: nm.textContent.trim(),
        sub: fl ? fl.textContent.trim() : '',
        hay: normalize(card.textContent),
        img: img && img.getAttribute('src'),
        run: function () { close(); openBeastDetail(card, openBtn); },
      });
    });
    document.querySelectorAll('nav.rail ol a').forEach(function (a) {
      var id = (a.getAttribute('href') || '').slice(1);
      var target = document.getElementById(id);
      if (!target) return;
      var h2 = target.querySelector('h2');
      index.push({
        type: '章节',
        name: (h2 ? h2.textContent : a.textContent).trim(),
        sub: '卷 · ' + a.textContent.trim(),
        hay: normalize(a.textContent + ' ' + (h2 ? h2.textContent : '')),
        run: function () { jumpTo(target); },
      });
    });
    return index;
  }

  function jumpTo(node) {
    close();
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    node.classList.add('wiki-jump-flash');
    setTimeout(function () { node.classList.remove('wiki-jump-flash'); }, 1600);
  }

  function rank(r, q) {
    var name = normalize(r.name);
    if (name === q) return 0;
    if (name.indexOf(q) === 0) return 1;
    if (name.indexOf(q) > 0) return 2;
    return 3;
  }

  function markName(name, raw) {
    var b = document.createElement('b');
    var at = raw ? name.indexOf(raw) : -1;
    if (at < 0) { b.textContent = name; return b; }
    b.appendChild(document.createTextNode(name.slice(0, at)));
    var m = document.createElement('mark');
    m.textContent = name.slice(at, at + raw.length);
    b.appendChild(m);
    b.appendChild(document.createTextNode(name.slice(at + raw.length)));
    return b;
  }

  var results = [];
  var rows = [];
  var sel = 0;
  function updateSel(next) {
    sel = (next + rows.length) % (rows.length || 1);
    rows.forEach(function (row, i) { row.classList.toggle('sel', i === sel); });
    if (rows[sel]) rows[sel].scrollIntoView({ block: 'nearest' });
  }

  function render() {
    var raw = input.value.trim();
    var q = normalize(raw);
    var all = buildIndex();
    results = q ? all.filter(function (r) { return r.hay.indexOf(q) !== -1; }) : [];
    results.sort(function (a, b) { return rank(a, q) - rank(b, q); });
    results = results.slice(0, 14);
    rows = [];
    list.replaceChildren();
    if (!q) {
      var hint = document.createElement('div');
      hint.className = 'qf-empty';
      hint.textContent = '输入名字、一句文案、一个效果……';
      list.appendChild(hint);
      var report = window.WIKI_RUNTIME_STATUS_V1;
      countEl.textContent = (report && report.items ? report.items.length : 74) + ' 件物证 · 怪物与章节已索引';
      return;
    }
    if (!results.length) {
      var none = document.createElement('div');
      none.className = 'qf-empty';
      none.textContent = '这一生里没有找到。';
      list.appendChild(none);
      countEl.textContent = '';
      return;
    }
    var lastType = null;
    results.forEach(function (r, i) {
      if (r.type !== lastType) {
        lastType = r.type;
        var sec = document.createElement('div');
        sec.className = 'qf-sec';
        sec.textContent = r.type;
        list.appendChild(sec);
      }
      var row = document.createElement('div');
      row.className = 'qf-row';
      var ic = document.createElement('span');
      ic.className = 'qf-ic';
      if (r.item) {
        var icon = document.createElement('span');
        icon.className = 'archive-item-icon qf-item-icon';
        var atlasIndex = Math.max(0, r.item.index - 1);
        icon.style.setProperty('--icon-col', String(atlasIndex % 8));
        icon.style.setProperty('--icon-row', String(Math.floor(atlasIndex / 8)));
        ic.appendChild(icon);
      } else if (r.img) {
        var img = document.createElement('img');
        img.src = r.img;
        img.alt = '';
        img.width = 26;
        img.height = 26;
        ic.appendChild(img);
      } else {
        ic.classList.add('qf-vol');
        ic.textContent = '卷';
      }
      var tx = document.createElement('span');
      tx.className = 'qf-tx';
      tx.appendChild(markName(r.name, raw));
      var sub = document.createElement('i');
      sub.textContent = r.sub || '';
      tx.appendChild(sub);
      var tail = document.createElement('span');
      tail.className = 'qf-tail';
      if (r.item) {
        tail.className += ' q' + r.item.quality;
        tail.textContent = ['', 'Ⅰ 杂物', 'Ⅱ 旧物', 'Ⅲ 心结', 'Ⅳ 遗物'][r.item.quality] + ' · ' + r.item.source;
      } else {
        tail.textContent = '跳转 ↵';
      }
      row.append(ic, tx, tail);
      row.addEventListener('click', r.run);
      row.addEventListener('mouseenter', function () { updateSel(i); });
      list.appendChild(row);
      rows.push(row);
    });
    countEl.textContent = '共 ' + results.length + ' 条';
    updateSel(0);
  }

  function open() {
    overlay.hidden = false;
    document.body.classList.add('wiki-find-open');
    render();
    input.focus();
    input.select();
  }
  function close() {
    overlay.hidden = true;
    document.body.classList.remove('wiki-find-open');
  }

  if (openBtn) openBtn.addEventListener('click', open);
  overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
  input.addEventListener('input', render);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); updateSel(sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); updateSel(sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[sel]) results[sel].run(); }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
      e.preventDefault();
      if (overlay.hidden) open(); else close();
    } else if (e.key === 'Escape' && !overlay.hidden) {
      close();
    }
  });
})();

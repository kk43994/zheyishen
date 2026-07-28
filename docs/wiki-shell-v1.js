(function () {
  'use strict';
  /* ── 图鉴分卷导航：把分类图鉴页入口注入顶栏（幂等，独立于顶栏原有锚点） ── */
  var CODEX_PAGES = [
    ['boss.html', 'Boss志'], ['bestiary.html', '敌怪志'], ['items.html', '道具志'],
    ['voices.html', '语音馆'], ['world.html', '世界志'], ['vfx.html', '特效馆']
  ];
  var tb = document.querySelector('#wiki-topbar .tb-links');
  if (tb && !tb.querySelector('a[href="boss.html"]')) {
    CODEX_PAGES.forEach(function (page) {
      var a = document.createElement('a');
      a.href = page[0];
      a.textContent = page[1];
      a.className = 'codex-page-link';
      tb.appendChild(a);
    });
  }
})();

(function () {
  'use strict';

  /* ── 主题：留灯 / 熄灯 ── */
  var root = document.documentElement;
  var toggle = document.getElementById('wiki-theme-toggle');
  function currentTheme() {
    var t = root.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return 'dark'; // v3 夜桌版：无记忆时默认熄灯（与游戏一致）
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

/* ══════════ v3 夜桌版 · 交互与彩蛋 ══════════ */
(function () {
  'use strict';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 控制台留一句 ── */
  try {
    console.log('%c事情是改不了的，怎么做是可以选择的。', 'color:#9F3548;font-size:14px;font-family:"Songti SC",serif;font-weight:700;');
    console.log('%c——《这一身》百科。你打开了控制台，这也算一种「怎么做」。', 'color:#AAA297;font-size:11px;');
  } catch (e) {}

  /* ── 人生进度线：这一生翻到哪了 ── */
  var AGES = ['童年', '少年', '青年', '成年', '中年', '暮年'];
  var topbar = document.getElementById('wiki-topbar');
  if (topbar) {
    var rail = document.createElement('div');
    rail.className = 'life-progress';
    rail.setAttribute('aria-hidden', 'true');
    var head = document.createElement('span');
    head.className = 'lp-label';
    head.textContent = '这一生';
    var track = document.createElement('span');
    track.className = 'lp-track';
    var fill = document.createElement('span');
    fill.className = 'lp-fill';
    track.appendChild(fill);
    var dots = AGES.map(function (age, i) {
      var dot = document.createElement('span');
      dot.className = 'lp-age';
      dot.style.left = ((i + 1) / (AGES.length + 1) * 100) + '%';
      dot.title = age;
      track.appendChild(dot);
      return dot;
    });
    var tail = document.createElement('span');
    tail.className = 'lp-end';
    tail.textContent = '合卷';
    rail.append(head, track, tail);
    topbar.insertAdjacentElement('afterend', rail);
    var ticking = false;
    var syncProgress = function () {
      ticking = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      fill.style.width = (ratio * 100) + '%';
      dots.forEach(function (dot, i) {
        dot.classList.toggle('lit', ratio >= (i + 1) / (AGES.length + 1));
      });
      tail.classList.toggle('lit', ratio > 0.985);
      head.textContent = ratio > 0.985 ? '最后都穿成了' : '这一生';
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(syncProgress); }
    }, { passive: true });
    syncProgress();
  }

  /* ── 试穿悬浮：图鉴卡上看主角实机体现 ── */
  var fitTip = document.createElement('div');
  fitTip.className = 'fit-tip';
  fitTip.hidden = true;
  var fitImg = document.createElement('img');
  fitImg.alt = '';
  var fitLabel = document.createElement('span');
  fitLabel.textContent = '主角实机体现 · 试穿';
  fitTip.append(fitImg, fitLabel);
  document.body.appendChild(fitTip);
  var itemsById = {};
  (window.WIKI_RUNTIME_STATUS_V1 && window.WIKI_RUNTIME_STATUS_V1.items || []).forEach(function (item) { itemsById[item.id] = item; });
  function moveFitTip(x, y) {
    var w = 264; var h = 170;
    var left = Math.min(Math.max(x + 18, 8), window.innerWidth - w - 8);
    var top = y + 20 + h > window.innerHeight - 8 ? y - h - 14 : y + 20;
    fitTip.style.left = left + 'px';
    fitTip.style.top = Math.max(8, top) + 'px';
  }
  document.addEventListener('mouseover', function (event) {
    var card = event.target.closest && event.target.closest('.item-catalog-card');
    if (!card || !card.dataset.itemId) return;
    var item = itemsById[card.dataset.itemId];
    if (!item) return;
    fitImg.src = 'item-manifestations-v1/' + String(item.index).padStart(2, '0') + '-' + item.id + '.png';
    fitLabel.textContent = '主角实机体现 · ' + item.name;
    fitTip.hidden = false;
    moveFitTip(event.clientX, event.clientY);
  });
  document.addEventListener('mousemove', function (event) {
    if (!fitTip.hidden) moveFitTip(event.clientX, event.clientY);
  }, { passive: true });
  document.addEventListener('mouseout', function (event) {
    if (event.target.closest && event.target.closest('.item-catalog-card')) fitTip.hidden = true;
  });
  window.addEventListener('scroll', function () { fitTip.hidden = true; }, { passive: true });

  /* ── 组合名鉴：悬浮浮现奥义插画（集齐时战场上那 3.4 秒） ── */
  var COMBO_ART = {
    '那天雨太大，我没有听见': ['rain-letter', '信纸被浸湿，变慢、变重、穿透'],
    '被退回的信': ['returned-letter', '未命中的信被红笔批改后折返，二次命中更疼'],
    '大人说这都是为你好': ['for-your-own-good', '冻结解除后，一口气一次性压穿敌群'],
    '被当成风格的求救': ['cry-for-help-as-style', '受伤时涌出点赞与爱心，不提供任何治疗'],
    '我只在有用时被看见': ['seen-only-when-useful', '刚证明过有用的两秒里，他格外锋利'],
    '那年他觉得自己很酷': ['thought-he-was-cool', '掉色的雨滴标记敌人，被标记者受伤更多'],
    '这一次有人接了': ['someone-answered', '攒下的假点赞在吐出时化为真实护盾'],
    '后来我也成了他': ['became-him', '乳牙碎的那一刻，雨衣自动罩住孩子'],
    '等大家有空': ['when-everyone-is-free', '空相框复制合照的弹道，每次复制更褪色'],
    '这点重量不算什么': ['this-weight-is-nothing', '弹道停留越久越重，压得越深'],
    '能屈能伸': ['bend-and-stretch', '弯腰的程度化为暴击，暴击时他说「收到」'],
    '他当年也是这样站着的': ['stood-the-same-way', '身后浮现同样弯腰的轮廓，雨下得更密'],
  };
  var COMBO_KEYS = ['rain-letter', 'for-your-own-good', 'returned-letter', 'thought-he-was-cool', 'cry-for-help-as-style', 'someone-answered', 'became-him', 'when-everyone-is-free', 'this-weight-is-nothing', 'bend-and-stretch', 'stood-the-same-way', 'seen-only-when-useful'];
  var comboSection = document.getElementById('combos');
  if (comboSection) {
    var comboTip = document.createElement('div');
    comboTip.className = 'combo-tip';
    comboTip.hidden = true;
    var comboArt = document.createElement('div');
    comboArt.className = 'ct-art';
    var comboLine = document.createElement('div');
    comboLine.className = 'ct-line';
    comboTip.append(comboArt, comboLine);
    document.body.appendChild(comboTip);
    comboSection.addEventListener('mouseover', function (event) {
      var row = event.target.closest && event.target.closest('tbody tr');
      if (!row) return;
      var name = null;
      row.querySelectorAll('td').forEach(function (td) {
        var text = td.textContent.replace(/[《》\s]/g, '');
        Object.keys(COMBO_ART).forEach(function (combo) {
          if (text === combo.replace(/\s/g, '')) name = combo;
        });
      });
      if (!name) { comboTip.hidden = true; return; }
      var key = COMBO_ART[name][0];
      var index = COMBO_KEYS.indexOf(key);
      if (index < 0) { comboTip.hidden = true; return; }
      comboArt.style.backgroundPosition = (-(index % 2) * 288) + 'px ' + (-Math.floor(index / 2) * 162) + 'px';
      comboLine.textContent = '「' + COMBO_ART[name][1] + '」';
      comboTip.hidden = false;
      var rect = row.getBoundingClientRect();
      var left = Math.min(Math.max(event.clientX + 16, 8), window.innerWidth - 306 - 16);
      var top = rect.bottom + 210 > window.innerHeight ? rect.top - 218 : rect.bottom + 8;
      comboTip.style.left = left + 'px';
      comboTip.style.top = Math.max(8, top) + 'px';
    });
    comboSection.addEventListener('mouseleave', function () { comboTip.hidden = true; });
    window.addEventListener('scroll', function () { comboTip.hidden = true; }, { passive: true });
  }

  /* ── 彩蛋：站住六秒，会想起一件事 ── */
  var recall = document.createElement('div');
  recall.className = 'wiki-recall';
  document.body.appendChild(recall);
  var recallTimer = null;
  var recallCooldownUntil = 0;
  var recalledSeen = [];
  function scheduleRecall() {
    if (recallTimer) clearTimeout(recallTimer);
    recall.classList.remove('show');
    recallTimer = setTimeout(function () {
      if (Date.now() < recallCooldownUntil) return;
      var items = (window.WIKI_RUNTIME_STATUS_V1 && window.WIKI_RUNTIME_STATUS_V1.items || []).filter(function (item) {
        return item.flavor && recalledSeen.indexOf(item.id) === -1;
      });
      if (!items.length) return;
      var item = items[Math.floor(Math.random() * items.length)];
      recalledSeen.push(item.id);
      recall.replaceChildren(document.createTextNode('“' + item.flavor + '”'));
      var src = document.createElement('small');
      src.textContent = '站住太久，想起了《' + item.name + '》';
      recall.appendChild(src);
      recall.classList.add('show');
      recallCooldownUntil = Date.now() + 45000;
      setTimeout(function () { recall.classList.remove('show'); }, 4600);
    }, 6000);
  }
  ['scroll', 'mousemove', 'keydown', 'pointerdown'].forEach(function (kind) {
    window.addEventListener(kind, scheduleRecall, { passive: true });
  });
  scheduleRecall();

  /* ── 彩蛋：留灯 / 熄灯的黑暗收拢过场 ── */
  var lampToggle = document.getElementById('wiki-theme-toggle');
  if (lampToggle && !reduced) {
    lampToggle.addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') !== 'light';
      var veil = document.createElement('div');
      veil.className = 'lamp-veil ' + (dark ? 'to-dark' : 'to-light');
      document.body.appendChild(veil);
      setTimeout(function () { veil.remove(); }, 1000);
    });
  }
})();

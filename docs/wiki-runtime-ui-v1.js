(function () {
  'use strict';
  var report = window.WIKI_RUNTIME_STATUS_V1;
  var root = document.getElementById('mechanics');
  if (!report || !root) return;

  var summary = document.getElementById('wiki-runtime-summary');
  var priorityRoot = document.getElementById('wiki-mechanic-priorities');
  var grid = document.getElementById('wiki-mechanic-grid');
  var resultLine = document.getElementById('wiki-mechanic-result');
  var search = document.getElementById('wiki-mechanic-search');
  var source = document.getElementById('wiki-mechanic-source');
  var role = document.getElementById('wiki-mechanic-role');
  var layer = document.getElementById('wiki-mechanic-layer');
  var priority = document.getElementById('wiki-mechanic-priority');
  var reset = document.getElementById('wiki-mechanic-reset');
  var qualityNames = ['', '杂物', '旧物', '心结', '遗物', '这一身'];
  var qualityMarks = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];
  var contractFields = [
    ['numbers', '数值层'], ['rule', '规则层'], ['hero', '角色层'],
    ['projectile', '弹体层'], ['feedback', '触发反馈'], ['stack', '叠加裁决'],
  ];

  function addOption(select, value) {
    var option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  Object.keys(report.sourceCounts).sort().forEach(function (value) { addOption(source, value); });
  Object.keys(report.roleCounts).sort().forEach(function (value) { addOption(role, value); });
  Object.keys(report.productionCounts).sort().forEach(function (value) { addOption(layer, value); });

  [
    [report.summary.items, '道具合同'],
    [report.summary.runtimeEvidence, '运行时有证据'],
    [report.summary.runtimeReviewed, '专项机制门禁'],
    [report.summary.artReady, '美术有消费端'],
    [report.summary.projectileItems, '改变弹体'],
    [report.summary.combos, '命名组合'],
    [report.summary.stages, '实装阶段'],
  ].forEach(function (row) {
    var node = document.createElement('div');
    node.className = 'runtime-stat';
    var strong = document.createElement('strong');
    var span = document.createElement('span');
    strong.textContent = String(row[0]);
    span.textContent = row[1];
    node.append(strong, span);
    summary.appendChild(node);
  });

  report.priorities.forEach(function (row) {
    var node = document.createElement('div');
    node.className = 'mechanic-priority';
    var level = document.createElement('span');
    var copy = document.createElement('div');
    var title = document.createElement('strong');
    var ruleText = document.createElement('small');
    var count = document.createElement('span');
    level.className = 'level';
    count.className = 'count';
    level.textContent = row.level;
    title.textContent = row.title;
    ruleText.textContent = row.rule;
    count.textContent = String(row.count);
    copy.append(title, ruleText);
    node.append(level, copy, count);
    priorityRoot.appendChild(node);
  });

  function normalize(value) {
    return String(value || '')
      .toLocaleLowerCase('zh-CN')
      .replace(/\s+/g, '')
      .replace(/["'“”‘’《》]/g, '');
  }
  function syncArchiveCards() {
    var byName = new Map(report.items.map(function (item) {
      return [normalize(item.name), item];
    }));
    var syncedNames = new Set();
    document.querySelectorAll('#items .item').forEach(function (card) {
      var nameNode = card.querySelector('.nm');
      var item = byName.get(normalize(nameNode && nameNode.textContent));
      var effects = card.querySelector('.fx');
      if (!item || !effects || syncedNames.has(item.id)) return;
      Array.prototype.slice.call(effects.children).forEach(function (node) {
        if (node.matches('.pos, .neg, .eff')) node.remove();
      });
      var positive = document.createElement('span');
      var negative = document.createElement('span');
      positive.className = 'pos';
      negative.className = 'neg';
      positive.textContent = item.positive;
      negative.textContent = item.negative;
      effects.prepend(negative);
      effects.prepend(positive);
      card.setAttribute('data-runtime-synced', '1');
      syncedNames.add(item.id);
    });
    window.__wikiSyncedItemCards = syncedNames.size;
  }
  function makeItemIcon(item, className) {
    var icon = document.createElement('span');
    var atlasIndex = Math.max(0, item.index - 1);
    icon.className = className || 'wiki-item-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.style.setProperty('--icon-col', String(atlasIndex % 8));
    icon.style.setProperty('--icon-row', String(Math.floor(atlasIndex / 8)));
    return icon;
  }
  function buildItemCatalog() {
    var itemRoot = document.getElementById('items');
    var archiveHeading = document.getElementById('wiki-item-archive');
    var lede = itemRoot && itemRoot.querySelector(':scope > .lede');
    if (!itemRoot || !archiveHeading || !lede) return;

    archiveHeading.hidden = true;
    var archiveNode = archiveHeading.nextElementSibling;
    while (archiveNode) {
      archiveNode.hidden = true;
      archiveNode = archiveNode.nextElementSibling;
    }

    var catalog = document.createElement('div');
    catalog.className = 'item-catalog';
    catalog.id = 'wiki-item-catalog';
    var heading = document.createElement('div');
    heading.className = 'stage-h item-catalog-heading';
    var title = document.createElement('h3');
    var count = document.createElement('span');
    title.textContent = report.items.length + '件 · 道具图鉴';
    count.className = 'cnt';
    count.textContent = report.items.length + ' 件 · 全部实装';
    heading.append(title, count);

    var tools = document.createElement('div');
    tools.className = 'item-catalog-tools';
    var searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = '搜索道具、记忆或效果';
    searchInput.setAttribute('aria-label', '搜索道具');
    var sourceSelect = document.createElement('select');
    sourceSelect.setAttribute('aria-label', '按来源筛选道具');
    addOption(sourceSelect, '');
    sourceSelect.options[0].textContent = '全部来源';
    Object.keys(report.sourceCounts).forEach(function (value) { addOption(sourceSelect, value); });
    var qualitySelect = document.createElement('select');
    qualitySelect.setAttribute('aria-label', '按品质筛选道具');
    addOption(qualitySelect, '');
    qualitySelect.options[0].textContent = '全部品质';
    [1, 2, 3, 4, 5].forEach(function (value) {
      var option = document.createElement('option');
      option.value = String(value);
      option.textContent = qualityMarks[value] + ' · ' + qualityNames[value];
      qualitySelect.appendChild(option);
    });
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'item-catalog-clear';
    clear.textContent = '×';
    clear.title = '清除筛选';
    clear.setAttribute('aria-label', '清除筛选');
    tools.append(searchInput, sourceSelect, qualitySelect, clear);

    var result = document.createElement('div');
    result.className = 'item-catalog-result';
    result.setAttribute('aria-live', 'polite');
    var catalogGrid = document.createElement('div');
    catalogGrid.className = 'item-catalog-grid';
    catalogGrid.id = 'wiki-item-catalog-grid';

    /* 物证墙：全部道具一眼可见 · 悬浮出词条 · 点击开合同 */
    var qualityLabels = ['', 'Ⅰ 杂物', 'Ⅱ 旧物', 'Ⅲ 心结', 'Ⅳ 遗物', 'Ⅴ 这一身'];
    var wallHead = document.createElement('div');
    wallHead.className = 'stage-h wall-head';
    var wallTitle = document.createElement('h3');
    wallTitle.textContent = '物证墙 · 一眼看完这一生';
    var wallChips = document.createElement('div');
    wallChips.className = 'wall-chips';
    [
      { label: '全部 ' + report.items.length, kind: 'all', value: '' },
      { label: 'Ⅰ 杂物', kind: 'quality', value: '1' },
      { label: 'Ⅱ 旧物', kind: 'quality', value: '2' },
      { label: 'Ⅲ 心结', kind: 'quality', value: '3' },
      { label: 'Ⅳ 遗物', kind: 'quality', value: '4' },
      { label: 'Ⅴ 这一身', kind: 'quality', value: '5' },
      { label: '回忆祭坛', kind: 'source', value: '回忆祭坛' },
      { label: '留灯间', kind: 'source', value: '留灯间' },
      { label: '里屋', kind: 'source', value: '里屋' },
    ].forEach(function (def) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'wall-chip' + (def.kind === 'quality' ? ' wq' + def.value : '') + (def.kind === 'source' ? ' ws-' + def.value : '');
      chip.dataset.kind = def.kind;
      chip.dataset.value = def.value;
      chip.textContent = def.label;
      chip.addEventListener('click', function () {
        if (def.kind === 'all') { qualitySelect.value = ''; sourceSelect.value = ''; }
        else if (def.kind === 'quality') qualitySelect.value = qualitySelect.value === def.value ? '' : def.value;
        else sourceSelect.value = sourceSelect.value === def.value ? '' : def.value;
        renderCatalog();
      });
      wallChips.appendChild(chip);
    });
    wallHead.append(wallTitle, wallChips);

    var wall = document.createElement('div');
    wall.className = 'wall';
    wall.id = 'wiki-item-wall';
    var wallTiles = {};
    var tip = document.getElementById('wiki-wall-tip');
    var tipRow = function (cls, mark, text) {
      var row = document.createElement('span');
      var b = document.createElement('b');
      b.className = cls;
      b.textContent = mark;
      row.append(b, document.createTextNode(text));
      return row;
    };
    function showTip(item, tile) {
      if (!tip) return;
      tip.className = 'wall-tip wtq' + item.quality;
      tip.replaceChildren();
      var top = document.createElement('div');
      top.className = 'wt-top';
      var well = document.createElement('span');
      well.className = 'wt-well';
      well.appendChild(makeItemIcon(item, 'archive-item-icon wt-icon'));
      var id = document.createElement('div');
      var no = document.createElement('span');
      no.className = 'wt-no';
      no.textContent = 'No.' + String(item.index).padStart(2, '0');
      var nm = document.createElement('b');
      nm.className = 'wt-nm';
      nm.textContent = item.name;
      var badges = document.createElement('div');
      badges.className = 'wt-badges';
      var q = document.createElement('span');
      q.className = 'wt-q q' + item.quality;
      q.textContent = qualityLabels[item.quality];
      for (var d = 0; d < item.quality; d++) q.appendChild(document.createElement('i'));
      var room = document.createElement('span');
      room.className = 'wt-room';
      room.dataset.room = item.source;
      room.textContent = item.source;
      badges.append(q, room);
      id.append(no, nm, badges);
      top.append(well, id);
      var fl = document.createElement('p');
      fl.className = 'wt-fl';
      fl.textContent = '“' + item.flavor + '”';
      var fx = document.createElement('div');
      fx.className = 'wt-fx';
      fx.append(
        tipRow('b-pos', '得到', item.positive),
        tipRow('b-neg', '留下', item.negative),
        tipRow('b-sum', '一句话', item.summary)
      );
      var foot = document.createElement('div');
      foot.className = 'wt-foot';
      var footL = document.createElement('span');
      footL.textContent = '物证 ' + String(item.index).padStart(2, '0') + ' / ' + report.items.length;
      var footR = document.createElement('span');
      footR.textContent = '点击 · 展开生产合同';
      foot.append(footL, footR);
      tip.append(top, fl, fx, foot);
      tip.hidden = false;
      var rect = tile.getBoundingClientRect();
      var w = tip.offsetWidth;
      var h = tip.offsetHeight;
      var left = Math.min(Math.max(rect.left + rect.width / 2 - w / 2, 8), window.innerWidth - w - 8);
      var topPos = rect.bottom + 10;
      if (topPos + h > window.innerHeight - 8) topPos = rect.top - h - 10;
      tip.style.left = left + 'px';
      tip.style.top = Math.max(8, topPos) + 'px';
    }
    function hideTip() {
      if (tip) tip.hidden = true;
    }
    window.addEventListener('scroll', hideTip, { passive: true });
    report.items.slice().sort(function (a, b) { return a.index - b.index; }).forEach(function (item) {
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'wall-tile q' + item.quality;
      tile.dataset.itemId = item.id;
      tile.setAttribute('aria-label', item.name + ' · 查看详情');
      tile.appendChild(makeItemIcon(item, 'wall-item-icon'));
      tile.addEventListener('click', function () {
        hideTip();
        if (typeof window.__wikiOpenRelic === 'function') window.__wikiOpenRelic(item.id, tile);
      });
      tile.addEventListener('mouseenter', function () { showTip(item, tile); });
      tile.addEventListener('mouseleave', hideTip);
      tile.addEventListener('focus', function () { showTip(item, tile); });
      tile.addEventListener('blur', hideTip);
      wallTiles[item.id] = tile;
      wall.appendChild(tile);
    });
    function syncWall(filtered) {
      var visible = {};
      filtered.forEach(function (item) { visible[item.id] = true; });
      Object.keys(wallTiles).forEach(function (id) {
        wallTiles[id].classList.toggle('dim', !visible[id]);
      });
      Array.prototype.forEach.call(wallChips.children, function (chip) {
        var kind = chip.dataset.kind;
        chip.classList.toggle('on',
          kind === 'all' ? (!qualitySelect.value && !sourceSelect.value)
            : kind === 'quality' ? qualitySelect.value === chip.dataset.value
              : sourceSelect.value === chip.dataset.value);
      });
    }

    function makeCatalogCard(item) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'item-catalog-card';
      card.dataset.itemId = item.id;
      card.dataset.quality = String(item.quality);
      card.setAttribute('aria-label', item.name + ' · 查看详情');
      var visual = document.createElement('span');
      visual.className = 'item-catalog-visual';
      visual.appendChild(makeItemIcon(item, 'wiki-item-icon item-catalog-icon'));
      var index = document.createElement('span');
      index.className = 'item-catalog-index';
      index.textContent = String(item.index).padStart(2, '0');
      visual.appendChild(index);
      var name = document.createElement('strong');
      name.className = 'item-catalog-name';
      name.textContent = item.name;
      var meta = document.createElement('span');
      meta.className = 'item-catalog-meta q' + item.quality;
      meta.textContent = qualityMarks[item.quality] + ' ' + qualityNames[item.quality] + ' · ' + item.source;
      var flavor = document.createElement('span');
      flavor.className = 'item-catalog-flavor';
      flavor.textContent = item.flavor;
      var itemSummary = document.createElement('span');
      itemSummary.className = 'item-catalog-summary';
      itemSummary.textContent = item.summary;
      card.append(visual, name, meta, flavor, itemSummary);
      card.addEventListener('click', function () {
        if (typeof window.__wikiOpenRelic === 'function') window.__wikiOpenRelic(item.id, card);
      });
      return card;
    }
    function renderCatalog() {
      var query = normalize(searchInput.value);
      var filtered = report.items.filter(function (item) {
        var haystack = normalize([
          item.id, item.name, item.flavor, item.summary, item.positive, item.negative,
          item.source, item.contract.hero, item.contract.projectile, item.contract.feedback,
        ].join(' '));
        return (!query || haystack.includes(query))
          && (!sourceSelect.value || item.source === sourceSelect.value)
          && (!qualitySelect.value || item.quality === Number(qualitySelect.value));
      });
      catalogGrid.replaceChildren();
      filtered.forEach(function (item) { catalogGrid.appendChild(makeCatalogCard(item)); });
      if (!filtered.length) {
        var empty = document.createElement('p');
        empty.className = 'item-catalog-empty';
        empty.textContent = '没有符合条件的道具。';
        catalogGrid.appendChild(empty);
      }
      result.textContent = '显示 ' + filtered.length + ' / ' + report.items.length + ' 件';
      window.__wikiItemCatalogCount = filtered.length;
      syncWall(filtered);
    }
    [searchInput, sourceSelect, qualitySelect].forEach(function (control) {
      control.addEventListener(control === searchInput ? 'input' : 'change', renderCatalog);
    });
    clear.addEventListener('click', function () {
      searchInput.value = '';
      sourceSelect.value = '';
      qualitySelect.value = '';
      renderCatalog();
      searchInput.focus();
    });
    catalog.append(heading, wallHead, wall, tools, result, catalogGrid);
    lede.insertAdjacentElement('afterend', catalog);
    renderCatalog();
  }
  function tag(text) {
    var node = document.createElement('span');
    node.className = 'mechanic-tag';
    node.textContent = text;
    return node;
  }
  function effect(label, text) {
    var node = document.createElement('div');
    var key = document.createElement('b');
    key.textContent = label;
    node.append(key, document.createTextNode(text));
    return node;
  }
  function makeCard(item) {
    var card = document.createElement('article');
    card.className = 'mechanic-card';
    card.dataset.priority = item.priority;
    var head = document.createElement('div');
    head.className = 'mechanic-card-head';
    var titleWrap = document.createElement('div');
    var title = document.createElement('h4');
    var meta = document.createElement('div');
    meta.className = 'mechanic-meta';
    title.textContent = String(item.index).padStart(2, '0') + ' · ' + item.name;
    meta.append(tag(item.source), tag(qualityMarks[item.quality] + ' · ' + qualityNames[item.quality]));
    item.roles.forEach(function (value) { meta.append(tag(value)); });
    titleWrap.append(title, meta);
    var status = document.createElement('span');
    status.className = 'mechanic-status';
    status.textContent = item.runtime.reviewed ? '专项验证' : item.runtime.status;
    head.append(titleWrap, status);
    var summaryText = document.createElement('div');
    summaryText.className = 'mechanic-summary';
    summaryText.textContent = item.summary;
    var effects = document.createElement('div');
    effects.className = 'mechanic-effects';
    effects.append(effect('正', item.positive), effect('负', item.negative));
    var proof = document.createElement('div');
    proof.className = 'mechanic-proof';
    proof.textContent = item.priority + ' · game.ts ' + item.runtime.refs + ' 处 · 美术消费端 '
      + item.runtime.artConsumers.length + ' 个'
      + (item.runtime.reviewed ? ' · 专项机制门禁' : '')
      + (item.runtime.projectile ? ' · 弹体审查已登记' : '');
    var details = document.createElement('details');
    var detailsTitle = document.createElement('summary');
    var contract = document.createElement('dl');
    detailsTitle.textContent = '展开生产合同';
    contract.className = 'mechanic-contract';
    contractFields.forEach(function (field) {
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      dt.textContent = field[1];
      dd.textContent = item.contract[field[0]];
      contract.append(dt, dd);
    });
    details.append(detailsTitle, contract);
    card.append(head, summaryText, effects, proof, details);
    return card;
  }
  function render() {
    var query = normalize(search.value);
    var filtered = report.items.filter(function (item) {
      var haystack = normalize([
        item.id, item.name, item.flavor, item.summary, item.positive, item.negative,
        item.source, item.roles.join(' '), item.production.join(' '),
        Object.values(item.contract).join(' '),
      ].join(' '));
      return (!query || haystack.includes(query))
        && (!source.value || item.source === source.value)
        && (!role.value || item.roles.includes(role.value))
        && (!layer.value || item.production.includes(layer.value))
        && (!priority.value || item.priority === priority.value);
    });
    function searchRank(item) {
      if (!query) return 0;
      var name = normalize(item.name);
      var id = normalize(item.id);
      if (name === query || id === query) return 0;
      if (name.startsWith(query) || id.startsWith(query)) return 1;
      if (name.includes(query) || id.includes(query)) return 2;
      return 3;
    }
    filtered.sort(function (a, b) {
      return searchRank(a) - searchRank(b)
        || a.priority.localeCompare(b.priority)
        || b.quality - a.quality
        || a.index - b.index;
    });
    grid.replaceChildren();
    filtered.forEach(function (item) { grid.appendChild(makeCard(item)); });
    if (!filtered.length) {
      var empty = document.createElement('p');
      empty.className = 'mechanic-empty';
      empty.textContent = '没有符合条件的道具。';
      grid.appendChild(empty);
    }
    resultLine.textContent = '显示 ' + filtered.length + ' / ' + report.items.length + ' 件 · 排序 P0 → P3，再按品质与编号';
  }
  [search, source, role, layer, priority].forEach(function (control) {
    control.addEventListener(control === search ? 'input' : 'change', render);
  });
  reset.addEventListener('click', function () {
    search.value = '';
    source.value = '';
    role.value = '';
    layer.value = '';
    priority.value = '';
    render();
    search.focus();
  });
  /* ⌘K 由 wiki-shell-v1.js 的全站快搜接管 */
  syncArchiveCards();
  buildItemCatalog();
  render();
})();

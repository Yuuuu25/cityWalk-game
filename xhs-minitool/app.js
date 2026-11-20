(function () {
  'use strict';

  var STORE_KEY = 'citywalk.draw.v1';

  /* 通关页引流文案：把小程序名称改成你自己的即可 */
  var PROMO_TEXT = '微信搜索小程序「四季散步任务卡」，解锁完整任务库';

  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  var THEME_COLOR = { spring: '#fffafd', summer: '#f9fffb', autumn: '#fffcf4', winter: '#f9fcff' };

  /* 当前日期所在季节：3-5 春，6-8 夏，9-11 秋，12-2 冬 */
  function currentSeason() {
    var m = new Date().getMonth() + 1;
    if (m >= 3 && m <= 5) return 'spring';
    if (m >= 6 && m <= 8) return 'summer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'winter';
  }

  var DEFAULT_TASKS = [
    ['晒太阳的人', '找到一个正在晒太阳的人并给它拍照'],
    ['收集落叶', '收集三片不同的落叶'],
    ['搭话老板', '和一位店老板聊满三句话'],
    ['对称构图', '拍一张"对称"构图的照片'],
    ['老招牌', '找到一块有年头的老招牌'],
    ['方言一句', '用方言和店家说一句话'],
    ['抱一棵树', '找到一棵大树，抱一下'],
    ['颜色猎手', '定一个颜色（比如绿色），拍五张这个颜色为主题的照片'],
    ['最老与最新', '各自拍一张自认为“这条街上最老的东西”和“最新的东西”，互相讲解为什么选它，由对方打分'],
    ['双人剪影', '找一个有光影的墙面或地面，两人合作拍一张双人影子/剪影合照，姿势不能重复。'],
    ['指定方向', '在下一个路口必须向左转。'],
    ['分享任意事', '和好朋友分享一件你想和她分享的事情'],
    ['尽情吐槽', '向好朋友敬请吐槽一件事'],
    ['歇一歇', '找一个地方坐下来歇一歇吧'],
    ['后会友期', '大聊特聊后会友期观后感哈哈哈哈哈（等这个很久了吧！！！）'],
  ];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function uid() {
    return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function shortTitle(text) {
    var t = String(text).replace(/\s+/g, '');
    return t.length > 6 ? t.slice(0, 6) : t;
  }

  function makeDefaultCards() {
    return DEFAULT_TASKS.map(function (p) {
      return { id: uid(), title: p[0], text: p[1] };
    });
  }

  var storageOK = true;
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        cards: state.cards,
        settings: state.settings,
        remaining: state.remaining,
        history: state.history
      }));
    } catch (e) {
      storageOK = false;
    }
  }

  function load() {
    var fallback = {
      cards: makeDefaultCards(),
      settings: { count: 1, noRepeat: true, season: 'autumn' },
      remaining: [],
      history: []
    };
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) throw new Error('empty');
      var d = JSON.parse(raw);
      var cards = Array.isArray(d.cards) ? d.cards.filter(function (c) {
        return c && typeof c.text === 'string';
      }).map(function (c) {
        return {
          id: c.id || uid(),
          title: (typeof c.title === 'string' && c.title.trim()) ? c.title.trim() : shortTitle(c.text),
          text: c.text
        };
      }) : fallback.cards;
      var settings = {
        count: Math.min(8, Math.max(1, parseInt(d.settings && d.settings.count, 10) || 1)),
        noRepeat: !(d.settings && d.settings.noRepeat === false),
        season: currentSeason()
      };
      var remaining = Array.isArray(d.remaining) ? d.remaining : null;
      var history = Array.isArray(d.history) ? d.history.filter(function (h) {
        return h && typeof h.text === 'string';
      }).map(function (h) {
        return {
          id: h.id || '',
          title: (typeof h.title === 'string' && h.title.trim()) ? h.title.trim() : shortTitle(h.text),
          text: h.text,
          at: h.at || Date.now(),
          done: !!h.done
        };
      }) : [];
      return {
        cards: cards,
        settings: settings,
        remaining: remaining === null ? cards.map(function (c) { return c.id; }) : remaining,
        history: history
      };
    } catch (e) {
      return fallback;
    }
  }

  var state = load();
  var currentCards = [];
  var pending = [];        /* 已翻开但还没完成的卡（按顺序处理） */
  var modalOpen = false;
  var drawing = false;     /* 洗牌动画进行中 */
  var drawTimer = null;

  function cardOf(id) {
    for (var i = 0; i < state.cards.length; i++) {
      if (state.cards[i].id === id) return state.cards[i];
    }
    return null;
  }

  function validRemaining() {
    var ids = state.cards.map(function (c) { return c.id; });
    return state.remaining.filter(function (id) { return ids.indexOf(id) !== -1; });
  }

  /* ---------- 提示 ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1900);
  }

  /* ---------- 任务弹框 / 抽卡锁 ---------- */
  function showModal() {
    var c = pending[0];
    if (!c) return;
    $('#modalTitle').textContent = c.title;
    $('#modalText').textContent = c.text;
    $('#modalMask').classList.add('show');
    modalOpen = true;
  }

  function closeModal() {
    $('#modalMask').classList.remove('show');
    modalOpen = false;
  }

  function updateDrawLock() {
    var btn = $('#btnDraw');
    if (drawing) {
      btn.classList.add('is-locked');
      btn.textContent = '抽卡中…';
      return;
    }
    if (pending.length) {
      btn.classList.add('is-locked');
      btn.textContent = '先完成当前任务';
      return;
    }
    var unflipped = currentCards.some(function (c) { return !c.flipped; });
    if (unflipped) {
      btn.classList.add('is-locked');
      btn.textContent = '先翻开卡面';
      return;
    }
    btn.classList.remove('is-locked');
    btn.textContent = state.settings.count > 1
      ? '抽 ' + state.settings.count + ' 张'
      : '抽 一 张';
  }

  function enqueuePending(card) {
    if (!card || pending.indexOf(card) !== -1 || card.record.done) return;
    pending.push(card);
    updateDrawLock();
    if (!modalOpen) {
      modalOpen = true;               /* 先占位，避免多张卡同时弹 */
      setTimeout(function () {
        if (!modalOpen) return;
        modalOpen = false;
        showModal();
      }, 520);
    }
  }

  function completePending() {
    var c = pending[0];
    if (!c) { closeModal(); return; }
    c.record.done = true;
    pending.shift();
    save();
    renderHistory();
    updateDrawLock();
    if (pending.length) {
      showModal();
    } else {
      closeModal();
      var finished = c;
      setTimeout(function () { showDone(finished); }, 200);
      if (navigator.vibrate) navigator.vibrate([12, 50, 12]);
    }
  }

  /* ---------- 通关页 ---------- */
  function showDone(card) {
    var today = new Date().toDateString();
    var doneAll = state.history.filter(function (h) { return h.done; });
    var doneToday = doneAll.filter(function (h) {
      return new Date(h.at).toDateString() === today;
    });
    $('#doneTask').textContent = card ? card.title : '';
    $('#doneStat').textContent = '今天完成 ' + doneToday.length + ' 张 · 累计 ' + doneAll.length + ' 张';
    $('#promoText').textContent = PROMO_TEXT;
    $('#doneMask').classList.add('show');
  }

  function closeDone() {
    $('#doneMask').classList.remove('show');
  }

  function clearPending() {
    pending = [];
    closeModal();
    updateDrawLock();
  }

  /* 在记录页勾选/删除时，同步解除抽卡锁 */
  function syncPending() {
    pending = pending.filter(function (p) { return !p.record.done; });
    updateDrawLock();
    if (!pending.length) {
      if (modalOpen) closeModal();
    } else if (modalOpen) {
      showModal();
    }
  }

  /* ---------- 抽卡 ---------- */
  function draw() {
    if (drawing) return;
    if (pending.length) {
      if (!modalOpen) showModal();
      toast('先完成当前任务再抽下一张');
      return;
    }
    if (currentCards.some(function (c) { return !c.flipped; })) {
      toast('先翻开卡面，看看抽到什么任务');
      return;
    }
    var n = state.settings.count;
    var noRepeat = state.settings.noRepeat;
    var pool;

    if (noRepeat) {
      state.remaining = validRemaining();
      pool = state.remaining.slice();
      if (pool.length === 0) {
        if (state.cards.length === 0) { toast('卡池是空的，先去「卡池」添加任务'); return; }
        state.remaining = state.cards.map(function (c) { return c.id; });
        pool = state.remaining.slice();
        toast('本轮已抽完，重新洗牌');
      }
    } else {
      pool = state.cards.map(function (c) { return c.id; });
      if (pool.length === 0) { toast('卡池是空的，先去「卡池」添加任务'); return; }
    }

    /* 先播洗牌动画，制造悬念，再揭晓 */
    drawing = true;
    updateDrawLock();
    renderShuffle();
    if (navigator.vibrate) navigator.vibrate([14, 60, 14]);

    drawTimer = setTimeout(function () {
      drawTimer = null;
      reveal(n, pool, noRepeat);
    }, 1050);
  }

  function renderShuffle() {
    var stage = $('#stage');
    stage.classList.remove('single');
    stage.classList.add('shuffling');
    $('#btnFlipAll').style.display = 'none';
    stage.innerHTML =
      '<div class="shuffle-wrap">' +
        '<div class="shuffle-deck">' +
          '<div class="sc s1"></div>' +
          '<div class="sc s2"></div>' +
          '<div class="sc s3"></div>' +
          '<div class="sc s4"><div class="back-title">任务卡</div></div>' +
        '</div>' +
        '<div class="shuffle-tip">正在洗牌<span class="dots"><i></i><i></i><i></i></span></div>' +
      '</div>';
  }

  function reveal(n, pool, noRepeat) {
    var take = Math.min(n, pool.length);
    var picks = [];
    var bag = pool.slice();
    for (var i = 0; i < take; i++) {
      var k = Math.floor(Math.random() * bag.length);
      picks.push(bag.splice(k, 1)[0]);
    }

    if (noRepeat) {
      state.remaining = state.remaining.filter(function (id) { return picks.indexOf(id) === -1; });
    }

    var now = Date.now();
    var records = picks.map(function (id) {
      var c = cardOf(id);
      return { id: id, title: c.title, text: c.text, at: now, done: false };
    });
    records.forEach(function (r) { state.history.unshift(r); });
    if (state.history.length > 200) state.history.length = 200;

    currentCards = records.map(function (r) {
      return { id: r.id, title: r.title, text: r.text, flipped: false, record: r };
    });

    drawing = false;
    $('#stage').classList.remove('shuffling');
    save();
    renderStage();
    renderHistory();
    renderStats();
    if (navigator.vibrate) navigator.vibrate(26);
  }

  function abortDraw() {
    if (drawTimer) { clearTimeout(drawTimer); drawTimer = null; }
    drawing = false;
    $('#stage').classList.remove('shuffling');
  }

  function renderStage() {
    var stage = $('#stage');
    stage.innerHTML = '';
    stage.classList.toggle('single', currentCards.length <= 1);

    if (currentCards.length === 0) {
      var ph = document.createElement('div');
      ph.className = 'placeholder';
      ph.innerHTML = '<div class="shuffle-deck is-static">' +
        '<div class="sc s1"></div>' +
        '<div class="sc s2"></div>' +
        '<div class="sc s3"></div>' +
        '<div class="sc s4"><div class="back-title">任务卡</div></div>' +
        '</div>点击下方按钮，抽一张任务卡<br>抽到后点击卡面翻开';
      stage.appendChild(ph);
      updateFlipBtn();
      return;
    }

    currentCards.forEach(function (c, i) {
      var el = document.createElement('div');
      el.className = 'card' + (c.flipped ? ' flipped' : '');
      el.style.animationDelay = (i * 70) + 'ms';
      el.innerHTML =
        '<div class="card-inner">' +
          '<div class="card-face card-back">' +
            '<div class="back-title">任务卡</div>' +
          '</div>' +
          '<div class="card-face card-front">' +
            '<span class="card-no">No.' + String(i + 1).padStart(2, '0') + '</span>' +
            '<p class="card-title">' + esc(c.title) + '</p>' +
            '<p class="card-text">' + esc(c.text) + '</p>' +
            '<span class="card-mark">TASK</span>' +
          '</div>' +
        '</div>';

      el.addEventListener('click', function () {
        if (c.flipped) return;
        c.flipped = true;
        el.classList.add('flipped');
        if (navigator.vibrate) navigator.vibrate(12);
        updateFlipBtn();
        enqueuePending(c);
      });

      stage.appendChild(el);
    });

    updateFlipBtn();
  }

  function updateFlipBtn() {
    var btn = $('#btnFlipAll');
    var hasUnflipped = currentCards.some(function (c) { return !c.flipped; });
    btn.style.display = hasUnflipped ? 'block' : 'none';
  }

  function flipAll() {
    var toQueue = currentCards.filter(function (c) { return !c.flipped; });
    currentCards.forEach(function (c) { c.flipped = true; });
    $$('#stage .card').forEach(function (el) { el.classList.add('flipped'); });
    updateFlipBtn();
    if (navigator.vibrate) navigator.vibrate([10, 40, 10]);
    toQueue.forEach(function (c) { enqueuePending(c); });
  }

  function resetRound() {
    if (!confirm('重新开始本轮？将清空本轮抽卡记录和未完成任务。')) return;
    state.remaining = state.cards.map(function (c) { return c.id; });
    state.history = [];
    currentCards = [];
    abortDraw();
    clearPending();
    save();
    renderStage();
    renderStats();
    renderHistory();
    toast('本轮已重置');
  }

  /* ---------- 状态 / 设置 ---------- */
  function renderStats() {
    var remain = state.settings.noRepeat ? validRemaining().length : state.cards.length;
    $('#statRemain').textContent = remain;
    $('#statDrawn').textContent = state.cards.length - remain;
    $('#headBadge').textContent = '卡池 ' + state.cards.length + ' 张';
    updateDrawLock();
  }

  function renderSettings() {
    var seg = $('#countSeg');
    seg.innerHTML = '';
    for (var i = 1; i <= 5; i++) {
      (function (num) {
        var b = document.createElement('button');
        b.textContent = num;
        b.className = state.settings.count === num ? 'on' : '';
        b.addEventListener('click', function () {
          state.settings.count = num;
          save();
          renderSettings();
          renderStats();
        });
        seg.appendChild(b);
      })(i);
    }
    $('#switchRepeat').classList.toggle('on', state.settings.noRepeat);
  }

  /* ---------- 季节主题 ---------- */
  function applySeason(s, persist) {
    if (SEASONS.indexOf(s) === -1) s = 'autumn';
    document.documentElement.setAttribute('data-season', s);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && THEME_COLOR[s]) meta.setAttribute('content', THEME_COLOR[s]);
    $$('.season').forEach(function (b) {
      var on = b.dataset.s === s;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    state.settings.season = s;
    if (persist) save();
  }

  /* ---------- 卡池 ---------- */
  function renderPool() {
    $('#poolCount').textContent = state.cards.length;
    var list = $('#poolList');
    list.innerHTML = '';

    if (state.cards.length === 0) {
      list.innerHTML = '<div class="empty">卡池是空的，先添加几条任务吧</div>';
      return;
    }

    state.cards.forEach(function (c, i) {
      var row = document.createElement('div');
      row.className = 'pool-item';
      row.innerHTML =
        '<span class="pool-idx">' + (i + 1) + '</span>' +
        '<div class="pool-body">' +
          '<p class="pool-title"></p>' +
          '<p class="pool-text"></p>' +
        '</div>' +
        '<button class="del" title="删除">×</button>';
      row.querySelector('.pool-title').textContent = c.title;
      row.querySelector('.pool-text').textContent = c.text;
      row.querySelector('.del').addEventListener('click', function () {
        state.cards = state.cards.filter(function (x) { return x.id !== c.id; });
        state.remaining = state.remaining.filter(function (id) { return id !== c.id; });
        save();
        renderPool();
        renderStats();
        renderHistory();
      });
      list.appendChild(row);
    });
  }

  function addOne() {
    var titleInput = $('#inputTitle');
    var textInput = $('#inputText');
    var title = titleInput.value.trim();
    var text = textInput.value.trim();
    if (!text) { toast('请输入任务内容'); textInput.focus(); return; }
    if (!title) title = shortTitle(text);
    var card = { id: uid(), title: title.slice(0, 12), text: text };
    state.cards.push(card);
    state.remaining.push(card.id);
    titleInput.value = '';
    textInput.value = '';
    save();
    renderPool();
    renderStats();
    toast('已添加');
  }

  function importBatch() {
    var ta = $('#inputBatch');
    var lines = ta.value.split('\n').map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
    if (lines.length === 0) { toast('没有可导入的内容'); return; }
    var added = 0;
    lines.forEach(function (line) {
      var parts = line.split('|');
      var title = '';
      var text = line;
      if (parts.length > 1) {
        title = parts[0].trim();
        text = parts.slice(1).join('|').trim();
      }
      if (!text) return;
      if (!title) title = shortTitle(text);
      var card = { id: uid(), title: title.slice(0, 12), text: text.slice(0, 60) };
      state.cards.push(card);
      state.remaining.push(card.id);
      added++;
    });
    ta.value = '';
    save();
    renderPool();
    renderStats();
    toast('已导入 ' + added + ' 张');
  }

  function restoreDefault() {
    if (!confirm('恢复默认会覆盖当前卡池，确定吗？')) return;
    state.cards = makeDefaultCards();
    state.remaining = state.cards.map(function (c) { return c.id; });
    currentCards = [];
    abortDraw();
    clearPending();
    save();
    renderPool();
    renderStage();
    renderStats();
    toast('已恢复默认卡池');
  }

  function clearPool() {
    if (!confirm('确定清空整个卡池吗？')) return;
    state.cards = [];
    state.remaining = [];
    currentCards = [];
    abortDraw();
    clearPending();
    save();
    renderPool();
    renderStage();
    renderStats();
    toast('卡池已清空');
  }

  /* ---------- 记录 ---------- */
  function fmtTime(ts) {
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function renderHistory() {
    var doneCount = state.history.filter(function (h) { return h.done; }).length;
    $('#hTotal').textContent = state.history.length;
    $('#hDone').textContent = doneCount;

    var list = $('#historyList');
    list.innerHTML = '';

    if (state.history.length === 0) {
      list.innerHTML = '<div class="empty">还没有抽卡记录</div>';
      return;
    }

    state.history.forEach(function (h, idx) {
      var row = document.createElement('div');
      row.className = 'h-item' + (h.done ? ' done' : '');
      row.innerHTML =
        '<div class="h-dot"></div>' +
        '<div class="h-body">' +
          '<p class="h-title"></p>' +
          '<p class="h-text"></p>' +
          '<span class="h-time">' + fmtTime(h.at) + '</span>' +
        '</div>' +
        '<button class="del" title="删除">×</button>';
      row.querySelector('.h-title').textContent = h.title;
      row.querySelector('.h-text').textContent = h.text;

      row.addEventListener('click', function (e) {
        if (e.target.classList.contains('del')) return;
        h.done = !h.done;
        row.classList.toggle('done', h.done);
        save();
        renderHistory();
        syncPending();
      });

      row.querySelector('.del').addEventListener('click', function () {
        state.history.splice(idx, 1);
        pending = pending.filter(function (p) { return p.record !== h; });
        save();
        renderHistory();
        syncPending();
      });

      list.appendChild(row);
    });
  }

  function clearHistory() {
    if (!confirm('确定清空所有抽卡记录吗？')) return;
    state.history = [];
    save();
    renderHistory();
    toast('记录已清空');
  }

  /* ---------- 页签 ---------- */
  function switchView(name) {
    $$('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.view === name);
    });
    $$('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 绑定 ---------- */
  $$('.tab').forEach(function (t) {
    t.addEventListener('click', function () { switchView(t.dataset.view); });
  });

  /* 主题图标：点击展开季节选择，一段时间后自动收起 */
  var seasonDock = $('#seasonDock');
  var seasonFab = $('#seasonFab');
  var seasonHideTimer = null;

  function closeSeasonDock() {
    seasonDock.classList.remove('open');
    seasonFab.setAttribute('aria-expanded', 'false');
    clearTimeout(seasonHideTimer);
    seasonHideTimer = null;
  }
  function scheduleSeasonHide() {
    clearTimeout(seasonHideTimer);
    seasonHideTimer = setTimeout(closeSeasonDock, 4500);
  }

  $$('.season').forEach(function (b) {
    b.addEventListener('click', function () {
      applySeason(b.dataset.s, false);
      scheduleSeasonHide();
    });
  });

  seasonFab.addEventListener('click', function (e) {
    e.stopPropagation();
    if (seasonDock.classList.contains('open')) { closeSeasonDock(); return; }
    seasonDock.classList.add('open');
    seasonFab.setAttribute('aria-expanded', 'true');
    scheduleSeasonHide();
  });
  seasonDock.addEventListener('click', function (e) { e.stopPropagation(); });
  seasonDock.addEventListener('mouseenter', function () {
    if (seasonDock.classList.contains('open')) clearTimeout(seasonHideTimer);
  });
  seasonDock.addEventListener('mouseleave', function () {
    if (seasonDock.classList.contains('open')) scheduleSeasonHide();
  });
  document.addEventListener('click', function () {
    if (seasonDock.classList.contains('open')) closeSeasonDock();
  });

  $('#btnDraw').addEventListener('click', draw);
  $('#btnFlipAll').addEventListener('click', flipAll);
  $('#btnResetRound').addEventListener('click', resetRound);

  $('#modalDone').addEventListener('click', completePending);
  $('#modalLater').addEventListener('click', closeModal);
  $('#modalMask').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });

  $('#doneNext').addEventListener('click', function () {
    closeDone();
    draw();
  });
  $('#doneClose').addEventListener('click', closeDone);
  $('#doneMask').addEventListener('click', function (e) {
    if (e.target === this) closeDone();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if ($('#doneMask').classList.contains('show')) { closeDone(); return; }
    if (modalOpen) closeModal();
  });

  $('#switchRepeat').addEventListener('click', function () {
    state.settings.noRepeat = !state.settings.noRepeat;
    if (state.settings.noRepeat) state.remaining = validRemaining();
    save();
    renderSettings();
    renderStats();
  });

  $('#btnAddOne').addEventListener('click', addOne);
  $('#inputText').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addOne();
  });
  $('#btnImport').addEventListener('click', importBatch);
  $('#btnRestore').addEventListener('click', restoreDefault);
  $('#btnClearPool').addEventListener('click', clearPool);
  $('#btnClearHistory').addEventListener('click', clearHistory);

  /* ---------- 启动 ---------- */
  applySeason(state.settings.season, false);
  state.remaining = validRemaining();
  renderSettings();
  renderStats();
  renderStage();
  renderPool();
  renderHistory();
  save();

  if (!storageOK) {
    setTimeout(function () { toast('浏览器禁用了本地存储，本次数据不会保存'); }, 800);
  }
})();

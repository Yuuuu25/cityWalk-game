const STORE_KEY = 'citywalk.draw.v1';
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const THEME_COLOR = { spring: '#fffafd', summer: '#f9fffb', autumn: '#fffcf4', winter: '#f9fcff' };
const BG_SRC = {
  spring: '/assets/spring.jpg',
  summer: '/assets/summer.jpg',
  autumn: '/assets/autumn.jpg',
  winter: '/assets/winter.jpg'
};

const DEFAULT_TASKS = [
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
  ['后会友期', '大聊特聊后会友期观后感哈哈哈哈哈（等这个很久了吧！！！）']
];

function currentSeason() {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

function uid() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function shortTitle(text) {
  const t = String(text).replace(/\s+/g, '');
  return t.length > 6 ? t.slice(0, 6) : t;
}

function makeDefaultCards() {
  return DEFAULT_TASKS.map(function (p) {
    return { id: uid(), title: p[0], text: p[1] };
  });
}

function fmtTime(ts) {
  const d = new Date(ts);
  const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function vibrate() {
  try {
    wx.vibrateShort({ type: 'light', fail: function () {} });
  } catch (e) {}
}

function loadState() {
  const fallback = {
    cards: makeDefaultCards(),
    settings: { count: 1, noRepeat: true, season: currentSeason() },
    remaining: [],
    history: []
  };

  let raw;
  try {
    raw = wx.getStorageSync(STORE_KEY);
  } catch (e) {
    return { state: fallback, readOK: false };
  }

  if (!raw || typeof raw !== 'object') {
    return { state: fallback, readOK: true };
  }

  try {
    const cards = Array.isArray(raw.cards) ? raw.cards.filter(function (c) {
      return c && typeof c.text === 'string';
    }).map(function (c) {
      return {
        id: c.id || uid(),
        title: (typeof c.title === 'string' && c.title.trim()) ? c.title.trim() : shortTitle(c.text),
        text: c.text
      };
    }) : fallback.cards;

    const settings = {
      count: Math.min(8, Math.max(1, parseInt(raw.settings && raw.settings.count, 10) || 1)),
      noRepeat: !(raw.settings && raw.settings.noRepeat === false),
      season: currentSeason()
    };

    const remaining = Array.isArray(raw.remaining) ? raw.remaining : null;

    const history = Array.isArray(raw.history) ? raw.history.filter(function (h) {
      return h && typeof h.text === 'string';
    }).map(function (h) {
      return {
        key: h.key || uid(),
        id: h.id || '',
        title: (typeof h.title === 'string' && h.title.trim()) ? h.title.trim() : shortTitle(h.text),
        text: h.text,
        at: h.at || Date.now(),
        done: !!h.done
      };
    }) : [];

    return {
      state: {
        cards: cards,
        settings: settings,
        remaining: remaining === null ? cards.map(function (c) { return c.id; }) : remaining,
        history: history
      },
      readOK: true
    };
  } catch (e) {
    return { state: fallback, readOK: true };
  }
}

Page({
  data: {
    statusBarHeight: 20,
    navTop: 60,
    season: 'autumn',
    bgSrc: BG_SRC.autumn,
    view: 'draw',
    poolCount: 0,
    statRemain: 0,
    statDrawn: 0,
    stageMode: 'placeholder',
    currentCards: [],
    showFlipAll: false,
    drawLocked: false,
    drawBtnText: '抽 一 张',
    countOptions: [1, 2, 3, 4, 5],
    count: 1,
    noRepeat: true,
    pool: [],
    history: [],
    hTotal: 0,
    hDone: 0,
    modalOpen: false,
    modalTitle: '',
    modalText: '',
    toastShow: false,
    toastText: '',
    dockOpen: false,
    inputTitle: '',
    inputText: '',
    inputBatch: ''
  },

  onLoad() {
    const loaded = loadState();

    this.state = loaded.state;
    this.storageOK = loaded.readOK;
    this.currentCards = [];
    this.pending = [];
    this.modalVisible = false;
    this.drawing = false;
    this.drawTimer = null;
    this.modalTimer = null;
    this.toastTimer = null;
    this.dockTimer = null;

    let statusBarHeight = 20;
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      statusBarHeight = info.statusBarHeight || 20;
    } catch (e) {}

    this.setData({
      statusBarHeight: statusBarHeight,
      navTop: statusBarHeight + 40
    });

    this.state.remaining = this.validRemaining();
    this.applySeason(this.state.settings.season);
    this.refresh();
    this.syncStage();
    this.save();

    if (!this.storageOK) {
      setTimeout(() => this.toast('本地存储不可用，本次数据不会保存'), 800);
    }
  },

  onHide() {
    this.abortDraw();
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    if (this.dockTimer) {
      clearTimeout(this.dockTimer);
      this.dockTimer = null;
    }
    if (this.modalTimer) {
      clearTimeout(this.modalTimer);
      this.modalTimer = null;
    }
  },

  onUnload() {
    if (this.drawTimer) {
      clearTimeout(this.drawTimer);
      this.drawTimer = null;
    }
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    if (this.dockTimer) {
      clearTimeout(this.dockTimer);
      this.dockTimer = null;
    }
    if (this.modalTimer) {
      clearTimeout(this.modalTimer);
      this.modalTimer = null;
    }
  },

  noop() {},

  /* ---------- 存储 ---------- */
  save() {
    try {
      wx.setStorageSync(STORE_KEY, {
        cards: this.state.cards,
        settings: this.state.settings,
        remaining: this.state.remaining,
        history: this.state.history
      });
      this.storageOK = true;
    } catch (e) {
      if (this.storageOK !== false) {
        this.storageOK = false;
        this.toast('本地存储不可用，数据不会保存');
      }
    }
  },

  cardOf(id) {
    const cards = this.state.cards;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].id === id) return cards[i];
    }
    return null;
  },

  validRemaining() {
    const ids = this.state.cards.map(function (c) { return c.id; });
    return this.state.remaining.filter(function (id) {
      return ids.indexOf(id) !== -1;
    });
  },

  /* ---------- 提示 ---------- */
  toast(msg) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.setData({ toastShow: true, toastText: msg });
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;
      this.setData({ toastShow: false });
    }, 1900);
  },

  /* ---------- 季节主题 ---------- */
  applySeason(s) {
    if (SEASONS.indexOf(s) === -1) s = 'autumn';
    this.state.settings.season = s;
    this.setData({ season: s, bgSrc: BG_SRC[s] });
    try {
      wx.setNavigationBarColor({
        frontColor: '#000000',
        backgroundColor: THEME_COLOR[s],
        fail: function () {}
      });
    } catch (e) {}
  },

  onTab(e) {
    const name = e.currentTarget.dataset.view;
    if (name === this.data.view) return;
    this.setData({ view: name });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  onToggleDock() {
    if (this.data.dockOpen) {
      this.onCloseDock();
      return;
    }
    this.setData({ dockOpen: true });
    this.scheduleDockHide();
  },

  onCloseDock() {
    if (this.dockTimer) {
      clearTimeout(this.dockTimer);
      this.dockTimer = null;
    }
    this.setData({ dockOpen: false });
  },

  scheduleDockHide() {
    if (this.dockTimer) clearTimeout(this.dockTimer);
    this.dockTimer = setTimeout(() => {
      this.dockTimer = null;
      this.setData({ dockOpen: false });
    }, 4500);
  },

  onSeason(e) {
    const s = e.currentTarget.dataset.s;
    this.applySeason(s);
    this.scheduleDockHide();
  },

  /* ---------- 抽卡锁 / 弹框 ---------- */
  showModal() {
    const c = this.pending[0];
    if (!c) return;
    this.modalVisible = true;
    this.setData({
      modalOpen: true,
      modalTitle: c.title,
      modalText: c.text
    });
  },

  closeModal() {
    this.modalVisible = false;
    this.setData({ modalOpen: false });
  },

  updateDrawLock() {
    let locked = false;
    let text = '抽 一 张';

    if (this.drawing) {
      locked = true;
      text = '抽卡中…';
    } else if (this.pending.length) {
      locked = true;
      text = '先完成当前任务';
    } else if (this.currentCards.some(function (c) { return !c.flipped; })) {
      locked = true;
      text = '先翻开卡面';
    } else if (this.state.settings.count > 1) {
      text = '抽 ' + this.state.settings.count + ' 张';
    }

    this.setData({ drawLocked: locked, drawBtnText: text });
  },

  enqueuePending(card) {
    if (!card || this.pending.indexOf(card) !== -1 || card.record.done) return;
    this.pending.push(card);
    this.updateDrawLock();

    if (!this.modalVisible) {
      this.modalVisible = true;
      this.modalTimer = setTimeout(() => {
        this.modalTimer = null;
        if (!this.modalVisible) return;
        this.modalVisible = false;
        this.showModal();
      }, 520);
    }
  },

  completePending() {
    const c = this.pending[0];
    if (!c) {
      this.closeModal();
      return;
    }
    c.record.done = true;
    this.pending.shift();
    this.save();
    this.refresh();
    this.updateDrawLock();

    if (this.pending.length) {
      this.showModal();
    } else {
      this.closeModal();
      this.toast('任务完成，可以抽下一张了');
      vibrate();
    }
  },

  clearPending() {
    this.pending = [];
    this.modalVisible = false;
    if (this.modalTimer) {
      clearTimeout(this.modalTimer);
      this.modalTimer = null;
    }
    this.setData({ modalOpen: false });
    this.updateDrawLock();
  },

  syncPending() {
    this.pending = this.pending.filter(function (p) { return !p.record.done; });
    this.updateDrawLock();
    if (!this.pending.length) {
      if (this.modalVisible) this.closeModal();
    } else if (this.modalVisible) {
      this.showModal();
    }
  },

  /* ---------- 抽卡 ---------- */
  onDraw() {
    if (this.drawing) return;

    if (this.pending.length) {
      if (!this.modalVisible) this.showModal();
      this.toast('先完成当前任务再抽下一张');
      return;
    }

    if (this.currentCards.some(function (c) { return !c.flipped; })) {
      this.toast('先翻开卡面，看看抽到什么任务');
      return;
    }

    const n = this.state.settings.count;
    const noRepeat = this.state.settings.noRepeat;
    let pool;

    if (noRepeat) {
      this.state.remaining = this.validRemaining();
      pool = this.state.remaining.slice();
      if (pool.length === 0) {
        if (this.state.cards.length === 0) {
          this.toast('卡池是空的，先去「卡池」添加任务');
          return;
        }
        this.state.remaining = this.state.cards.map(function (c) { return c.id; });
        pool = this.state.remaining.slice();
        this.toast('本轮已抽完，重新洗牌');
      }
    } else {
      pool = this.state.cards.map(function (c) { return c.id; });
      if (pool.length === 0) {
        this.toast('卡池是空的，先去「卡池」添加任务');
        return;
      }
    }

    this.drawing = true;
    this.updateDrawLock();
    this.setData({ stageMode: 'shuffle', showFlipAll: false });
    vibrate();

    this.drawTimer = setTimeout(() => {
      this.drawTimer = null;
      this.reveal(n, pool, noRepeat);
    }, 1050);
  },

  reveal(n, pool, noRepeat) {
    const take = Math.min(n, pool.length);
    const picks = [];
    const bag = pool.slice();

    for (let i = 0; i < take; i++) {
      const k = Math.floor(Math.random() * bag.length);
      picks.push(bag.splice(k, 1)[0]);
    }

    if (noRepeat) {
      this.state.remaining = this.state.remaining.filter(function (id) {
        return picks.indexOf(id) === -1;
      });
    }

    const now = Date.now();
    const records = picks.map((id) => {
      const c = this.cardOf(id);
      return { key: uid(), id: id, title: c.title, text: c.text, at: now, done: false };
    });

    records.forEach((r) => { this.state.history.unshift(r); });
    if (this.state.history.length > 200) this.state.history.length = 200;

    this.currentCards = records.map(function (r, i) {
      return {
        id: r.id,
        title: r.title,
        text: r.text,
        flipped: false,
        no: String(i + 1).padStart(2, '0'),
        record: r
      };
    });

    this.drawing = false;
    this.save();
    this.syncStage();
    this.refresh();
    vibrate();
  },

  abortDraw() {
    if (this.drawTimer) {
      clearTimeout(this.drawTimer);
      this.drawTimer = null;
    }
    if (this.drawing) {
      this.drawing = false;
      this.syncStage();
    }
  },

  syncStage() {
    const cards = this.currentCards.map(function (c) {
      return { id: c.id, title: c.title, text: c.text, flipped: c.flipped, no: c.no };
    });
    this.setData({
      stageMode: cards.length ? 'cards' : 'placeholder',
      currentCards: cards
    });
    this.updateFlipBtn();
  },

  updateFlipBtn() {
    const show = this.data.stageMode === 'cards' && this.currentCards.some(function (c) {
      return !c.flipped;
    });
    this.setData({ showFlipAll: show });
  },

  onFlip(e) {
    const i = Number(e.currentTarget.dataset.i);
    const c = this.currentCards[i];
    if (!c || c.flipped) return;

    c.flipped = true;
    const patch = {};
    patch['currentCards[' + i + '].flipped'] = true;
    this.setData(patch);
    vibrate();
    this.updateFlipBtn();
    this.enqueuePending(c);
  },

  onFlipAll() {
    const toQueue = this.currentCards.filter(function (c) { return !c.flipped; });
    if (!toQueue.length) return;

    const patch = {};
    this.currentCards.forEach(function (c, i) {
      c.flipped = true;
      patch['currentCards[' + i + '].flipped'] = true;
    });
    this.setData(patch);
    this.updateFlipBtn();
    vibrate();
    toQueue.forEach((c) => this.enqueuePending(c));
  },

  onResetRound() {
    this.state.remaining = this.state.cards.map(function (c) { return c.id; });
    this.currentCards = [];
    this.abortDraw();
    this.clearPending();
    this.syncStage();
    this.save();
    this.refresh();
    this.toast('本轮进度已重置');
  },

  /* ---------- 状态 / 设置 ---------- */
  refresh() {
    const remain = this.state.settings.noRepeat
      ? this.validRemaining().length
      : this.state.cards.length;

    this.setData({
      poolCount: this.state.cards.length,
      statRemain: remain,
      statDrawn: Math.max(0, this.state.cards.length - remain),
      count: this.state.settings.count,
      noRepeat: this.state.settings.noRepeat,
      pool: this.state.cards,
      hTotal: this.state.history.length,
      hDone: this.state.history.filter(function (h) { return h.done; }).length,
      history: this.buildHistoryView()
    });

    this.updateDrawLock();
  },

  buildHistoryView() {
    return this.state.history.map(function (h) {
      return {
        key: h.key,
        title: h.title,
        text: h.text,
        done: h.done,
        timeText: fmtTime(h.at)
      };
    });
  },

  onCount(e) {
    this.state.settings.count = Number(e.currentTarget.dataset.n);
    this.save();
    this.refresh();
  },

  onToggleRepeat() {
    const settings = this.state.settings;
    settings.noRepeat = !settings.noRepeat;
    if (settings.noRepeat) this.state.remaining = this.validRemaining();
    this.save();
    this.refresh();
  },

  /* ---------- 卡池 ---------- */
  onAddOne() {
    const title = String(this.data.inputTitle || '').trim();
    let text = String(this.data.inputText || '').trim();
    if (!text) {
      this.toast('请输入任务内容');
      return;
    }

    const card = {
      id: uid(),
      title: (title || shortTitle(text)).slice(0, 12),
      text: text
    };

    this.state.cards.push(card);
    this.state.remaining.push(card.id);
    this.setData({ inputTitle: '', inputText: '' });
    this.save();
    this.refresh();
    this.toast('已添加');
  },

  onImport() {
    const raw = String(this.data.inputBatch || '');
    const lines = raw.split('\n').map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });

    if (!lines.length) {
      this.toast('没有可导入的内容');
      return;
    }

    let added = 0;
    lines.forEach((line) => {
      const parts = line.split('|');
      let title = '';
      let text = line;

      if (parts.length > 1) {
        title = parts[0].trim();
        text = parts.slice(1).join('|').trim();
      }
      if (!text) return;
      if (!title) title = shortTitle(text);

      const card = {
        id: uid(),
        title: title.slice(0, 12),
        text: text.slice(0, 60)
      };
      this.state.cards.push(card);
      this.state.remaining.push(card.id);
      added++;
    });

    this.setData({ inputBatch: '' });
    this.save();
    this.refresh();
    this.toast('已导入 ' + added + ' 张');
  },

  onPoolDel(e) {
    const id = e.currentTarget.dataset.id;
    this.state.cards = this.state.cards.filter(function (c) { return c.id !== id; });
    this.state.remaining = this.state.remaining.filter(function (x) { return x !== id; });
    this.save();
    this.refresh();
  },

  onRestore() {
    wx.showModal({
      title: '恢复默认',
      content: '恢复默认会覆盖当前卡池，确定吗？',
      success: (res) => {
        if (!res.confirm) return;
        this.state.cards = makeDefaultCards();
        this.state.remaining = this.state.cards.map(function (c) { return c.id; });
        this.currentCards = [];
        this.abortDraw();
        this.clearPending();
        this.syncStage();
        this.save();
        this.refresh();
        this.toast('已恢复默认卡池');
      }
    });
  },

  onClearPool() {
    wx.showModal({
      title: '清空卡池',
      content: '确定清空整个卡池吗？',
      success: (res) => {
        if (!res.confirm) return;
        this.state.cards = [];
        this.state.remaining = [];
        this.currentCards = [];
        this.abortDraw();
        this.clearPending();
        this.syncStage();
        this.save();
        this.refresh();
        this.toast('卡池已清空');
      }
    });
  },

  /* ---------- 记录 ---------- */
  onHistoryToggle(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const h = this.state.history[idx];
    if (!h) return;

    h.done = !h.done;
    this.save();
    this.refresh();
    this.syncPending();
  },

  onHistoryDel(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const h = this.state.history[idx];
    if (!h) return;

    this.state.history.splice(idx, 1);
    this.pending = this.pending.filter(function (p) { return p.record !== h; });
    this.save();
    this.refresh();
    this.syncPending();
  },

  onClearHistory() {
    wx.showModal({
      title: '清空记录',
      content: '确定清空所有抽卡记录吗？',
      success: (res) => {
        if (!res.confirm) return;
        this.state.history = [];
        this.save();
        this.refresh();
        this.toast('记录已清空');
      }
    });
  },

  /* ---------- 弹框 ---------- */
  onModalDone() {
    this.completePending();
  },

  onModalLater() {
    this.closeModal();
  },

  onMaskTap() {
    this.closeModal();
  }
});

const STORE_KEY = 'citywalk.draw.v1';
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const BG_SRC = {
  spring: '/assets/spring.jpg',
  summer: '/assets/summer.jpg',
  autumn: '/assets/autumn.jpg',
  winter: '/assets/winter.jpg'
};

const MAX_POOL = 300;
const MAX_IMPORT = 100;

/* 云开发数据库集合与同步参数 */
const CLOUD_COLLECTION = 'citywalk_states';
const CLOUD_SAVE_DELAY = 800;

const DEFAULT_TASKS = [
  ['晒太阳的人', '找到一个正在晒太阳的人并给其拍照'],
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

function fallbackState() {
  const cards = makeDefaultCards();
  return {
    cards: cards,
    settings: { count: 1, noRepeat: true, season: currentSeason() },
    remaining: cards.map(function (c) { return c.id; }),
    history: [],
    updatedAt: 0
  };
}

function normalizeState(raw) {
  const fallback = fallbackState();
  if (!raw || typeof raw !== 'object') return fallback;

  try {
    const cards = Array.isArray(raw.cards) ? raw.cards.filter(function (c) {
      return c && typeof c.text === 'string';
    }).map(function (c) {
      return {
        id: c.id || uid(),
        title: (typeof c.title === 'string' && c.title.trim()) ? c.title.trim() : shortTitle(c.text),
        text: c.text
      };
    }).slice(0, MAX_POOL) : fallback.cards;

    const settings = {
      count: Math.min(5, Math.max(1, parseInt(raw.settings && raw.settings.count, 10) || 1)),
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
      cards: cards,
      settings: settings,
      remaining: remaining === null ? cards.map(function (c) { return c.id; }) : remaining,
      history: history,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0
    };
  } catch (e) {
    return fallback;
  }
}

function loadState() {
  let raw;
  try {
    raw = wx.getStorageSync(STORE_KEY);
  } catch (e) {
    return { state: fallbackState(), readOK: false };
  }
  return { state: normalizeState(raw), readOK: true };
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
    this.roundDrawn = 0;
    this.modalVisible = false;
    this.drawing = false;
    this.drawTimer = null;
    this.modalTimer = null;
    this.toastTimer = null;
    this.dockTimer = null;

    /* 云端同步状态：pending 拉取中 / ready 可用 / off 未启用或不可用 */
    this.cloudStatus = 'off';
    this.cloudDocId = '';
    this.cloudTimer = null;
    this.cloudChain = null;
    this.cloudNotified = false;

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
    this.persistLocal();
    this.syncFromCloud();

    if (!this.storageOK) {
      setTimeout(() => this.toast('本地存储不可用，本次数据不会保存'), 800);
    }
  },

  onHide() {
    this.abortDraw();
    this.flushCloudSave();
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
      /* 弹框还没弹出就被切走：允许回到前台后点抽卡重新弹出 */
      this.modalVisible = false;
    }
    if (this.data.toastShow || this.data.dockOpen) {
      this.setData({ toastShow: false, dockOpen: false });
    }
  },

  onUnload() {
    this.flushCloudSave();
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
  persistLocal() {
    try {
      wx.setStorageSync(STORE_KEY, {
        cards: this.state.cards,
        settings: this.state.settings,
        remaining: this.state.remaining,
        history: this.state.history,
        updatedAt: this.state.updatedAt
      });
      this.storageOK = true;
    } catch (e) {
      if (this.storageOK !== false) {
        this.storageOK = false;
        this.toast('本地存储不可用，数据不会保存');
      }
    }
  },

  save() {
    this.state.updatedAt = Date.now();
    this.persistLocal();
    this.scheduleCloudSave();
  },

  /* ---------- 云端同步（微信云开发） ---------- */
  cloudDB() {
    const app = getApp();
    if (!wx.cloud || !app || !app.globalData.cloudReady) return null;
    try {
      return wx.cloud.database();
    } catch (e) {
      return null;
    }
  },

  syncFromCloud() {
    const db = this.cloudDB();
    if (!db) {
      this.cloudStatus = 'off';
      return;
    }

    this.cloudStatus = 'pending';
    db.collection(CLOUD_COLLECTION).orderBy('updatedAt', 'desc').limit(1).get()
      .then((res) => {
        this.cloudStatus = 'ready';
        const doc = res.data && res.data[0];
        if (!doc) {
          /* 云端还没有记录：把本地数据作为初始副本上传 */
          this.pushToCloud();
          return;
        }

        this.cloudDocId = doc._id;
        const remoteAt = doc.updatedAt || 0;
        const localAt = this.state.updatedAt || 0;

        if (remoteAt > localAt) {
          /* 正在抽卡/翻牌时不覆盖，避免打断当前操作 */
          if (this.drawing || this.pending.length || this.currentCards.length) {
            this.pushToCloud();
          } else {
            this.applyRemoteState(doc);
          }
        } else if (localAt > remoteAt) {
          this.pushToCloud();
        }
      })
      .catch(() => {
        this.cloudStatus = 'off';
        this.notifyCloudError();
      });
  },

  applyRemoteState(doc) {
    const next = normalizeState(doc);
    this.state = next;
    this.state.remaining = this.validRemaining();
    this.roundDrawn = 0;
    this.currentCards = [];
    this.pending = [];
    this.modalVisible = false;
    this.applySeason(this.state.settings.season);
    this.syncStage();
    this.refresh();
    this.persistLocal();
  },

  scheduleCloudSave() {
    if (this.cloudStatus !== 'ready') return;
    if (this.cloudTimer) clearTimeout(this.cloudTimer);
    this.cloudTimer = setTimeout(() => {
      this.cloudTimer = null;
      this.pushToCloud();
    }, CLOUD_SAVE_DELAY);
  },

  flushCloudSave() {
    if (this.cloudTimer) {
      clearTimeout(this.cloudTimer);
      this.cloudTimer = null;
      this.pushToCloud();
    }
  },

  pushToCloud() {
    if (this.cloudStatus !== 'ready') return Promise.resolve();
    const db = this.cloudDB();
    if (!db) return Promise.resolve();
    if (!this.state.updatedAt) this.state.updatedAt = Date.now();

    const col = db.collection(CLOUD_COLLECTION);
    const write = () => {
      const data = {
        cards: this.state.cards,
        settings: this.state.settings,
        remaining: this.state.remaining,
        history: this.state.history,
        updatedAt: this.state.updatedAt
      };
      return this.cloudDocId
        ? col.doc(this.cloudDocId).update({ data: data })
        : col.add({ data: data }).then((res) => { this.cloudDocId = res._id; });
    };

    /* 串行写入，避免并发时旧数据覆盖新数据 */
    this.cloudChain = (this.cloudChain || Promise.resolve())
      .then(write)
      .catch(() => { this.notifyCloudError(); });
    return this.cloudChain;
  },

  notifyCloudError() {
    if (this.cloudNotified) return;
    this.cloudNotified = true;
    this.toast('云端同步失败，数据已保存在本地');
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

  enqueuePending(card, extraDelay) {
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
      }, 700 + (extraDelay || 0));
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
    if (this.drawing) {
      this.toast('正在洗牌，稍等一下');
      return;
    }

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
    this.roundDrawn += records.length;

    this.currentCards = records.map(function (r, i) {
      return {
        id: r.id,
        title: r.title,
        text: r.text,
        flipped: false,
        no: (i + 1) < 10 ? '0' + (i + 1) : '' + (i + 1),
        delay: 0,
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
      this.updateDrawLock();
    }
  },

  syncStage() {
    const cards = this.currentCards.map(function (c) {
      return { id: c.id, title: c.title, text: c.text, flipped: c.flipped, no: c.no, delay: c.delay || 0 };
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

    /* 依次错峰翻开，每张间隔 70ms */
    const stagger = 70;
    const patch = {};
    toQueue.forEach(function (c, i) {
      c.flipped = true;
      c.delay = i * stagger;
    });
    this.currentCards.forEach(function (c, i) {
      patch['currentCards[' + i + '].flipped'] = true;
      patch['currentCards[' + i + '].delay'] = c.delay || 0;
    });
    this.setData(patch);
    this.updateFlipBtn();
    vibrate();

    /* 弹框等最后一张翻完再出现 */
    const extra = (toQueue.length - 1) * stagger;
    toQueue.forEach((c, i) => this.enqueuePending(c, i === 0 ? extra : 0));
  },

  onResetRound() {
    this.roundDrawn = 0;
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
      statDrawn: this.state.settings.noRepeat
        ? Math.max(0, this.state.cards.length - remain)
        : this.roundDrawn,
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
    if (settings.noRepeat) {
      /* 关闭不重复前，把本轮已抽数量记下来，切换后继续显示 */
      this.roundDrawn = Math.max(0, this.state.cards.length - this.validRemaining().length);
    }
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

    if (this.state.cards.length >= MAX_POOL) {
      this.toast('卡池最多 ' + MAX_POOL + ' 张，请先删除一些');
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

    const room = MAX_POOL - this.state.cards.length;
    if (room <= 0) {
      this.toast('卡池已满 ' + MAX_POOL + ' 张，请先删除一些');
      return;
    }

    const limit = Math.min(lines.length, room, MAX_IMPORT);
    let added = 0;
    lines.slice(0, limit).forEach((line) => {
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

    const skipped = lines.length - limit;
    if (skipped > 0) {
      this.toast('已导入 ' + added + ' 张，' + skipped + ' 条超出上限未导入');
    } else {
      this.toast('已导入 ' + added + ' 张');
    }
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

/* 微信云开发环境 ID */
const CLOUD_ENV = 'cloud1-d2g1idal59249a6c3';

App({
  globalData: {
    statusBarHeight: 20,
    cloudReady: false
  },

  onLaunch() {
    this.setupLogger();

    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.globalData.statusBarHeight = info.statusBarHeight || 20;
    } catch (e) {
      this.globalData.statusBarHeight = 20;
    }

    if (wx.cloud) {
      try {
        wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
        this.globalData.cloudReady = true;
      } catch (e) {
        this.globalData.cloudReady = false;
        this.logError('cloudInit', e);
      }
    }
  },

  /* 实时日志：在小程序后台「开发管理 → 运维中心 → 实时日志」可查看 */
  setupLogger() {
    try {
      this.logger = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;
    } catch (e) {
      this.logger = null;
    }
  },

  logError(tag, detail) {
    let text;
    if (typeof detail === 'string') {
      text = detail;
    } else if (detail instanceof Error) {
      text = detail.message + ' ' + (detail.stack || '');
    } else {
      try {
        text = JSON.stringify(detail);
      } catch (e) {
        text = (detail && detail.message) || String(detail);
      }
    }
    if (typeof text !== 'string') text = String(text);
    if (text.length > 1000) text = text.slice(0, 1000);

    if (this.logger) {
      try {
        this.logger.error(tag, text);
      } catch (e) {}
    }
    console.error('[citywalk]', tag, text);
  },

  onError(err) {
    this.logError('onError', err);
  },

  onUnhandledRejection(res) {
    this.logError('onUnhandledRejection', (res && res.reason) || res);
  },

  onPageNotFound(res) {
    this.logError('onPageNotFound', res);
  }
});

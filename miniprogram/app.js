/* 微信云开发环境 ID */
const CLOUD_ENV = 'cloud1-d2g1idal59249a6c3';

App({
  globalData: {
    statusBarHeight: 20,
    cloudReady: false
  },

  onLaunch() {
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
      }
    }
  }
});

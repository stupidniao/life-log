const store = require('./utils/store');

App({
  globalData: {
    // 可选：把云开发环境 ID 写死在这里。
    // 建议不写，改在「我的 → 云同步」里填，会存进设置，换机后从云端恢复配置。
    cloudEnv: '',
    version: '0.3.0'
  },

  onLaunch() {
    store.init();

    // 启动即做一次后台同步：未开启云同步时 syncNow 会静默跳过
    const sync = require('./services/sync');
    sync.syncNow().then(res => {
      if (res && res.ok) {
        console.log('[sync] 启动同步完成：推 ' + res.pushed + ' / 拉 ' + res.pulled);
      }
    });
  }
});

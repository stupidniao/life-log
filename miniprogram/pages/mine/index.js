const recordService = require('../../services/record');
const store = require('../../utils/store');
const sync = require('../../services/sync');
const dateUtil = require('../../utils/date');
const { getType, TYPES } = require('../../config/recordTypes');

const app = getApp();

function formatSyncTime(ts) {
  if (!ts) return '尚未同步';
  const d = new Date(ts);
  return dateUtil.pad(d.getMonth() + 1) + '-' + dateUtil.pad(d.getDate()) + ' ' +
    dateUtil.pad(d.getHours()) + ':' + dateUtil.pad(d.getMinutes());
}

Page({
  data: {
    typeList: [],
    budget: '',
    totalCount: 0,
    spanText: '',
    version: '0.1.0',
    cloudEnv: '',
    cloudSync: false,
    lastSyncText: '尚未同步',
    syncing: false
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const settings = store.getSettings();
    const records = recordService.activeRecords();

    const typeList = (settings.enabledTypes || [])
      .map(k => getType(k))
      .filter(Boolean)
      .map(t => ({
        key: t.key,
        name: t.name,
        icon: t.icon,
        color: t.color,
        soft: t.soft
      }));

    // 允许重新打开被关掉的模块：这里只展示已启用的，关闭操作在下方「添加模块」
    let spanText = '还没有记录';
    if (records.length) {
      const dates = records.map(r => r.date).sort();
      spanText = '从 ' + dates[0] + ' 开始，已记录 ' + records.length + ' 条';
    }

    this.setData({
      typeList: typeList,
      budget: settings.monthBudget ? String(settings.monthBudget) : '',
      totalCount: records.length,
      spanText: spanText,
      version: (app && app.globalData && app.globalData.version) || '0.1.0',
      cloudEnv: settings.cloudEnv || '',
      cloudSync: !!settings.cloudSync,
      lastSyncText: formatSyncTime(settings.lastSyncAt),
      syncing: sync.isSyncing()
    });
  },

  onBudgetInput(e) {
    this.setData({ budget: e.detail.value });
  },

  onBudgetBlur() {
    const value = Number(this.data.budget);
    const safe = isNaN(value) || value < 0 ? 0 : value;
    store.patchSettings({ monthBudget: safe });
    this.setData({ budget: safe ? String(safe) : '' });
    wx.showToast({ title: safe ? '预算已更新' : '已关闭预算提醒', icon: 'none' });
  },

  /** 关闭某个模块（从首页与录入页移除，历史记录保留） */
  onRemoveType(e) {
    const key = e.currentTarget.dataset.key;
    const def = getType(key);
    wx.showModal({
      title: '关闭「' + def.name + '」模块？',
      content: '首页不再显示，历史记录仍会保留，可随时重新开启。',
      success: res => {
        if (!res.confirm) return;
        const settings = store.getSettings();
        const next = (settings.enabledTypes || []).filter(k => k !== key);
        if (!next.length) {
          wx.showToast({ title: '至少保留一个模块', icon: 'none' });
          return;
        }
        store.patchSettings({ enabledTypes: next });
        this.refresh();
      }
    });
  },

  /** 恢复全部模块 */
  onResetTypes() {
    const all = TYPES.map(t => t.key);
    store.patchSettings({ enabledTypes: all });
    this.refresh();
    wx.showToast({ title: '已恢复全部模块', icon: 'none' });
  },

  /** 导出：复制 JSON 到剪贴板（M1 最轻量的数据备份方式） */
  onGoPlants() {
    wx.navigateTo({ url: '/pages/plants/index' });
  },

  onExport() {
    const records = recordService.activeRecords();
    if (!records.length) {
      wx.showToast({ title: '还没有可导出的记录', icon: 'none' });
      return;
    }
    const payload = {
      app: 'life-log',
      version: this.data.version,
      exportedAt: new Date().toISOString(),
      count: records.length,
      records: records
    };
    wx.setClipboardData({
      data: JSON.stringify(payload, null, 2),
      success: () => {
        wx.showModal({
          title: '已复制到剪贴板',
          content: '共 ' + records.length + ' 条记录。可粘贴到备忘录或发给自己长期保存。',
          showCancel: false
        });
      }
    });
  },

  /* ---------------- 云同步 ---------------- */

  onEnvInput(e) {
    this.setData({ cloudEnv: e.detail.value.trim() });
  },

  onEnvBlur() {
    store.patchSettings({ cloudEnv: this.data.cloudEnv });
  },

  onSyncToggle(e) {
    const on = !!e.detail.value;
    if (on && !this.data.cloudEnv) {
      wx.showToast({ title: '请先填写云开发环境 ID（见 README 部署指南）', icon: 'none' });
      this.setData({ cloudSync: false });
      return;
    }
    store.patchSettings({ cloudSync: on });
    this.setData({ cloudSync: on });
    if (on) {
      // 开启后立即同步一次，把历史记录全部推上云
      this.runSync(true);
    }
  },

  onSyncNow() {
    if (!this.data.cloudSync) {
      wx.showToast({ title: '请先打开同步开关', icon: 'none' });
      return;
    }
    this.runSync(false);
  },

  async runSync(first) {
    if (this.data.syncing) return;
    this.setData({ syncing: true });
    const res = await sync.syncNow();
    this.setData({
      syncing: false,
      lastSyncText: formatSyncTime(store.getSettings().lastSyncAt)
    });

    if (res.skipped && res.busy) {
      wx.showToast({ title: '正在同步中', icon: 'none' });
      return;
    }
    if (res.ok) {
      const msg = first
        ? '已开启云同步，推 ' + res.pushed + ' 条 / 拉 ' + res.pulled + ' 条'
        : '同步完成，推 ' + res.pushed + ' / 拉 ' + res.pulled;
      wx.showToast({ title: msg, icon: 'none' });
      this.refresh();
    } else {
      const err = res.error || {};
      wx.showToast({
        title: (err.errMsg && err.errMsg.indexOf('env') > -1)
          ? '环境 ID 无效或函数未部署'
          : '同步失败，请检查网络后重试',
        icon: 'none'
      });
    }
  },

  onClear() {
    wx.showModal({
      title: '清空全部记录？',
      content: '共 ' + this.data.totalCount + ' 条记录将被永久删除，建议先导出备份。此操作无法撤销。',
      confirmText: '清空',
      confirmColor: '#E4574C',
      success: res => {
        if (!res.confirm) return;
        store.clearRecords();
        this.refresh();
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  },

  onAbout() {
    wx.showModal({
      title: '关于日迹',
      content:
        '版本 ' + this.data.version + '\n\n' +
        '默认所有记录仅保存在你的手机本地。\n' +
        '开启云同步后，记录会备份到你自己的微信云开发环境（按微信账号隔离），用于多设备同步与找回。\n\n' +
        '数据不会用于任何分析或推荐。清理小程序缓存或卸载会清除本地数据，请及时同步或导出备份。',
      showCancel: false
    });
  },

  onPrivacy() {
    wx.showModal({
      title: '隐私说明',
      content:
        '1. 本小程序不收集手机号、位置、通讯录等个人信息；\n' +
        '2. 记录数据默认在本机存储，不上传任何服务器；\n' +
        '3. 开启云同步后，数据仅存于你自己的微信云开发环境（按微信账号 openid 隔离），不经手任何第三方；\n' +
        '4. 你可以在本页随时导出或清空全部数据。',
      showCancel: false
    });
  }
});

const recordService = require('../../services/record');
const dateUtil = require('../../utils/date');
const store = require('../../utils/store');
const { getType } = require('../../config/recordTypes');

Page({
  data: {
    tabs: [],
    activeType: 'all',
    month: '',
    monthLabel: '',
    groups: [],
    totalCount: 0
  },

  onLoad() {
    const settings = store.getSettings();
    const tabs = [{ key: 'all', name: '全部', icon: '', color: '#2F7D6D' }].concat(
      (settings.enabledTypes || [])
        .map(k => getType(k))
        .filter(Boolean)
        .map(t => ({ key: t.key, name: t.name, icon: t.icon, color: t.color }))
    );

    const today = dateUtil.today();
    this.setData({
      tabs: tabs,
      month: today.slice(0, 7),
      monthLabel: dateUtil.monthLabel(today.slice(0, 7))
    });
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load();
    wx.stopPullDownRefresh();
  },

  load() {
    const range = dateUtil.monthRange(this.data.month);
    const list = recordService.query({
      type: this.data.activeType,
      start: range.start,
      end: range.end
    });
    const decorated = recordService.decorateMany(list);

    this.setData({
      groups: recordService.groupByDate(decorated),
      totalCount: list.length
    });
  },

  onTabChange(e) {
    this.setData({ activeType: e.currentTarget.dataset.type }, () => this.load());
  },

  onPrevMonth() {
    this.shiftMonth(-1);
  },

  onNextMonth() {
    this.shiftMonth(1);
  },

  shiftMonth(delta) {
    const month = dateUtil.addMonths(this.data.month, delta);
    // 不允许翻到未来月份
    if (month > dateUtil.today().slice(0, 7)) return;
    this.setData({ month: month, monthLabel: dateUtil.monthLabel(month) }, () => this.load());
  },

  onRecordTap(e) {
    wx.navigateTo({ url: '/pages/record/index?id=' + e.detail.id });
  },

  onRecordLongPress(e) {
    const id = e.detail.id;
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: res => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: '/pages/record/index?id=' + id });
          return;
        }
        wx.showModal({
          title: '删除这条记录？',
          content: '删除后无法恢复',
          confirmColor: '#E4574C',
          success: m => {
            if (!m.confirm) return;
            recordService.remove(id);
            this.load();
            wx.showToast({ title: '已删除', icon: 'none' });
          }
        });
      }
    });
  },

  onAdd() {
    const query = this.data.activeType === 'all' ? '' : '?type=' + this.data.activeType;
    wx.navigateTo({ url: '/pages/record/index' + query });
  }
});

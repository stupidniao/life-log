const recordService = require('../../services/record');
const dateUtil = require('../../utils/date');
const store = require('../../utils/store');

function greetingOf(hour) {
  if (hour < 6) return '还没睡？记一笔再休息';
  if (hour < 11) return '早上好，今天也照顾好自己';
  if (hour < 14) return '中午好，吃了吗';
  if (hour < 18) return '下午好，进度如何';
  if (hour < 23) return '晚上好，今天过得怎么样';
  return '夜深了，简单记一笔就睡吧';
}

Page({
  data: {
    dateText: '',
    greeting: '',
    board: [],
    recent: [],
    todayCount: 0,
    monthSpendText: '',
    budgetText: '',
    budgetLeftText: '',
    budgetPercent: 0,
    budgetWarn: false
  },

  onShow() {
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  refresh() {
    const today = dateUtil.today();
    const month = today.slice(0, 7);
    const settings = store.getSettings();

    const board = recordService.buildBoard(today);
    const todayList = recordService.query({ start: today, end: today });
    const recent = recordService.decorateMany(recordService.query({}).slice(0, 5));
    const spend = recordService.monthTotal('expense', month);

    const data = {
      dateText: dateUtil.headerDate(today),
      greeting: greetingOf(new Date().getHours()),
      board: board,
      recent: recent,
      todayCount: todayList.length,
      monthSpendText: spend.text
    };

    // 预算进度（未设置预算时不展示）
    const budget = Number(settings.monthBudget) || 0;
    if (budget > 0) {
      const left = budget - spend.value;
      data.budgetText = '¥' + budget.toFixed(0);
      data.budgetLeftText = '¥' + Math.abs(left).toFixed(2);
      data.budgetPercent = Math.min(100, Math.round((spend.value / budget) * 100));
      data.budgetWarn = left < 0;
    } else {
      data.budgetText = '';
      data.budgetLeftText = '';
      data.budgetPercent = 0;
      data.budgetWarn = false;
    }

    this.setData(data);
  },

  onQuickAdd(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({ url: '/pages/record/index?type=' + type });
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/record/index' });
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
        } else {
          wx.showModal({
            title: '删除这条记录？',
            content: '删除后无法恢复',
            confirmColor: '#E4574C',
            success: m => {
              if (m.confirm) {
                recordService.remove(id);
                this.refresh();
                wx.showToast({ title: '已删除', icon: 'none' });
              }
            }
          });
        }
      }
    });
  },

  onGoList() {
    wx.switchTab({ url: '/pages/list/index' });
  },

  onShareAppMessage() {
    return {
      title: '日迹 —— 把生活记成一条线',
      path: '/pages/home/index'
    };
  }
});

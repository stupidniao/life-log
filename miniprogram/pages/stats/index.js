const recordService = require('../../services/record');
const dateUtil = require('../../utils/date');
const store = require('../../utils/store');
const { getType, formatValue } = require('../../config/recordTypes');

Page({
  data: {
    tabs: [],
    activeType: 'expense',
    typeColor: '#2F7D6D',
    typeName: '',
    days: 7,
    cards: [],
    bars: [],
    hasData: false,
    maxLabel: '单日最高',
    maxText: '-',
    minText: '-',
    distro: [],
    distroTitle: '分类分布',
    rangeText: ''
  },

  onLoad() {
    const settings = store.getSettings();
    const tabs = (settings.enabledTypes || [])
      .map(k => getType(k))
      .filter(Boolean)
      .map(t => ({ key: t.key, name: t.name, icon: t.icon, color: t.color }));

    const activeType = tabs.length ? tabs[0].key : 'expense';
    // 只负责把 data 准备好；加载统一交给 onShow，
    // 避免 onLoad 回调 + onShow 各跑一次 load()
    this.setData({ tabs: tabs, activeType: activeType });
  },

  onShow() {
    if (this.data.activeType) this.load();
  },

  onTabChange(e) {
    const key = e.currentTarget.dataset.type;
    if (key === this.data.activeType) return;
    this.setData({ activeType: key }, () => this.load());
  },

  onPeriodChange(e) {
    const days = Number(e.currentTarget.dataset.days);
    if (days === this.data.days) return;
    this.setData({ days: days }, () => this.load());
  },

  load() {
    const typeKey = this.data.activeType;
    const def = getType(typeKey);
    if (!def) return;

    const days = this.data.days;
    const series = recordService.series(typeKey, days);
    const stats = recordService.statsOf(typeKey, days);

    const values = series.filter(d => d.value !== null).map(d => d.value);
    const hasData = values.length > 0;
    const max = hasData ? Math.max.apply(null, values) : 0;
    const min = hasData ? Math.min.apply(null, values) : 0;

    // 体重这类指标型，柱状图从最小值起算才有区分度
    const autoBase = def.primary.chartBase === 'auto';
    const base = autoBase && hasData ? min * 0.98 : 0;
    const span = max - base;

    const bars = series.map((d, index) => {
      let height = 0;
      if (d.value !== null) {
        height = span > 0 ? Math.max(6, Math.round(((d.value - base) / span) * 100)) : 60;
      }
      return Object.assign({}, d, {
        height: height,
        has: d.value !== null,
        showLabel: days <= 7 || index % 5 === 0 || index === series.length - 1
      });
    });

    const range = days === 7 ? '近 7 天' : '近 30 天';
    const today = dateUtil.today();

    this.setData({
      typeColor: def.color,
      typeName: def.name,
      cards: stats.cards,
      bars: bars,
      hasData: hasData,
      maxLabel: stats.mode === 'mean' ? '最高' : '单日最高',
      maxText: hasData ? formatValue(def, max) : '-',
      minText: hasData ? values.length + ' 天有记录' : '-',
      distro: recordService.distribution(typeKey, dateUtil.addDays(today, -(days - 1)), today),
      distroTitle: def.key === 'expense' || def.key === 'income' ? '去向分布' : '构成分布',
      rangeText: range
    });
  }
});

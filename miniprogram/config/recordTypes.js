/**
 * 记录类型注册表（整个小程序的「唯一真相源」）
 *
 * 设计要点：
 * 1. 新增一个记录模块（喝茶 / 服药 / 冥想 / 学英语……）= 往 TYPES 里加一项，
 *    首页卡片、录入表单、列表展示、统计图表会自动出现，不需要改任何页面代码。
 * 2. 两种记录形态：
 *    - 事件型（event）：一次发生一件事，可多条/天（支出、运动、喝酒）
 *    - 指标型（metric）：一天一个状态值，取最新值（体重、睡眠时长）
 * 3. 每个类型有一个 primary 字段作为「主数值」，用于趋势图和汇总。
 *    其余字段全部落在 fields 里，schema 自由扩展。
 */

const TYPES = [
  /* ---------------- 金钱 ---------------- */
  {
    key: 'expense',
    name: '支出',
    icon: '💸',
    color: '#E4574C',
    soft: 'rgba(228, 87, 76, 0.10)',
    kind: 'event',
    primary: { field: 'amount', agg: 'sum', fmt: 'money' },
    fields: [
      { key: 'amount', label: '金额', type: 'money', required: true, placeholder: '0.00' },
      {
        key: 'category',
        label: '分类',
        type: 'picker',
        options: ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '人情', '其他'],
        default: '餐饮'
      },
      {
        key: 'pay',
        label: '支付方式',
        type: 'picker',
        options: ['微信', '支付宝', '银行卡', '现金'],
        default: '微信'
      },
      { key: 'note', label: '备注', type: 'text', placeholder: '例如：晚饭外卖 38 元' }
    ],
    titleField: 'category',
    subFields: ['note']
  },
  {
    key: 'income',
    name: '收入',
    icon: '💰',
    color: '#2F9E6E',
    soft: 'rgba(47, 158, 110, 0.10)',
    kind: 'event',
    primary: { field: 'amount', agg: 'sum', fmt: 'money' },
    fields: [
      { key: 'amount', label: '金额', type: 'money', required: true, placeholder: '0.00' },
      {
        key: 'category',
        label: '来源',
        type: 'picker',
        options: ['工资', '奖金', '兼职', '理财', '红包', '其他'],
        default: '工资'
      },
      { key: 'note', label: '备注', type: 'text', placeholder: '例如：10 月工资' }
    ],
    titleField: 'category',
    subFields: ['note']
  },

  /* ---------------- 身体 ---------------- */
  {
    key: 'exercise',
    name: '运动',
    icon: '🏃',
    color: '#2C7BE5',
    soft: 'rgba(44, 123, 229, 0.10)',
    kind: 'event',
    primary: { field: 'duration', agg: 'sum', fmt: 'duration' },
    fields: [
      {
        key: 'sport',
        label: '项目',
        type: 'picker',
        options: ['跑步', '快走', '力量', '游泳', '骑行', '球类', '瑜伽', '其他'],
        default: '跑步'
      },
      { key: 'duration', label: '时长', type: 'number', unit: '分钟', required: true, placeholder: '30' },
      { key: 'distance', label: '距离', type: 'decimal', unit: '公里', placeholder: '选填' },
      { key: 'calorie', label: '消耗', type: 'number', unit: '千卡', placeholder: '选填' }
    ],
    titleField: 'sport',
    subFields: ['distance', 'calorie']
  },
  {
    key: 'weight',
    name: '体重',
    icon: '⚖️',
    color: '#8B5CF6',
    soft: 'rgba(139, 92, 246, 0.10)',
    kind: 'metric',
    primary: { field: 'weight', agg: 'last', fmt: 'kg', chartBase: 'auto' },
    fields: [
      { key: 'weight', label: '体重', type: 'decimal', unit: 'kg', required: true, placeholder: '70.5' },
      { key: 'bodyFat', label: '体脂率', type: 'decimal', unit: '%', placeholder: '选填' }
    ],
    titleField: '',
    subFields: ['bodyFat']
  },
  {
    key: 'sleep',
    name: '睡眠',
    icon: '😴',
    color: '#5B6B7C',
    soft: 'rgba(91, 107, 124, 0.10)',
    kind: 'metric',
    primary: { field: 'hours', agg: 'last', fmt: 'hours', chartBase: 'auto' },
    fields: [
      { key: 'hours', label: '时长', type: 'decimal', unit: '小时', required: true, placeholder: '7.5' },
      {
        key: 'quality',
        label: '感受',
        type: 'picker',
        options: ['很好', '还行', '较差'],
        default: '还行'
      }
    ],
    titleField: 'quality',
    subFields: []
  },

  /* ---------------- 输入 ---------------- */
  {
    key: 'drink',
    name: '喝酒',
    icon: '🍺',
    color: '#D99A2B',
    soft: 'rgba(217, 154, 43, 0.10)',
    kind: 'event',
    primary: { field: 'ml', agg: 'sum', fmt: 'ml' },
    fields: [
      {
        key: 'kind',
        label: '酒种',
        type: 'picker',
        options: ['啤酒', '红酒', '白酒', '洋酒', '其他'],
        default: '啤酒'
      },
      { key: 'ml', label: '饮用量', type: 'number', unit: 'ml', required: true, placeholder: '330' },
      {
        key: 'level',
        label: '状态',
        type: 'picker',
        options: ['微醺', '适量', '过量'],
        default: '微醺'
      },
      { key: 'note', label: '场景', type: 'text', placeholder: '例如：和朋友聚餐' }
    ],
    titleField: 'kind',
    subFields: ['note']
  },
  {
    key: 'reading',
    name: '阅读',
    icon: '📖',
    color: '#0E9F9F',
    soft: 'rgba(14, 159, 159, 0.10)',
    kind: 'event',
    primary: { field: 'minutes', agg: 'sum', fmt: 'duration' },
    fields: [
      { key: 'book', label: '书名', type: 'text', required: true, placeholder: '例如：人类简史' },
      { key: 'minutes', label: '时长', type: 'number', unit: '分钟', required: true, placeholder: '30' },
      { key: 'pages', label: '页数', type: 'number', unit: '页', placeholder: '选填' },
      { key: 'note', label: '摘记', type: 'text', placeholder: '选填' }
    ],
    titleField: 'book',
    subFields: ['pages', 'note']
  }
];

/* ---------------- 数值格式化 ---------------- */

const FORMATTERS = {
  money: v => '¥' + Number(v).toFixed(2),
  duration: v => {
    const n = Number(v);
    if (n >= 60) {
      const h = n / 60;
      return (Number.isInteger(h) ? h : h.toFixed(1)) + ' 小时';
    }
    return n + ' 分钟';
  },
  kg: v => Number(v).toFixed(1) + ' kg',
  hours: v => Number(v).toFixed(1) + ' 小时',
  ml: v => Number(v) + ' ml',
  count: v => Number(v) + ' 次'
};

const TYPE_MAP = TYPES.reduce((map, t) => {
  map[t.key] = t;
  return map;
}, {});

/**
 * 取类型定义
 * @param {string} key
 * @returns {object|null}
 */
function getType(key) {
  return TYPE_MAP[key] || null;
}

/**
 * 轻量列表，用于 tab / 筛选器
 */
function listTypes() {
  return TYPES.map(t => ({ key: t.key, name: t.name, icon: t.icon, color: t.color, soft: t.soft }));
}

/**
 * 把主数值格式化成可读文本
 */
function formatValue(def, value) {
  if (!def || value === null || value === undefined || value === '') return '未记录';
  const fn = FORMATTERS[def.primary.fmt] || FORMATTERS.count;
  try {
    return fn(value);
  } catch (e) {
    return String(value);
  }
}

module.exports = {
  TYPES,
  getType,
  listTypes,
  formatValue
};

/**
 * 记录服务层
 * 页面只跟这一层打交道；所有「类型差异」在这里被抹平，页面拿到的永远是统一结构。
 * 切云开发时：把 allRecords/saveRecords 换成云函数调用即可，本文件对外签名不变。
 */

const store = require('../utils/store');
const dateUtil = require('../utils/date');
const { getType, listTypes, formatValue } = require('../config/recordTypes');
const sync = require('./sync');

function genId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 未删除的记录 */
function activeRecords() {
  return store.allRecords().filter(r => !r.deleted);
}

function compareAsc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.time || '00:00';
  const tb = b.time || '00:00';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

function compareDesc(a, b) {
  return compareAsc(b, a);
}

/**
 * 归一化：把表单里的 fields 抽出一个统一主数值 value
 */
function normalize(raw, keepId) {
  const def = getType(raw.type);
  if (!def) throw new Error('未知的记录类型: ' + raw.type);

  const primaryKey = def.primary.field;
  let value = raw.fields ? Number(raw.fields[primaryKey]) : NaN;
  if (isNaN(value)) value = null;

  const now = Date.now();
  return {
    id: keepId || raw.id || genId(),
    type: raw.type,
    date: raw.date || dateUtil.today(),
    time: raw.time || dateUtil.nowTime(),
    value,
    fields: raw.fields || {},
    note: raw.note || '',
    deleted: false,
    createdAt: raw.createdAt || now,
    updatedAt: now
  };
}

/* ---------------- 写 ---------------- */

function add(raw) {
  const record = normalize(raw);
  const list = store.allRecords().slice();
  list.push(record);
  store.saveRecords(list);
  sync.scheduleSync(); // 已开启云同步时 2s 防抖后自动上行
  return record;
}

function update(id, raw) {
  const list = store.allRecords().slice();
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) throw new Error('记录不存在');
  const merged = normalize(
    Object.assign({}, list[idx], raw, { fields: raw.fields || list[idx].fields }),
    id
  );
  merged.createdAt = list[idx].createdAt;
  list[idx] = merged;
  store.saveRecords(list);
  sync.scheduleSync();
  return merged;
}

function remove(id) {
  const list = store.allRecords().slice();
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) return false;
  list[idx] = Object.assign({}, list[idx], { deleted: true, updatedAt: Date.now() });
  store.saveRecords(list);
  sync.scheduleSync(); // 软删除也要同步，云端才知该删
  return true;
}

function get(id) {
  return activeRecords().find(r => r.id === id) || null;
}

/* ---------------- 读 ---------------- */

/**
 * @param {object} q { type, start, end, keyword }
 */
function query(q) {
  const opt = q || {};
  let list = activeRecords();
  if (opt.type && opt.type !== 'all') {
    list = list.filter(r => r.type === opt.type);
  }
  if (opt.start) list = list.filter(r => r.date >= opt.start);
  if (opt.end) list = list.filter(r => r.date <= opt.end);
  if (opt.keyword) {
    const kw = String(opt.keyword).trim();
    if (kw) {
      list = list.filter(r => {
        // 只搜字段值，不搜字段名（不能用 JSON.stringify，
        // 否则搜 "note" 会把所有带备注字段的记录全部命中）
        const values = r.fields
          ? Object.keys(r.fields).map(k => String(r.fields[k])).join(' ')
          : '';
        const text = values + ' ' + r.note + ' ' + r.date;
        return text.indexOf(kw) > -1;
      });
    }
  }
  return list.slice().sort(compareDesc);
}

/* ---------------- 展示层装饰 ---------------- */

function subTextOf(def, record) {
  const parts = [];
  (def.subFields || []).forEach(key => {
    const v = record.fields ? record.fields[key] : undefined;
    if (v === undefined || v === null || v === '') return;
    const fd = (def.fields || []).find(f => f.key === key);
    parts.push(fd && fd.unit ? v + ' ' + fd.unit : String(v));
  });
  return parts.join(' · ');
}

/** 给记录补上展示字段，WXML 里就不用做任何判断了 */
function decorate(record) {
  const def = getType(record.type);
  if (!def) {
    return Object.assign({}, record, {
      icon: '📝',
      color: '#9AA0A6',
      soft: 'rgba(154,160,166,0.12)',
      typeName: '未知',
      title: record.type,
      sub: '',
      valueText: ''
    });
  }
  const titleValue = def.titleField ? record.fields[def.titleField] : '';
  return Object.assign({}, record, {
    icon: def.icon,
    color: def.color,
    soft: def.soft,
    typeName: def.name,
    title: titleValue || def.name,
    sub: subTextOf(def, record),
    valueText: formatValue(def, record.value)
  });
}

function decorateMany(list) {
  return list.map(decorate);
}

/** 按日期分组：[{ date, label, items, count }] */
function groupByDate(decoratedList) {
  const map = {};
  const order = [];
  decoratedList.forEach(r => {
    if (!map[r.date]) {
      map[r.date] = { date: r.date, label: dateUtil.friendlyDate(r.date), items: [], count: 0 };
      order.push(r.date);
    }
    map[r.date].items.push(r);
    map[r.date].count += 1;
  });
  return order.map(d => map[d]);
}

/* ---------------- 首页看板 ---------------- */

/**
 * 首页模块卡片
 * @param {string} dateStr
 * @returns {Array} [{ key, name, icon, color, soft, valueText, subText, empty }]
 */
function buildBoard(dateStr) {
  const settings = store.getSettings();
  const records = activeRecords();

  return settings.enabledTypes
    .map(key => {
      const def = getType(key);
      if (!def) return null;

      const sameType = records.filter(r => r.type === key);
      const dayList = sameType.filter(r => r.date === dateStr);

      // 指标型：取截至当天的最后一次，并给出与上次的差值
      if (def.primary.agg === 'last') {
        const upto = sameType.filter(r => r.date <= dateStr).sort(compareAsc);
        const last = upto[upto.length - 1];
        const prev = upto[upto.length - 2];
        let sub = '点一下记录';
        if (last && prev && last.value != null && prev.value != null) {
          const diff = Number(last.value) - Number(prev.value);
          if (diff === 0) sub = '与上次持平';
          else sub = (diff > 0 ? '↑ ' : '↓ ') + Math.abs(diff).toFixed(1);
        } else if (last) {
          sub = '首次记录';
        }
        return {
          key: key,
          name: def.name,
          icon: def.icon,
          color: def.color,
          soft: def.soft,
          valueText: last ? formatValue(def, last.value) : '未记录',
          subText: sub,
          empty: !last
        };
      }

      // 事件型：当天求和
      const sum = dayList.reduce((s, r) => s + (Number(r.value) || 0), 0);
      return {
        key: key,
        name: def.name,
        icon: def.icon,
        color: def.color,
        soft: def.soft,
        valueText: sum ? formatValue(def, sum) : '未记录',
        subText: dayList.length ? dayList.length + ' 条记录' : '点一下记录',
        empty: !sum
      };
    })
    .filter(Boolean);
}

/* ---------------- 图表数据 ---------------- */

/**
 * 近 N 天趋势
 * @returns {Array} [{ date, label, value, text, count }]
 */
function series(typeKey, days) {
  const def = getType(typeKey);
  if (!def) return [];
  const dates = dateUtil.recentDays(days);
  const records = activeRecords().filter(r => r.type === typeKey);

  return dates.map(d => {
    const dayList = records.filter(r => r.date === d).sort(compareAsc);
    let value = null;
    if (dayList.length) {
      if (def.primary.agg === 'last') {
        const last = dayList[dayList.length - 1];
        value = last.value == null ? null : Number(last.value);
      } else {
        value = dayList.reduce((s, r) => s + (Number(r.value) || 0), 0);
      }
    }
    const parts = d.split('-');
    return {
      date: d,
      label: String(Number(parts[2])),
      value: value,
      text: value == null ? '' : formatValue(def, value),
      count: dayList.length
    };
  });
}

/**
 * 指标卡：合计 / 日均 / 次数 / 最高
 */
function statsOf(typeKey, days) {
  const def = getType(typeKey);
  const data = series(typeKey, days);
  const values = data.filter(d => d.value !== null).map(d => d.value);
  const recordedDays = values.length;

  if (def.primary.agg === 'last') {
    const mean = recordedDays ? values.reduce((a, b) => a + b, 0) / recordedDays : 0;
    const max = recordedDays ? Math.max.apply(null, values) : 0;
    const min = recordedDays ? Math.min.apply(null, values) : 0;
    return {
      mode: 'mean',
      cards: [
        { label: '平均', value: recordedDays ? formatValue(def, Number(mean.toFixed(1))) : '-' },
        { label: '最高', value: recordedDays ? formatValue(def, max) : '-' },
        { label: '最低', value: recordedDays ? formatValue(def, min) : '-' },
        { label: '记录天数', value: recordedDays + ' 天' }
      ]
    };
  }

  const total = values.reduce((a, b) => a + b, 0);
  const count = data.reduce((s, d) => s + d.count, 0);
  return {
    mode: 'sum',
    cards: [
      { label: '合计', value: formatValue(def, total) },
      { label: '日均', value: formatValue(def, Number((total / days).toFixed(1))) },
      { label: '次数', value: count + ' 次' },
      { label: '有记录', value: recordedDays + ' 天' }
    ]
  };
}

/**
 * 分类分布：取该类型的第一个 picker 字段做维度
 * @returns {Array} [{ label, value, text, percent }]
 */
function distribution(typeKey, start, end) {
  const def = getType(typeKey);
  if (!def) return [];
  const field = (def.fields || []).find(f => f.type === 'picker');
  if (!field) return [];

  const list = query({ type: typeKey, start: start, end: end });
  const map = {};
  list.forEach(r => {
    const label = r.fields[field.key] || '未分类';
    map[label] = (map[label] || 0) + (Number(r.value) || 0);
  });

  const total = Object.keys(map).reduce((s, k) => s + map[k], 0);
  return Object.keys(map)
    .map(label => ({
      label: label,
      value: map[label],
      text: formatValue(def, map[label]),
      percent: total ? Math.round((map[label] / total) * 100) : 0
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

/** 某月支出合计（预算用） */
function monthTotal(typeKey, monthStr) {
  const def = getType(typeKey);
  const range = dateUtil.monthRange(monthStr);
  const list = query({ type: typeKey, start: range.start, end: range.end });
  const sum = list.reduce((s, r) => s + (Number(r.value) || 0), 0);
  return { value: sum, text: def ? formatValue(def, sum) : String(sum), count: list.length };
}

module.exports = {
  activeRecords,
  add,
  update,
  remove,
  get,
  query,
  decorate,
  decorateMany,
  groupByDate,
  buildBoard,
  series,
  statsOf,
  distribution,
  monthTotal,
  listTypes
};

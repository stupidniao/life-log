/**
 * 日期工具：全部以 'YYYY-MM-DD' 字符串为唯一交换格式
 * 注意：不要用 new Date('2026-10-19') 直接解析，iOS 上存在兼容问题，
 * 统一走 parseDate() 手动拆分。
 */

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** Date -> 'YYYY-MM-DD' */
function formatDate(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

/** 'YYYY-MM-DD' -> Date（本地时区 00:00） */
function parseDate(str) {
  const parts = String(str).split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/** 今天 'YYYY-MM-DD' */
function today() {
  return formatDate(new Date());
}

/** 当前时间 'HH:mm' */
function nowTime() {
  const d = new Date();
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** 日期加减天数 */
function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

/** 月份加减，monthStr 形如 '2026-10' */
function addMonths(monthStr, n) {
  const parts = monthStr.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1 + n, 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}

/** 某月的起止日期 */
function monthRange(monthStr) {
  const parts = monthStr.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const start = y + '-' + pad(m) + '-01';
  const lastDay = new Date(y, m, 0).getDate();
  const end = y + '-' + pad(m) + '-' + pad(lastDay);
  return { start, end };
}

/** 近 N 天（含今天）的日期数组，升序 */
function recentDays(n) {
  const arr = [];
  const t = today();
  for (let i = n - 1; i >= 0; i--) {
    arr.push(addDays(t, -i));
  }
  return arr;
}

/** 星期几 */
function weekdayCn(dateStr) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return names[parseDate(dateStr).getDay()];
}

/** 友好标题：今天/昨天/10月18日 周六 */
function friendlyDate(dateStr) {
  const t = today();
  if (dateStr === t) return '今天';
  if (dateStr === addDays(t, -1)) return '昨天';
  const parts = dateStr.split('-');
  return Number(parts[1]) + '月' + Number(parts[2]) + '日 ' + weekdayCn(dateStr);
}

/** 顶部日期文案：2026年10月19日 周一 */
function headerDate(dateStr) {
  const parts = dateStr.split('-');
  return Number(parts[0]) + '年' + Number(parts[1]) + '月' + Number(parts[2]) + '日 ' + weekdayCn(dateStr);
}

/** 按月显示：2026年10月 */
function monthLabel(monthStr) {
  const parts = monthStr.split('-');
  return Number(parts[0]) + '年' + Number(parts[1]) + '月';
}

module.exports = {
  pad,
  formatDate,
  parseDate,
  today,
  nowTime,
  addDays,
  addMonths,
  monthRange,
  recentDays,
  weekdayCn,
  friendlyDate,
  headerDate,
  monthLabel
};

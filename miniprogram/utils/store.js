/**
 * 存储层：M1 阶段全部走本地 Storage，接口按「异步」设计，
 * 后续切云开发时只替换本文件 + services/record.js 的内部实现，页面不用动。
 *
 * 容量说明：单 key 上限 10MB，本项目单条记录约 200 字节，
 * 5 万条以内本地无压力；超过 3000 条建议开启云同步（M2）。
 */

const KEYS = {
  RECORDS: 'life_log_records_v1',
  SETTINGS: 'life_log_settings_v1',
  PLANTS: 'life_log_plants_v1'
};

const DEFAULT_SETTINGS = {
  // 首页展示与录入页可选的模块
  enabledTypes: ['expense', 'income', 'exercise', 'weight', 'sleep', 'drink', 'reading'],
  // 记账月预算，0 表示不设置
  monthBudget: 0,
  // ---- 云同步（M2）----
  cloudSync: false,     // 总开关
  cloudEnv: '',         // 云开发环境 ID（也可写死在 app.js globalData.cloudEnv）
  lastSyncAt: 0,        // 拉取水位线（服务器时间）
  lastPushAt: 0,        // 推送水位线（客户端时间，防时钟偏差漏推）
  // ---- 植物档案云同步（REQ-003）：与记录独立的一对水位线 ----
  lastPlantSyncAt: 0,
  lastPlantPushAt: 0
};

let recordCache = null;
let settingsCache = null;
let plantCache = null;

function init() {
  if (recordCache === null) {
    recordCache = wx.getStorageSync(KEYS.RECORDS) || [];
    if (!Array.isArray(recordCache)) recordCache = [];
  }
  if (settingsCache === null) {
    const saved = wx.getStorageSync(KEYS.SETTINGS) || {};
    settingsCache = Object.assign({}, DEFAULT_SETTINGS, saved);
  }
  if (plantCache === null) {
    plantCache = wx.getStorageSync(KEYS.PLANTS) || [];
    if (!Array.isArray(plantCache)) plantCache = [];
  }
}

/** 同步取全部记录（已按时间倒序） */
function allRecords() {
  init();
  return recordCache;
}

/** 覆盖写入全部记录 */
function saveRecords(list) {
  const previous = recordCache;
  recordCache = list;
  try {
    wx.setStorageSync(KEYS.RECORDS, list);
  } catch (err) {
    // 写入失败必须回滚内存态，否则会出现「界面显示保存成功、重启后丢失」的假象。
    // 错误向上抛，由页面层决定怎么提示（存储层不弹 UI）。
    recordCache = previous;
    console.error('[store] 写入失败，可能超出本地存储上限', err);
    throw err;
  }
}

function getSettings() {
  init();
  return settingsCache;
}

function patchSettings(patch) {
  init();
  settingsCache = Object.assign({}, settingsCache, patch);
  wx.setStorageSync(KEYS.SETTINGS, settingsCache);
  return settingsCache;
}

/** 清空全部记录（保留设置） */
function clearRecords() {
  saveRecords([]);
}

/* ---------------- 绿植档案（REQ-001） ---------------- */

/** 同步取全部植物档案（含软删除） */
function allPlants() {
  init();
  return plantCache;
}

/** 覆盖写入全部植物档案，写失败回滚内存态（与 saveRecords 同款纪律） */
function savePlants(list) {
  const previous = plantCache;
  plantCache = list;
  try {
    wx.setStorageSync(KEYS.PLANTS, list);
  } catch (err) {
    plantCache = previous;
    console.error('[store] 绿植档案写入失败', err);
    throw err;
  }
}

module.exports = {
  KEYS,
  DEFAULT_SETTINGS,
  init,
  allRecords,
  saveRecords,
  getSettings,
  patchSettings,
  clearRecords,
  allPlants,
  savePlants
};

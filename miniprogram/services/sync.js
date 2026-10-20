/**
 * 云同步服务
 *
 * 模型：本地 Storage 是唯一工作副本，云端是备份 + 多设备共享层。
 * 每次同步 = push（本地新增/修改 → 云）+ pull（云端新增/修改 → 本地），增量、双向。
 *
 * 两条水位线（防手机时钟偏差）：
 * - lastSyncAt（服务器时间）—— 决定拉什么。服务器时钟可信。
 * - lastPushAt（客户端时间）—— 决定推什么。推的判断必须用客户端时间对比客户端写的 updatedAt，
 *   如果错用服务器时间，手机时钟慢 5 分钟就会导致新记录永远"已同步过"而漏推。
 *
 * 冲突规则：单用户多设备，last-write-wins（updatedAt 大者胜）；拉下来的记录若本地有更新的
 * 未推送修改，保留本地（下次同步会推上去）。
 */
const store = require('../utils/store');

const CLOUD_FUNCTION = 'records';
const PUSH_DEBOUNCE = 2000;   // 写操作后 2s 防抖，连记几条只触发一次同步
const MAX_PUSH = 200;         // 单次上行上限，防云函数超时

let syncing = false;
let pushTimer = null;
let cloudInited = false;

/* ---------------- 开关与配置 ---------------- */

function getCloudEnv() {
  const app = typeof getApp === 'function' ? getApp() : null;
  const fromSettings = store.getSettings().cloudEnv;
  return fromSettings || (app && app.globalData && app.globalData.cloudEnv) || '';
}

/** 云同步可用：填了环境 ID + 打开了开关 + 运行环境支持 wx.cloud */
function isReady() {
  return !!getCloudEnv() && !!store.getSettings().cloudSync && !!wx.cloud;
}

/** wx.cloud.init 只允许调一次 */
function ensureInit() {
  if (cloudInited) return true;
  const env = getCloudEnv();
  if (!env || !wx.cloud) return false;
  wx.cloud.init({ env: env, traceUser: true });
  cloudInited = true;
  return true;
}

/* ---------------- 纯逻辑（可测试） ---------------- */

/**
 * 计算需要上行的记录：updatedAt > 客户端推水位线（含软删除，删除也要同步）
 */
function computePushes(allRecords, lastPushAt) {
  return (allRecords || []).filter(r => (r.updatedAt || 0) > (lastPushAt || 0));
}

/**
 * 下行合并：按 id 去重；本地存在更新的未推送修改时保留本地
 */
function mergePulls(localRecords, pulls) {
  const map = {};
  (localRecords || []).forEach(r => { map[r.id] = r; });
  (pulls || []).forEach(p => {
    if (!p || !p.id) return;
    const local = map[p.id];
    if (local && (local.updatedAt || 0) > (p.updatedAt || 0)) return;
    map[p.id] = p;
  });
  return Object.keys(map).map(k => map[k]);
}

/* ---------------- 绿植档案同步（REQ-003） ---------------- */

/**
 * 计算需要上行的植物档案：updatedAt > 植物推水位线（含软删除）。
 * 与 computePushes 同款语义，只是数据源换成植物。
 */
function computePlantPushes(allPlants, lastPlantPushAt) {
  return (allPlants || []).filter(p => (p.updatedAt || 0) > (lastPlantPushAt || 0));
}

/**
 * 植物下行合并：按 id 去重；本地存在更新的未推送修改时保留本地。
 * 云端的 photoFileID 为空时不覆盖本地已有的 fileID（避免空值回写丢照片）。
 */
function mergePlantPulls(localPlants, pulls) {
  const map = {};
  (localPlants || []).forEach(p => { map[p.id] = p; });
  (pulls || []).forEach(d => {
    if (!d || !d.id) return;
    const local = map[d.id];
    if (local && (local.updatedAt || 0) > (d.updatedAt || 0)) return;
    map[d.id] = cloudDocToPlant(d, local);
  });
  return Object.keys(map).map(k => map[k]);
}

/**
 * 本地档案 → 云端文档：fileID 提到平铺字段 photoFileID，localPath 一律剥离
 * （本地临时路径跨设备无意义，绝不能上云）。
 */
function plantToCloudDoc(plant) {
  const p = plant || {};
  const doc = {
    id: p.id,
    name: p.name,
    species: p.species,
    speciesKey: p.speciesKey,
    emoji: p.emoji,
    photoFileID: (p.photo && p.photo.fileID) || '',
    care: p.care,
    health: p.health,
    issues: p.issues,
    tips: p.tips,
    confidence: p.confidence,
    source: p.source,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deleted: p.deleted
  };
  return doc;
}

/**
 * 云端文档 → 本地档案：photoFileID 还原为 photo.fileID，localPath 置空。
 * @param {object} doc 云端文档
 * @param {object} [local] 本地已存在档案（用于 fileID 空值时兜底，避免覆盖丢照片）
 */
function cloudDocToPlant(doc, local) {
  const d = doc || {};
  const existingFileID = (local && local.photo && local.photo.fileID) || '';
  const fileID = d.photoFileID || existingFileID;
  return {
    id: d.id,
    name: d.name,
    species: d.species,
    speciesKey: d.speciesKey,
    emoji: d.emoji,
    photo: { fileID: fileID || '', localPath: '' },
    care: d.care,
    health: d.health,
    issues: d.issues,
    tips: d.tips,
    confidence: d.confidence,
    source: d.source,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    deleted: d.deleted
  };
}

/* ---------------- 同步主流程 ---------------- */

/**
 * 执行一次同步。未开启 / 未配置时静默跳过。
 * @returns {Promise<{ok:boolean, skipped?:boolean, pushed?:number, pulled?:number, error?:Error}>}
 */
async function syncNow() {
  if (syncing) return { ok: false, skipped: true, busy: true };
  if (!isReady() || !ensureInit()) return { ok: false, skipped: true };

  syncing = true;
  try {
    const all = store.allRecords();          // 含软删除记录
    const plants = store.allPlants();        // 含软删除植物档案
    const settings = store.getSettings();
    const since = settings.lastSyncAt || 0;
    const lastPushAt = settings.lastPushAt || 0;
    const lastPlantSyncAt = settings.lastPlantSyncAt || 0;
    const lastPlantPushAt = settings.lastPlantPushAt || 0;

    const pushes = computePushes(all, lastPushAt).slice(0, MAX_PUSH);
    const plantPushes = computePlantPushes(plants, lastPlantPushAt)
      .slice(0, MAX_PUSH)
      .map(plantToCloudDoc);
    const res = await wx.cloud.callFunction({
      name: CLOUD_FUNCTION,
      data: {
        action: 'sync',
        pushes: pushes,
        lastSyncAt: since,
        plants: plantPushes,
        lastPlantSyncAt: lastPlantSyncAt
      }
    });

    const r = res && res.result;
    if (!r || r.code !== 0) {
      throw new Error((r && r.message) || '云函数返回异常');
    }

    // 合并下行（本地更新的胜出），写回本地缓存
    const merged = mergePulls(all, r.pulls || []);
    store.saveRecords(merged);

    // 植物下行：云端 photoFileID 还原为 photo.fileID，合并后写回
    if (r.plants && r.plants.length) {
      const mergedPlants = mergePlantPulls(plants, r.plants);
      store.savePlants(mergedPlants);
    }

    // 双水位线（记录）：拉取用服务器时钟；推水位线取"本次推送记录中最大的客户端 updatedAt"
    const patch = { lastSyncAt: r.serverTime };
    if (pushes.length) {
      const maxPushed = Math.max.apply(null, pushes.map(x => x.updatedAt || 0));
      patch.lastPushAt = Math.max(lastPushAt, maxPushed);
    }
    // 植物独立水位线（REQ-003）：与记录互不干扰
    patch.lastPlantSyncAt = r.serverTime;
    if (plantPushes.length) {
      const maxPlantPushed = Math.max.apply(null, plantPushes.map(x => x.updatedAt || 0));
      patch.lastPlantPushAt = Math.max(lastPlantPushAt, maxPlantPushed);
    }
    store.patchSettings(patch);

    return {
      ok: true,
      pushed: pushes.length,
      pulled: (r.pulls || []).length,
      plantPushed: plantPushes.length,
      plantPulled: (r.plants || []).length
    };
  } catch (err) {
    console.error('[sync] 同步失败', err);
    return { ok: false, error: err };
  } finally {
    syncing = false;
  }
}

/** 写操作后的防抖同步（record 服务在增/改/删后调用） */
function scheduleSync() {
  if (!isReady()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    syncNow();
  }, PUSH_DEBOUNCE);
}

/** 是否正在同步中（UI 可用来显示状态） */
function isSyncing() {
  return syncing;
}

module.exports = {
  isReady,
  syncNow,
  scheduleSync,
  isSyncing,
  computePushes,
  mergePulls,
  computePlantPushes,
  mergePlantPulls,
  plantToCloudDoc,
  cloudDocToPlant,
  // 供其他服务（如绿植识别）复用：环境 ID 读取与一次性云初始化
  getCloudEnv,
  ensureInit
};

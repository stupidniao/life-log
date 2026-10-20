/**
 * 绿植服务（REQ-001）
 *
 * 页面只跟这一层打交道：
 * - 档案 CRUD（本地 Storage，软删除，与 records 同款纪律）
 * - 三种建档来源：createFromAnalysis（AI）/ createManual（手选知识库）/ 手动输入
 * - 拍照识别流程：压缩 → 本地副本 → 云存储 → 云函数 plantAI
 *
 * 降级承诺：无云环境 / 识别失败都不抛错阻断，返回 analysis: null 由页面走手选。
 */
const store = require('../utils/store');
const plantCare = require('../utils/plantCare');
const sync = require('./sync');

const CLOUD_FUNCTION = 'plantAI';

/** 同毫秒内单调递增的序号，保证 id 字典序 = 创建顺序（列表排序的平局裁判） */
let idSeq = 0;

function genId() {
  idSeq = (idSeq + 1) % 1296; // 36^2，两位 36 进制
  const s = idSeq < 36 ? '0' + idSeq.toString(36) : idSeq.toString(36);
  return 'p' + Date.now().toString(36) + s;
}

/* ---------------- 档案 CRUD ---------------- */

function activePlants() {
  return store.allPlants().filter(function (p) { return !p.deleted; });
}

/** 列表，新建在前（同毫秒建档按 id 字典序，见 genId） */
function list() {
  return activePlants().sort(function (a, b) {
    const ca = a.createdAt || 0;
    const cb = b.createdAt || 0;
    if (cb !== ca) return cb - ca;
    return a.id < b.id ? 1 : (a.id > b.id ? -1 : 0);
  });
}

function get(id) {
  return activePlants().find(function (p) { return p.id === id; }) || null;
}

function add(draft) {
  const now = Date.now();
  const plant = Object.assign({
    id: genId(),
    name: '',
    species: '',
    speciesKey: '',
    emoji: '🪴',
    photo: { fileID: '', localPath: '' },
    care: plantCare.normalizeCare(null, null),
    health: '',
    issues: [],
    tips: [],
    confidence: 0,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    deleted: false
  }, draft, { id: draft.id || genId() });

  const all = store.allPlants().slice();
  all.push(plant);
  store.savePlants(all);
  sync.scheduleSync();
  return plant;
}

function update(id, patch) {
  const all = store.allPlants().slice();
  const idx = all.findIndex(function (p) { return p.id === id && !p.deleted; });
  if (idx === -1) return null;
  all[idx] = Object.assign({}, all[idx], patch, { updatedAt: Date.now() });
  store.savePlants(all);
  sync.scheduleSync();
  return all[idx];
}

function remove(id) {
  const all = store.allPlants().slice();
  const idx = all.findIndex(function (p) { return p.id === id; });
  if (idx === -1) return false;
  all[idx] = Object.assign({}, all[idx], { deleted: true, updatedAt: Date.now() });
  store.savePlants(all);
  sync.scheduleSync();
  return true;
}

/* ---------------- 建档来源 ---------------- */

/** 手选知识库品种建档（无 AI 降级路径） */
function createManual(speciesName, photo) {
  const entry = plantCare.findByName(speciesName);
  return add({
    name: entry ? entry.name : speciesName,
    species: speciesName,
    speciesKey: entry ? entry.key : '',
    emoji: entry ? entry.emoji : '🪴',
    photo: photo || { fileID: '', localPath: '' },
    care: plantCare.normalizeCare(null, entry),
    health: '',
    issues: [],
    tips: [],
    confidence: 0,
    source: entry ? 'library' : 'manual'
  });
}

/** 用 AI 识别结果建档：AI 方案优先，知识库补缺 */
function createFromAnalysis(analysis, photo) {
  const a = analysis || {};
  const entry = plantCare.findByName(a.species);
  return add({
    name: entry ? entry.name : (a.species || '未命名植物'),
    species: a.species || '',
    speciesKey: entry ? entry.key : '',
    emoji: entry ? entry.emoji : '🪴',
    photo: photo || { fileID: '', localPath: '' },
    care: plantCare.normalizeCare(a.care, entry),
    health: a.health || '',
    issues: plantCare.normalizeIssues(a.issues),
    tips: plantCare.normalizeTips(a.tips),
    confidence: Number(a.confidence) || 0,
    source: 'ai'
  });
}

/** 改品种：方案整体换成新品种，健康诊断与问题列表保留 */
function changeSpecies(id, speciesName) {
  const entry = plantCare.findByName(speciesName);
  return update(id, {
    species: speciesName,
    speciesKey: entry ? entry.key : '',
    emoji: entry ? entry.emoji : '🪴',
    care: plantCare.normalizeCare(null, entry),
    confidence: 0,
    source: entry ? 'library' : 'manual'
  });
}

/* ---------------- 拍照识别流程 ---------------- */

/** 云识别可用：填了环境 ID 且运行环境支持 wx.cloud */
function aiAvailable() {
  return !!(sync.getCloudEnv() && typeof wx !== 'undefined' && wx.cloud);
}

function compress(src) {
  return new Promise(function (resolve) {
    if (!wx.compressImage) return resolve(src);
    // 关键：仅 quality 压不缩尺寸，手机照片几千万像素，base64 仍会上 MB。
    // 用 compressedWidth/Height 把最长边压到 1280px（基础库 ≥2.26.0），模型识别足够。
    wx.compressImage({
      src: src,
      quality: 70,
      compressedWidth: 1280,
      compressedHeight: 1280,
      success: function (r) { resolve(r.tempFilePath); },
      fail: function () {
        // 老基础库不支持尺寸参数时退回纯质量压缩
        wx.compressImage({
          src: src,
          quality: 70,
          success: function (r2) { resolve(r2.tempFilePath); },
          fail: function () { resolve(src); }
        });
      }
    });
  });
}

/** 存本地持久副本：tempFilePath 重启即失效，靠它离线也能看照片 */
function saveLocal(src) {
  return new Promise(function (resolve) {
    if (!wx.saveFile) return resolve('');
    wx.saveFile({
      tempFilePath: src,
      success: function (r) { resolve(r.savedFilePath); },
      fail: function () { resolve(''); }
    });
  });
}

function uploadToCloud(src) {
  return new Promise(function (resolve, reject) {
    const cloudPath = 'plants/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: src,
      success: function (r) { resolve(r.fileID); },
      fail: reject
    });
  });
}

/**
 * 拍照识别主流程
 * @param {string} tempFilePath chooseMedia 的临时路径
 * @returns {Promise<{photo:{fileID,localPath}, analysis:object|null, reason?:string, error?:Error}>}
 *   任何失败都不 reject，统一降级为 analysis: null，由页面决定提示与手选
 */
async function analyzePhoto(tempFilePath) {
  const compressed = await compress(tempFilePath);
  const photo = { fileID: '', localPath: compressed };

  if (!aiAvailable() || !sync.ensureInit()) {
    // 无云：先存本地副本，离线也能看照片
    photo.localPath = await saveLocal(compressed) || compressed;
    return { photo: photo, analysis: null, reason: 'no-cloud' };
  }

  try {
    // 先上传云存储，再 saveFile 存档。顺序很关键：saveFile 会消耗临时文件，
    // 若先 saveFile 再用临时路径 uploadFile 会报 createUploadTask:fail file not found
    let fileID;
    try {
      fileID = await uploadToCloud(compressed);
      photo.fileID = fileID;
    } catch (upErr) {
      console.error('[plant] 上传云存储失败', upErr);
      // 上传失败也要留本地副本，用户仍可手动建档
      photo.localPath = await saveLocal(compressed) || compressed;
      return { photo: photo, analysis: null, reason: 'upload-failed', error: upErr };
    }

    // 上传成功后存本地持久副本（兜底显示）
    photo.localPath = await saveLocal(compressed) || compressed;

    const res = await wx.cloud.callFunction({
      name: CLOUD_FUNCTION,
      data: { action: 'analyze', fileID: fileID }
    });
    const r = res && res.result;
    if (!r || r.code !== 0) {
      throw new Error((r && r.message) || '云函数返回异常');
    }
    return { photo: photo, analysis: r.data, provider: r.provider, model: r.model };
  } catch (err) {
    console.error('[plant] 识别失败', err);
    return { photo: photo, analysis: null, reason: 'ai-failed', error: err };
  }
}

module.exports = {
  list,
  get,
  add,
  update,
  remove,
  createManual,
  createFromAnalysis,
  changeSpecies,
  aiAvailable,
  analyzePhoto
};

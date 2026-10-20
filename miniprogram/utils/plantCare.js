/**
 * 绿植养护知识库与方案归一化（REQ-001）
 *
 * 职责：
 * 1. 内置 24 种常见室内植物的养护方案 —— 无 AI 时的完整方案来源
 * 2. AI 返回方案的「字段补缺 + 数值夹取」—— 模型常漏结构化字段（尤其 waterDays）
 * 3. 详情页建议条目组装
 *
 * 纯函数、零 wx 依赖，可在 Node 里单测（tests/plant-care.test.js）。
 * 合规注意：毒性字段只写「避免误食」，不出现药用/食用表述。
 */

const DEFAULT_CARE = {
  light: '',
  water: '',
  waterDays: 7,
  temp: '',
  humidity: '',
  fertilizer: '',
  soil: '',
  toxicity: ''
};

const MIN_WATER_DAYS = 1;
const MAX_WATER_DAYS = 60;

/* ---------------- 知识库 ---------------- */

const LIBRARY = [
  {
    key: 'pothos', name: '绿萝', emoji: '🌿',
    alias: ['黄金葛', '魔鬼藤', 'Epipremnum', 'aureum'],
    light: '明亮散射光，避免强光直射', water: '土表干 2-3 cm 后浇透', waterDays: 5,
    temp: '18-28℃', humidity: '中', fertilizer: '春秋每月一次稀薄液肥',
    soil: '疏松透气的营养土', toxicity: '汁液微毒，避免宠物和儿童误食'
  },
  {
    key: 'spider', name: '吊兰', emoji: '🌾',
    alias: ['垂盆草', 'Chlorophytum', 'comosum'],
    light: '明亮散射光，耐半阴', water: '土表干了浇透，忌积水', waterDays: 5,
    temp: '15-25℃', humidity: '中', fertilizer: '生长期每月一次',
    soil: '疏松透气、排水好', toxicity: '无毒'
  },
  {
    key: 'snake', name: '虎尾兰', emoji: '🗡️',
    alias: ['虎皮兰', 'Sansevieria', '金边虎尾兰'],
    light: '充足光线，也耐阴', water: '干透浇透，宁干勿湿', waterDays: 14,
    temp: '18-30℃', humidity: '低', fertilizer: '春秋各一次缓释肥',
    soil: '沙质土、颗粒占比高', toxicity: '无毒'
  },
  {
    key: 'monstera', name: '龟背竹', emoji: '🍃',
    alias: ['蓬莱蕉', 'Monstera', 'deliciosa'],
    light: '明亮散射光，忌暴晒', water: '土表微干即浇，保持微润', waterDays: 4,
    temp: '20-30℃', humidity: '高，可常喷叶面水', fertilizer: '生长期每月一次',
    soil: '腐叶土 + 珍珠岩', toxicity: '汁液有刺激性，避免误食'
  },
  {
    key: 'lyrata', name: '琴叶榕', emoji: '🌳',
    alias: ['琴叶橡皮树', 'Ficus', 'lyrata'],
    light: '充足明亮光线，可接受直射', water: '表层 3 cm 干后浇透', waterDays: 7,
    temp: '20-30℃', humidity: '中', fertilizer: '生长期每月一次',
    soil: '疏松透气、排水好', toxicity: '汁液微毒'
  },
  {
    key: 'rubber', name: '橡皮树', emoji: '🌴',
    alias: ['印度榕', '印度胶树', 'Ficus elastica'],
    light: '明亮光线，耐半阴', water: '土干透一半再浇透', waterDays: 7,
    temp: '18-28℃', humidity: '中', fertilizer: '春夏每月一次',
    soil: '疏松肥沃营养土', toxicity: '汁液微毒'
  },
  {
    key: 'money', name: '发财树', emoji: '💰',
    alias: ['马拉巴栗', 'Pachira', '瓜栗'],
    light: '明亮散射光，耐阴', water: '宁干勿湿，土全干再浇', waterDays: 12,
    temp: '18-30℃', humidity: '中', fertilizer: '春秋少量缓释肥',
    soil: '沙质土，排水极好', toxicity: '无毒'
  },
  {
    key: 'areca', name: '散尾葵', emoji: '🎍',
    alias: ['黄椰子', 'Areca', 'Dypsis'],
    light: '明亮散射光', water: '保持盆土微润，忌干透', waterDays: 3,
    temp: '20-28℃', humidity: '高，常喷水', fertilizer: '生长期每月一次',
    soil: '腐叶土 + 河沙', toxicity: '无毒'
  },
  {
    key: 'peace', name: '白掌', emoji: '🤍',
    alias: ['一帆风顺', '白鹤芋', 'Spathiphyllum'],
    light: '半阴，忌直射', water: '土表干了浇透，稍耐旱', waterDays: 4,
    temp: '18-28℃', humidity: '高', fertilizer: '生长期每月一次',
    soil: '保水但透气的营养土', toxicity: '汁液微毒'
  },
  {
    key: 'anthurium', name: '红掌', emoji: '❤️',
    alias: ['花烛', 'Anthurium', '安祖花'],
    light: '明亮散射光', water: '土表微干浇透，忌积水', waterDays: 4,
    temp: '20-28℃', humidity: '高', fertilizer: '花期每两周一次磷钾肥',
    soil: '水苔或疏松基质', toxicity: '汁液有刺激性'
  },
  {
    key: 'asparagus', name: '文竹', emoji: '🌿',
    alias: ['云片竹', 'Asparagus', 'setaceus'],
    light: '散射光，忌暴晒', water: '保持微润，忌过干过湿', waterDays: 3,
    temp: '15-25℃', humidity: '高，常喷叶面', fertilizer: '薄肥勤施，每月一次',
    soil: '腐叶土 + 河沙', toxicity: '无毒'
  },
  {
    key: 'aloe', name: '芦荟', emoji: '🌵',
    alias: ['库拉索芦荟', 'Aloe', 'vera'],
    light: '充足光照，耐晒', water: '干透浇透', waterDays: 12,
    temp: '15-30℃', humidity: '低', fertilizer: '春秋各一次',
    soil: '沙质土，排水极好', toxicity: '汁液勿入眼，过敏体质慎碰'
  },
  {
    key: 'cactus', name: '仙人球', emoji: '🌵',
    alias: ['仙人掌', 'Cactus', '草球'],
    light: '全日照最好', water: '干透浇透，冬季控水', waterDays: 15,
    temp: '15-32℃', humidity: '低', fertilizer: '生长季少量两次',
    soil: '颗粒土为主', toxicity: '刺扎手，摆放注意'
  },
  {
    key: 'succulent', name: '多肉', emoji: '🪴',
    alias: ['多肉植物', '景天科', '肉肉', 'Succulent'],
    light: '充足光照，适当直射', water: '干透浇透，通风好可频些', waterDays: 10,
    temp: '10-28℃，夏季注意通风', humidity: '低', fertilizer: '春秋各一次缓释肥',
    soil: '颗粒占比高的多肉土', toxicity: '多数无毒，大戟科有乳汁微毒'
  },
  {
    key: 'ivy', name: '常春藤', emoji: '🍀',
    alias: ['洋常春藤', 'Hedera'],
    light: '明亮散射光，耐阴', water: '土表干了浇透', waterDays: 4,
    temp: '15-25℃', humidity: '中，可喷水', fertilizer: '生长期每月一次',
    soil: '疏松透气营养土', toxicity: '果实和叶片误食会引起不适'
  },
  {
    key: 'bamboo', name: '富贵竹', emoji: '🎋',
    alias: ['转运竹', 'Dracaena', 'sanderiana'],
    light: '明亮散射光，耐阴', water: '水培 7-10 天换水，土培见干见湿', waterDays: 7,
    temp: '18-28℃', humidity: '中', fertilizer: '水培每月滴营养液',
    soil: '水培或疏松营养土', toxicity: '无毒'
  },
  {
    key: 'jasmine', name: '茉莉', emoji: '🤍',
    alias: ['茉莉花', 'Jasminum', 'sambac'],
    light: '全日照，越晒花越香', water: '见干见湿，花期不缺水', waterDays: 2,
    temp: '20-35℃', humidity: '中', fertilizer: '花期每周磷钾肥',
    soil: '微酸性疏松土', toxicity: '无毒'
  },
  {
    key: 'gardenia', name: '栀子花', emoji: '🌼',
    alias: ['栀子', 'Gardenia', 'jasminoides'],
    light: '充足光照，夏季遮午晒', water: '喜酸水，土表干即浇', waterDays: 3,
    temp: '18-28℃', humidity: '高', fertilizer: '生长期硫酸亚铁 + 磷钾肥',
    soil: '微酸性腐叶土', toxicity: '无毒'
  },
  {
    key: 'mint', name: '薄荷', emoji: '🌱',
    alias: ['留兰香', 'Mentha'],
    light: '充足光照，耐晒', water: '喜水，土表干就浇', waterDays: 2,
    temp: '15-30℃', humidity: '中', fertilizer: '每月一次稀薄氮肥',
    soil: '保水的普通营养土', toxicity: '无毒'
  },
  {
    key: 'rosemary', name: '迷迭香', emoji: '🌿',
    alias: ['Rosmarinus', 'Salvia', 'rosmarinus'],
    light: '全日照', water: '土干透再浇，忌湿', waterDays: 7,
    temp: '10-28℃', humidity: '低，通风要好', fertilizer: '春秋各一次',
    soil: '排水极好的沙质土', toxicity: '无毒'
  },
  {
    key: 'pennywort', name: '铜钱草', emoji: '🪙',
    alias: ['香菇草', 'Hydrocotyle', '水金钱'],
    light: '充足光照，耐晒', water: '半水培最好，宁湿勿干', waterDays: 1,
    temp: '15-30℃', humidity: '高', fertilizer: '每月一次稀薄液肥',
    soil: '水土各半或纯水培', toxicity: '无毒'
  },
  {
    key: 'maidenhair', name: '铁线蕨', emoji: '🌿',
    alias: ['Adiantum', '少女发丝'],
    light: '半阴，忌任何直射', water: '保持湿润，缺水立刻蔫', waterDays: 2,
    temp: '15-24℃', humidity: '极高，建议托盘垫水', fertilizer: '生长期薄肥每月一次',
    soil: '疏松保水腐叶土', toxicity: '无毒'
  },
  {
    key: 'calathea', name: '孔雀竹芋', emoji: '🦚',
    alias: ['竹芋', 'Calathea', '条纹竹芋'],
    light: '低到中等散射光，忌直射', water: '保持微润，用放过的水', waterDays: 3,
    temp: '18-28℃', humidity: '高，叶片常喷雾', fertilizer: '生长期每月一次',
    soil: '疏松保水基质', toxicity: '无毒，宠物友好'
  },
  {
    key: 'aglaonema', name: '万年青', emoji: '🎋',
    alias: ['广东万年青', 'Aglaonema', '粗肋草'],
    light: '耐阴，散射光最佳', water: '土表干 2-3 cm 再浇', waterDays: 6,
    temp: '18-28℃', humidity: '中', fertilizer: '春秋每月一次',
    soil: '疏松透气营养土', toxicity: '汁液微毒，避免误食'
  }
];

/* ---------------- 工具 ---------------- */

/** 压空白：多空格/换行压成单空格 */
function cleanText(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** 从任意值里提取 1~60 的整数天数，取不到返回 null */
function parseDays(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (isNaN(v) || v < MIN_WATER_DAYS) return null;
    return Math.min(Math.floor(v), MAX_WATER_DAYS);
  }
  const m = String(v).trim().match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < MIN_WATER_DAYS) return null;
  return Math.min(n, MAX_WATER_DAYS);
}

/* ---------------- 品种匹配 ---------------- */

/**
 * 从模型返回或用户输入的品种文本里匹配知识库条目
 * @param {string} text 如「绿萝（Epipremnum aureum）」
 * @returns {object|null}
 */
function findByName(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;
  let best = null;
  LIBRARY.forEach(function (e) {
    const names = [e.name].concat(e.alias || []);
    names.forEach(function (n) {
      const nl = String(n).toLowerCase();
      if (nl && t.indexOf(nl) > -1) {
        // 更长的命中更精确：'孔雀竹芋' 应赢过 '竹芋' 的别名
        if (!best || nl.length > best.len) best = { entry: e, len: nl.length };
      }
    });
  });
  return best ? best.entry : null;
}

function listNames() {
  return LIBRARY.map(function (e) { return e.name; });
}

/* ---------------- 方案归一化 ---------------- */

/**
 * 合并出最终养护方案：raw（AI/用户）有值优先，缺项回落知识库，全空用默认周期
 * @param {object|null} raw 形如 care 的脏数据
 * @param {object|null} entry findByName 的结果
 */
function normalizeCare(raw, entry) {
  const r = raw || {};
  const keys = ['light', 'water', 'temp', 'humidity', 'fertilizer', 'soil', 'toxicity'];
  const care = {};

  keys.forEach(function (k) {
    const v = cleanText(r[k]);
    care[k] = v || (entry ? cleanText(entry[k]) : '') || '';
  });

  const days = parseDays(r.waterDays);
  care.waterDays = days !== null
    ? days
    : (entry ? entry.waterDays : DEFAULT_CARE.waterDays);

  return care;
}

/* ---------------- 建议条目 ---------------- */

/**
 * 详情页消费：把 care 组装成有序展示条目，空项跳过
 * @returns {Array} [{ label, text }]
 */
function adviceItems(care) {
  const c = care || {};
  const items = [];
  if (cleanText(c.light)) items.push({ label: '光照', text: cleanText(c.light) });

  const water = cleanText(c.water);
  const days = Number(c.waterDays);
  const hasDays = days >= MIN_WATER_DAYS && days <= MAX_WATER_DAYS;
  if (water && hasDays) items.push({ label: '浇水', text: water + '，约每 ' + days + ' 天一次' });
  else if (water) items.push({ label: '浇水', text: water });
  else if (hasDays) items.push({ label: '浇水', text: '约每 ' + days + ' 天一次' });

  if (cleanText(c.temp)) items.push({ label: '温度', text: cleanText(c.temp) });
  if (cleanText(c.humidity)) items.push({ label: '湿度', text: cleanText(c.humidity) });
  if (cleanText(c.fertilizer)) items.push({ label: '施肥', text: cleanText(c.fertilizer) });
  if (cleanText(c.soil)) items.push({ label: '土壤', text: cleanText(c.soil) });
  if (cleanText(c.toxicity)) items.push({ label: '毒性', text: cleanText(c.toxicity) });
  return items;
}

/* ---------------- 展示辅助 ---------------- */

function healthTone(health) {
  if (health === '健康') return 'ok';
  if (health === '一般') return 'warn';
  if (health === '需关注') return 'danger';
  return 'muted';
}

function sourceLabel(source) {
  if (source === 'ai') return 'AI 识别';
  if (source === 'library') return '知识库';
  return '手动';
}

function confidenceText(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0 || n > 1) return '';
  return Math.round(n * 100) + '%';
}

/** issues 防御性归一：字符串转对象、滤空标题（云函数已归一，这里兜边界） */
function normalizeIssues(v) {
  if (!Array.isArray(v)) return [];
  return v.map(function (it) {
    if (typeof it === 'string') return { title: cleanText(it), detail: '' };
    if (it && typeof it === 'object') return { title: cleanText(it.title), detail: cleanText(it.detail) };
    return { title: '', detail: '' };
  }).filter(function (it) { return it.title.length > 0; });
}

/** tips 防御性归一：单字符串转数组、滤空 */
function normalizeTips(v) {
  if (typeof v === 'string') {
    const s = cleanText(v);
    return s ? [s] : [];
  }
  if (!Array.isArray(v)) return [];
  return v.map(function (t) { return cleanText(t); }).filter(function (t) { return t.length > 0; });
}

module.exports = {
  LIBRARY,
  DEFAULT_CARE,
  findByName,
  listNames,
  normalizeCare,
  adviceItems,
  healthTone,
  sourceLabel,
  confidenceText,
  normalizeIssues,
  normalizeTips
};

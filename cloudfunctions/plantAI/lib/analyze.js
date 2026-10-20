/**
 * plantAI 纯函数层：提示词、Provider 配置、模型返回解析与归一化
 * 零依赖（不含 wx-server-sdk），可在 Node 里单测（tests/plant-analyze.test.js）。
 */

const PROMPT = [
  '你是资深室内绿植养护专家。用户会给你一张家里的绿植照片，请识别品种并给出养护建议。',
  '只返回一个 JSON 对象，不要 markdown 围栏，不要任何多余文字。字段如下：',
  '{',
  '  "species": "品种中文名（可带拉丁学名）",',
  '  "confidence": 0到1的小数，识别置信度",',
  '  "health": "健康状态，只能是：健康 | 一般 | 需关注",',
  '  "care": {',
  '    "light": "光照需求，一句话",',
  '    "water": "浇水方法，一句话",',
  '    "waterDays": 浇水间隔天数，整数,',
  '    "temp": "适宜温度",',
  '    "humidity": "湿度需求",',
  '    "fertilizer": "施肥建议",',
  '    "soil": "土壤建议",',
  '    "toxicity": "毒性提示，只写避免误食类提醒，不写药用价值"',
  '  },',
  '  "issues": [{ "title": "从照片观察到的问题", "detail": "原因与处理建议" }],',
  '  "tips": ["一两句额外的养护提醒"]',
  '}',
  '注意：看不准的字段给空值，不要编造；issues 没有问题就给空数组。'
].join('\n');

const PROVIDERS = {
  // 两家都是 OpenAI 兼容的 chat/completions 协议，只差 baseURL 与默认模型
  zhipu: {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    defaultModel: 'glm-4v-flash'
  },
  dashscope: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-vl-max'
  }
};

function resolveProvider(name) {
  return PROVIDERS[name] || PROVIDERS.zhipu;
}

/* ---------------- 请求组装 ---------------- */

function buildMessages(base64) {
  return [
    { role: 'system', content: PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: '请识别这张绿植照片并给出养护建议。' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } }
      ]
    }
  ];
}

/* ---------------- 返回解析 ---------------- */

/**
 * 容错解析模型输出：剥围栏、截首尾大括号、解 {analysis:{...}} 包裹
 * @returns {object|null}
 */
function parseModelJson(text) {
  if (!text || typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let obj;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return null;
  }
  if (obj && typeof obj === 'object' && obj.analysis && typeof obj.analysis === 'object') {
    obj = obj.analysis;
  }
  return obj && typeof obj === 'object' ? obj : null;
}

/* ---------------- 归一化 ---------------- */

function cleanText(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** 去掉模型爱加的 markdown 强调符号 */
function cleanSpecies(v) {
  return cleanText(v).replace(/[*_`#]+/g, '').trim();
}

/** confidence 归一到 0~1：支持 '0.9'、0.9、95（视为百分数） */
function normalizeConfidence(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return 0;
  if (n > 1) return n <= 100 ? n / 100 : 1;
  return n;
}

const HEALTH_VALUES = ['健康', '一般', '需关注'];

function normalizeIssues(v) {
  if (!Array.isArray(v)) return [];
  return v.map(function (it) {
    if (typeof it === 'string') return { title: cleanText(it), detail: '' };
    if (it && typeof it === 'object') {
      return { title: cleanText(it.title), detail: cleanText(it.detail) };
    }
    return { title: '', detail: '' };
  }).filter(function (it) {
    return it.title.length > 0;
  });
}

function normalizeTips(v) {
  if (typeof v === 'string') {
    const s = cleanText(v);
    return s ? [s] : [];
  }
  if (!Array.isArray(v)) return [];
  return v.map(function (t) { return cleanText(t); }).filter(function (t) { return t.length > 0; });
}

/**
 * 把模型 JSON 归一成小程序端可直接消费的结构。
 * 端上的知识库（utils/plantCare.js）会再做一次补缺，所以这里缺字段给安全空值即可。
 */
function normalizeAnalysis(raw) {
  const r = raw || {};
  const c = (r.care && typeof r.care === 'object') ? r.care : {};

  const care = {};
  ['light', 'water', 'temp', 'humidity', 'fertilizer', 'soil', 'toxicity'].forEach(function (k) {
    care[k] = cleanText(c[k]);
  });

  // waterDays：提取整数并夹取 1~60；缺省给 0（= 未知，由端上知识库补默认值）
  const m = String(c.waterDays === undefined || c.waterDays === null ? '' : c.waterDays).match(/(\d+)/);
  let days = m ? parseInt(m[1], 10) : 0;
  if (isNaN(days) || days < 1) days = 0;
  if (days > 60) days = 60;
  care.waterDays = days;

  return {
    species: cleanSpecies(r.species),
    confidence: normalizeConfidence(r.confidence),
    health: HEALTH_VALUES.indexOf(r.health) > -1 ? r.health : '一般',
    care: care,
    issues: normalizeIssues(r.issues),
    tips: normalizeTips(r.tips)
  };
}

module.exports = {
  PROMPT,
  PROVIDERS,
  resolveProvider,
  buildMessages,
  parseModelJson,
  normalizeAnalysis
};

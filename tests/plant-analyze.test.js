/**
 * cloudfunctions/plantAI/lib/analyze.js 测试 —— 模型返回的解析与归一化
 * 模型输出是脏数据重灾区：markdown 围栏、前后废话、字符串数字、字段缺失，全要兜住。
 */
const path = require('path');
const { test, eq, ok, notOk } = require('./harness');
const analyze = require(path.join(__dirname, '../cloudfunctions/plantAI/lib/analyze'));

/* ---------------- JSON 解析 ---------------- */

test('解析：纯 JSON', function () {
  const r = analyze.parseModelJson('{"species":"绿萝"}');
  eq(r.species, '绿萝');
});

test('解析：markdown 围栏', function () {
  const r = analyze.parseModelJson('```json\n{"species":"绿萝"}\n```');
  eq(r.species, '绿萝');
});

test('解析：前后带废话', function () {
  const r = analyze.parseModelJson('好的，识别结果如下：{"species":"绿萝"} 希望对你有帮助');
  eq(r.species, '绿萝');
});

test('解析：{analysis:{...}} 包裹自动解包', function () {
  const r = analyze.parseModelJson('{"analysis":{"species":"龟背竹","care":{"waterDays":7}}}');
  eq(r.species, '龟背竹');
  eq(r.care.waterDays, 7);
});

test('解析：彻底不是 JSON 返回 null', function () {
  eq(analyze.parseModelJson('这盆植物看起来是绿萝'), null);
  eq(analyze.parseModelJson(''), null);
  eq(analyze.parseModelJson(null), null);
});

/* ---------------- 归一化 ---------------- */

test('归一化：标准输入原样通过', function () {
  const out = analyze.normalizeAnalysis({
    species: '绿萝',
    confidence: 0.86,
    health: '健康',
    care: { light: '散射光', water: '见干见湿', waterDays: 5 },
    issues: [{ title: '叶尖发黄', detail: '浇水过勤' }],
    tips: ['定期擦叶子']
  });
  eq(out.species, '绿萝');
  eq(out.confidence, 0.86);
  eq(out.care.waterDays, 5);
  eq(out.issues[0].title, '叶尖发黄');
  eq(out.tips[0], '定期擦叶子');
});

test('归一化：confidence 是字符串数字', function () {
  eq(analyze.normalizeAnalysis({ species: '绿萝', confidence: '0.9' }).confidence, 0.9);
});

test('归一化：confidence 超过 1 视为百分数', function () {
  eq(analyze.normalizeAnalysis({ species: '绿萝', confidence: 95 }).confidence, 0.95);
  eq(analyze.normalizeAnalysis({ species: '绿萝', confidence: 0 }).confidence, 0);
});

test('归一化：species 带 markdown 星号被清掉', function () {
  eq(analyze.normalizeAnalysis({ species: '**绿萝**' }).species, '绿萝');
  eq(analyze.normalizeAnalysis({ species: '虎尾兰 Sansevieria' }).species, '虎尾兰 Sansevieria');
});

test('归一化：species 缺失给空串，health 缺失兜为一般', function () {
  const out = analyze.normalizeAnalysis({});
  eq(out.species, '');
  eq(out.health, '一般');
});

test('归一化：health 枚举外的值兜为一般', function () {
  eq(analyze.normalizeAnalysis({ species: '绿萝', health: '非常糟糕' }).health, '一般');
});

test('归一化：issues 字符串数组转对象', function () {
  const out = analyze.normalizeAnalysis({ species: '绿萝', issues: ['叶尖发黄', '土太湿'] });
  eq(out.issues.length, 2);
  eq(out.issues[0].title, '叶尖发黄');
  eq(out.issues[0].detail, '');
});

test('归一化：issues 非数组给空数组', function () {
  eq(analyze.normalizeAnalysis({ species: '绿萝', issues: '没什么问题' }).issues, []);
  eq(analyze.normalizeAnalysis({ species: '绿萝' }).issues, []);
});

test('归一化：tips 单字符串转数组，非字符串给空数组', function () {
  eq(analyze.normalizeAnalysis({ species: '绿萝', tips: '多通风' }).tips, ['多通风']);
  eq(analyze.normalizeAnalysis({ species: '绿萝', tips: 42 }).tips, []);
});

test('归一化：care.waterDays 从文本提取并夹取', function () {
  eq(analyze.normalizeAnalysis({ species: '绿萝', care: { waterDays: '5天' } }).care.waterDays, 5);
  eq(analyze.normalizeAnalysis({ species: '绿萝', care: { waterDays: 999 } }).care.waterDays, 60);
  eq(analyze.normalizeAnalysis({ species: '绿萝', care: {} }).care.waterDays, 0, '缺省 0，由端上知识库补');
});

test('归一化：care 整体缺失不崩', function () {
  const out = analyze.normalizeAnalysis({ species: '绿萝' });
  eq(out.care.waterDays, 0);
  eq(out.care.light, '');
});

/* ---------------- 请求组装 ---------------- */

test('组装：消息结构含图片与系统提示词', function () {
  const msgs = analyze.buildMessages('QUJD');
  eq(msgs.length, 2);
  eq(msgs[0].role, 'system');
  ok(msgs[0].content.indexOf('JSON') > -1, 'system 里应强调只返回 JSON');
  eq(msgs[1].role, 'user');
  const img = msgs[1].content.filter(function (p) { return p.type === 'image_url'; })[0];
  eq(img.image_url.url, 'data:image/jpeg;base64,QUJD');
});

test('组装：system 提示词覆盖全部字段字典', function () {
  ['species', 'confidence', 'health', 'light', 'water', 'waterDays', 'issues', 'tips'].forEach(function (k) {
    ok(analyze.PROMPT.indexOf(k) > -1, '提示词缺字段 ' + k);
  });
});

/* ---------------- Provider 配置 ---------------- */

test('Provider：默认智谱，两家配置齐全', function () {
  ok(analyze.PROVIDERS.zhipu && analyze.PROVIDERS.dashscope);
  ok(analyze.PROVIDERS.zhipu.baseURL.indexOf('https://') === 0);
  ok(analyze.PROVIDERS.zhipu.defaultModel.length > 0);
  ok(analyze.PROVIDERS.dashscope.defaultModel.length > 0);
});

test('Provider：未知厂商兜回智谱', function () {
  const p = analyze.resolveProvider('不存在的厂商');
  eq(p.baseURL, analyze.PROVIDERS.zhipu.baseURL);
});

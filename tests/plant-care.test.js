/**
 * utils/plantCare.js 测试 —— 知识库匹配、方案归一化、建议条目组装
 * 范围：REQ-001（拍照注册与养护建议）。到期提醒相关逻辑属 REQ-002，届时另立测试文件。
 */
const path = require('path');
const { test, eq, ok, notOk } = require('./harness');
const plantCare = require(path.join(__dirname, '../miniprogram/utils/plantCare'));

/* ---------------- 知识库 ---------------- */

test('品种匹配：中文名带拉丁学名', function () {
  const entry = plantCare.findByName('绿萝（Epipremnum aureum）');
  ok(entry, '应命中绿萝');
  eq(entry.key, 'pothos');
});

test('品种匹配：纯拉丁名走别名', function () {
  eq(plantCare.findByName('Epipremnum aureum').key, 'pothos');
});

test('品种匹配：别名命中龟背竹', function () {
  eq(plantCare.findByName('龟背竹').key, 'monstera');
  eq(plantCare.findByName('蓬莱蕉').key, 'monstera');
});

test('品种匹配：多肉泛称命中多肉条目', function () {
  eq(plantCare.findByName('多肉植物').key, 'succulent');
});

test('品种匹配：未知品种返回 null', function () {
  notOk(plantCare.findByName('某种我不认识的植物'));
});

test('品种匹配：空值不崩', function () {
  notOk(plantCare.findByName(''));
  notOk(plantCare.findByName(null));
  notOk(plantCare.findByName(undefined));
});

test('知识库：至少 24 种，字段齐全', function () {
  ok(plantCare.LIBRARY.length >= 24, '条目数 ' + plantCare.LIBRARY.length);
  plantCare.LIBRARY.forEach(function (e) {
    ok(e.key && e.name, '缺 key/name');
    ok(typeof e.waterDays === 'number' && e.waterDays > 0, e.name + ' waterDays 非法');
    ok(e.light && e.water, e.name + ' 缺 light/water');
  });
});

test('知识库：key 唯一', function () {
  const seen = {};
  plantCare.LIBRARY.forEach(function (e) {
    notOk(seen[e.key], '重复 key ' + e.key);
    seen[e.key] = true;
  });
});

test('listNames 返回名称数组，与库等长', function () {
  const names = plantCare.listNames();
  eq(names.length, plantCare.LIBRARY.length);
  eq(names[0], plantCare.LIBRARY[0].name);
});

/* ---------------- 方案归一化 ---------------- */

test('归一化：AI 有值优先，缺项用知识库补', function () {
  const entry = plantCare.findByName('绿萝');
  const care = plantCare.normalizeCare(
    { light: '半阴处', waterDays: '', fertilizer: '每月一次' },
    entry
  );
  eq(care.light, '半阴处');
  eq(care.fertilizer, '每月一次');
  eq(care.waterDays, entry.waterDays, 'waterDays 应回落到知识库');
  eq(care.temp, entry.temp, 'temp 应回落到知识库');
});

test('归一化：waterDays 越界夹取到 1~60', function () {
  eq(plantCare.normalizeCare({ waterDays: 999 }, null).waterDays, 60);
  eq(plantCare.normalizeCare({ waterDays: 0 }, null).waterDays, 7, '0 视为无效，用默认 7');
  eq(plantCare.normalizeCare({ waterDays: -3 }, null).waterDays, 7);
});

test('归一化：waterDays 从「5天」这类文本里取数字', function () {
  eq(plantCare.normalizeCare({ waterDays: '7天' }, null).waterDays, 7);
  eq(plantCare.normalizeCare({ waterDays: '不知道' }, null).waterDays, 7);
});

test('归一化：全空时给出可用的默认方案', function () {
  const care = plantCare.normalizeCare(null, null);
  eq(care.waterDays, 7);
  eq(care.light, '');
  eq(care.toxicity, '');
});

test('归一化：字符串字段去空白、压换行', function () {
  const care = plantCare.normalizeCare({ light: '  明亮\n散射光  ' }, null);
  eq(care.light, '明亮 散射光');
});

/* ---------------- 建议条目（详情页消费） ---------------- */

test('建议条目：完整方案出七项，顺序固定', function () {
  const care = plantCare.normalizeCare(
    { light: '散射光', water: '土表干了浇透', waterDays: 5, temp: '18-28℃', humidity: '中', fertilizer: '每月', soil: '营养土', toxicity: '微毒' },
    null
  );
  const items = plantCare.adviceItems(care);
  eq(items.length, 7);
  eq(items[0].label, '光照');
  eq(items[1].label, '浇水');
  eq(items[6].label, '毒性');
});

test('建议条目：空字段跳过', function () {
  const items = plantCare.adviceItems({
    light: '半阴', water: '', waterDays: 0,
    temp: '', humidity: '', fertilizer: '', soil: '', toxicity: ''
  });
  eq(items.length, 1);
  eq(items[0].label, '光照');
});

test('建议条目：归一化兜底的默认周期也会给出浇水建议', function () {
  const items = plantCare.adviceItems(plantCare.normalizeCare({ light: '半阴' }, null));
  eq(items.length, 2);
  eq(items[1].label, '浇水');
  eq(items[1].text, '约每 7 天一次');
});

test('建议条目：浇水文案带上周期', function () {
  const items = plantCare.adviceItems(plantCare.normalizeCare({ water: '见干见湿', waterDays: 5 }, null));
  const water = items.filter(function (i) { return i.label === '浇水'; })[0];
  eq(water.text, '见干见湿，约每 5 天一次');
});

test('建议条目：只有周期没有文案时也能出浇水项', function () {
  const items = plantCare.adviceItems(plantCare.normalizeCare({ waterDays: 7 }, null));
  const water = items.filter(function (i) { return i.label === '浇水'; })[0];
  eq(water.text, '约每 7 天一次');
});

/* ---------------- 展示辅助 ---------------- */

test('健康状态映射色彩键', function () {
  eq(plantCare.healthTone('健康'), 'ok');
  eq(plantCare.healthTone('一般'), 'warn');
  eq(plantCare.healthTone('需关注'), 'danger');
  eq(plantCare.healthTone('随便什么'), 'muted');
  eq(plantCare.healthTone(''), 'muted');
});

test('来源标签', function () {
  eq(plantCare.sourceLabel('ai'), 'AI 识别');
  eq(plantCare.sourceLabel('library'), '知识库');
  eq(plantCare.sourceLabel('manual'), '手动');
  eq(plantCare.sourceLabel(''), '手动');
});

test('置信度展示：百分比文案', function () {
  eq(plantCare.confidenceText(0.86), '86%');
  eq(plantCare.confidenceText(0), '');
  eq(plantCare.confidenceText(null), '');
});

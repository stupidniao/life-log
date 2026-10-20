/**
 * services/plant.js 测试 —— 档案 CRUD 与建档来源合并
 * 用 wx-mock 验证「无云环境」下的行为（REQ-001 的降级承诺）。
 */
require('./wx-mock').install();

const path = require('path');
const { test, eq, ok } = require('./harness');
const plantService = require(path.join(__dirname, '../miniprogram/services/plant'));
const plantCare = require(path.join(__dirname, '../miniprogram/utils/plantCare'));
const store = require(path.join(__dirname, '../miniprogram/utils/store'));

function fresh() {
  // 直接走 store API 而不是改 mock 存储：
  // store 有模块级缓存，只清 storage 会让用例间互相污染
  store.savePlants([]);
}

/* ---------------- 档案 CRUD ---------------- */

test('档案：新增后可列出，基础字段齐全', function () {
  fresh();
  const p = plantService.add({ name: '窗台那盆', species: '绿萝' });
  ok(p.id && p.id.indexOf('p') === 0, 'id 应以 p 开头');
  ok(p.createdAt > 0);
  ok(p.updatedAt > 0);
  eq(plantService.list().length, 1);
});

test('档案：列表按创建时间倒序，软删除不出现', function () {
  fresh();
  const a = plantService.add({ name: 'A', species: '绿萝' });
  plantService.add({ name: 'B', species: '吊兰' });
  eq(plantService.list()[0].name, 'B');
  plantService.remove(a.id);
  eq(plantService.list().length, 1);
  ok(plantService.get(a.id) === null, '软删除后 get 不可见');
});

test('档案：update 只改传入字段', function () {
  fresh();
  const p = plantService.add({ name: '窗台那盆', species: '绿萝' });
  plantService.update(p.id, { name: '客厅那盆' });
  const after = plantService.list()[0];
  eq(after.name, '客厅那盆');
  eq(after.species, '绿萝');
  ok(after.updatedAt >= p.updatedAt);
});

test('档案：不存在的 id 操作不崩', function () {
  fresh();
  eq(plantService.get('p-nope'), null);
  eq(plantService.update('p-nope', { name: 'x' }), null);
  eq(plantService.remove('p-nope'), false);
});

/* ---------------- 建档来源 ---------------- */

test('建档：手动选品种走知识库，方案完整', function () {
  fresh();
  const p = plantService.createManual('绿萝', { fileID: '', localPath: 'wxfile://a' });
  eq(p.species, '绿萝');
  eq(p.speciesKey, 'pothos');
  eq(p.source, 'library');
  eq(p.confidence, 0);
  eq(p.name, '绿萝', '默认名字 = 品种名');
  eq(p.care.waterDays, plantCare.findByName('绿萝').waterDays);
  ok(p.care.light.length > 0, '光照建议应来自知识库');
  eq(p.photo.localPath, 'wxfile://a');
});

test('建档：手选未知品种也能建，用默认周期', function () {
  fresh();
  const p = plantService.createManual('空气凤梨', {});
  eq(p.species, '空气凤梨');
  eq(p.speciesKey, '');
  eq(p.source, 'manual');
  eq(p.care.waterDays, 7);
});

test('建档：AI 结果与知识库合并，AI 值优先', function () {
  fresh();
  const analysis = {
    species: '绿萝（Epipremnum aureum）',
    confidence: 0.86,
    health: '健康',
    care: { light: '半阴处', water: '', waterDays: 0 },
    issues: [{ title: '叶尖发黄', detail: '水大' }],
    tips: ['通风']
  };
  const p = plantService.createFromAnalysis(analysis, { fileID: 'cloud://x', localPath: '' });
  eq(p.species, '绿萝（Epipremnum aureum）', '品种原文保留，展示层再裁剪');
  eq(p.speciesKey, 'pothos', '应命中知识库');
  eq(p.source, 'ai');
  eq(p.confidence, 0.86);
  eq(p.care.light, '半阴处', 'AI 有值优先');
  eq(p.care.water, plantCare.findByName('绿萝').water, 'AI 缺项由知识库补');
  eq(p.care.waterDays, plantCare.findByName('绿萝').waterDays);
  eq(p.issues.length, 1);
  eq(p.photo.fileID, 'cloud://x');
});

test('建档：AI 结果存进档案的同时保留 rawSpecies 供详情改品种', function () {
  fresh();
  const p = plantService.createFromAnalysis(
    { species: '虎尾兰', confidence: 0.5, care: {}, issues: [], tips: [] },
    {}
  );
  eq(p.species, '虎尾兰');
  ok(Array.isArray(p.issues));
});

test('建档：AI 结果里的 issues/tips 脏形状被防御性归一', function () {
  fresh();
  const p = plantService.createFromAnalysis(
    { species: '绿萝', confidence: 0.9, care: {}, issues: ['叶尖发黄', { title: '土面板结', detail: '换土' }, { title: '' }], tips: '多通风' },
    {}
  );
  eq(p.issues.length, 2);
  eq(p.issues[0].title, '叶尖发黄');
  eq(p.issues[0].detail, '');
  eq(p.issues[1].detail, '换土');
  eq(p.tips, ['多通风']);
});

/* ---------------- 降级判定 ---------------- */

test('降级：无云环境 aiAvailable 为 false，识别流程直接走手选', function () {
  fresh();
  eq(plantService.aiAvailable(), false, 'wx-mock 刻意不给 wx.cloud');
});

/* ---------------- 改品种重算 ---------------- */

test('改品种：换成知识库品种后方案重算，健康与问题保留', function () {
  fresh();
  const p = plantService.createFromAnalysis(
    { species: '绿萝', confidence: 0.4, health: '需关注', care: { light: '乱写的' }, issues: [{ title: '黄叶', detail: '' }], tips: [] },
    {}
  );
  plantService.changeSpecies(p.id, '龟背竹');
  const after = plantService.get(p.id);
  eq(after.species, '龟背竹');
  eq(after.speciesKey, 'monstera');
  eq(after.care.light, plantCare.findByName('龟背竹').light, '方案应整体换成龟背竹的');
  eq(after.health, '需关注', '健康诊断保留');
  eq(after.issues.length, 1, '问题列表保留');
  eq(after.source, 'library', '改品种后来源变知识库');
});

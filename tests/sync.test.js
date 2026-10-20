/**
 * services/sync.js 植物同步纯函数测试（REQ-003）
 * 覆盖：computePlantPushes / mergePlantPulls / photo.fileID <-> photoFileID 边界映射。
 * 只测纯函数，云函数网络调用不在 Node 里验证。
 */
require('./wx-mock').install();

const path = require('path');
const { test, eq, ok } = require('./harness');
const sync = require(path.join(__dirname, '../miniprogram/services/sync'));

/** 造一条植物档案，fileID 可选 */
function plant(id, updatedAt, fileID) {
  return {
    id: id,
    name: 'p' + id,
    species: '绿萝',
    photo: { fileID: fileID || '', localPath: 'wxfile://local-' + id },
    updatedAt: updatedAt,
    deleted: false
  };
}

/* ---------------- 植物推送计算 ---------------- */

test('植物推送：updatedAt 大于水位线的才推', function () {
  const all = [plant('p1', 100), plant('p2', 300), plant('p3', 200)];
  const pushes = sync.computePlantPushes(all, 200);
  eq(pushes.length, 1);
  eq(pushes[0].id, 'p2');
});

test('植物推送：软删除的档案也要推（删除需同步）', function () {
  const all = [{ id: 'p1', updatedAt: 500, deleted: true }];
  const pushes = sync.computePlantPushes(all, 0);
  eq(pushes.length, 1);
});

test('植物推送：空与空水位线', function () {
  eq(sync.computePlantPushes([], 0).length, 0);
  eq(sync.computePlantPushes(undefined, 0).length, 0);
});

/* ---------------- 植物下行合并 ---------------- */

test('植物下行：按 id 去重，本地更新版本胜出', function () {
  const local = [plant('p1', 300, 'cloud://new')];
  const pulls = [
    { id: 'p1', updatedAt: 200, photoFileID: 'cloud://old' }, // 本地更新，忽略云端
    { id: 'p2', updatedAt: 400, photoFileID: 'cloud://p2' }    // 云端新档案，纳入
  ];
  const merged = sync.mergePlantPulls(local, pulls);
  eq(merged.length, 2);
  const p1 = merged.find(x => x.id === 'p1');
  eq(p1.updatedAt, 300, '本地更新版本保留');
  eq(p1.photo.fileID, 'cloud://new', '本地 fileID 不被覆盖');
});

test('植物下行：fileID 为空时不用云端空值覆盖本地', function () {
  const local = [plant('p1', 100, 'cloud://local')];
  const pulls = [{ id: 'p1', updatedAt: 200, photoFileID: '' }];
  const merged = sync.mergePlantPulls(local, pulls);
  eq(merged[0].photo.fileID, 'cloud://local');
});

/* ---------------- 边界映射（photo.fileID <-> photoFileID） ---------------- */

test('边界映射：本地档案转云端文档，fileID -> photoFileID，localPath 剥离', function () {
  const doc = sync.plantToCloudDoc(plant('p1', 100, 'cloud://abc'));
  eq(doc.photoFileID, 'cloud://abc');
  ok(doc.localPath === undefined, 'localPath 不应上传');
  ok(doc.photo === undefined, 'photo 对象不应整包上传');
  eq(doc.id, 'p1');
});

test('边界映射：云端文档转本地档案，photoFileID -> photo.fileID', function () {
  const p = sync.cloudDocToPlant({ id: 'p1', photoFileID: 'cloud://abc', species: '绿萝' });
  eq(p.photo.fileID, 'cloud://abc');
  eq(p.photo.localPath, '', '云端无 localPath，本地置空');
});

test('边界映射：无 fileID 的云端文档不崩', function () {
  const p = sync.cloudDocToPlant({ id: 'p1', species: '绿萝' });
  eq(p.photo.fileID, '');
  eq(p.photo.localPath, '');
});

/**
 * 云函数 records —— 双向增量同步
 *
 * 协议：
 *   入参 { action: 'sync', pushes: [record], lastSyncAt: number }
 *   出参 { code: 0, serverTime, pushed, pulls: [record] }
 *
 * 设计要点：
 * 1. _id 直接用记录的 id —— upsert 天然按 id 去重，不存在重复同步
 * 2. 每条数据强制写入调用者 OPENID，且查询只查本人 —— 多设备同账号同步，他人不可见
 * 3. 客户端不直接读写数据库（安全规则可设为仅管理端），所有访问都过云函数
 * 4. 下行按 updatedAt > lastSyncAt 增量分页拉取，避免超出单次查询条数上限
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COL = 'records';
const PAGE = 100;        // 单次查询条数上限，参考云开发文档
const MAX_PULL = 5000;   // 防御上限：单次同步最多拉 5000 条

// 白名单字段：客户端提交的记录只拷贝这些 key，其余一概丢弃
const SAFE_KEYS = ['id', 'type', 'date', 'time', 'value', 'fields', 'note', 'deleted', 'createdAt', 'updatedAt'];

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;

  if (action !== 'sync') {
    return { code: 400, message: '未知 action: ' + action };
  }

  try {
    /* ---- 1. 上行：逐条 upsert（_id = record.id） ---- */
    const pushes = Array.isArray(event.pushes) ? event.pushes : [];
    for (const r of pushes) {
      if (!r || !r.id || !r.type) continue; // 非法数据直接丢弃

      const doc = { openid: OPENID };
      SAFE_KEYS.forEach(k => {
        if (r[k] !== undefined) doc[k] = r[k];
      });
      doc.id = r.id;

      // set：存在则整体替换，不存在则创建 —— 与"全量记录推送"的模型一致
      await db.collection(COL).doc(r.id).set({ data: doc });
    }

    /* ---- 2. 下行：拉取本人 updatedAt > lastSyncAt 的记录（分页） ---- */
    const cond = { openid: OPENID, updatedAt: _.gt(Number(event.lastSyncAt) || 0) };
    const pulls = [];
    let skip = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await db.collection(COL)
        .where(cond)
        .orderBy('updatedAt', 'asc')
        .skip(skip)
        .limit(PAGE)
        .get();
      pulls.push.apply(pulls, res.data);
      if (res.data.length < PAGE || skip + PAGE >= MAX_PULL) break;
      skip += PAGE;
    }

    // 剔除服务端私有字段后返回
    const clean = pulls.map(d => {
      const c = {};
      SAFE_KEYS.forEach(k => {
        if (d[k] !== undefined) c[k] = d[k];
      });
      return c;
    });

    return {
      code: 0,
      serverTime: Date.now(),
      pushed: pushes.length,
      pulls: clean
    };
  } catch (err) {
    console.error('[records] 同步失败', err);
    return { code: 500, message: (err && err.errMsg) || String(err) };
  }
};

/**
 * 云函数 plantAI —— 绿植照片识别与养护建议（REQ-001）
 *
 * 协议：
 *   入参 { action: 'analyze', fileID: 'cloud://...' }
 *        { action: 'correct', correctedName: '绿萝', fileID?: 'cloud://...' }
 *   出参 { code: 0, data: {species, confidence, health, care, issues, tips}, provider, model }
 *        { code: 4xx/5xx, message }
 *
 * correct 说明（REQ-004）：用户纠正识别错误后，按新名字重新查询完整养护方案；
 * fileID 可选，带照片时模型可结合图像校准健康状态与问题诊断，不带则纯文本查询。
 *
 * 配置（云开发控制台 → 本函数 → 环境变量）：
 *   AI_PROVIDER  zhipu（默认）| dashscope
 *   AI_API_KEY   必填，模型厂商的 Key（智谱开放平台 / 阿里百炼）
 *   AI_MODEL     可选，覆盖默认模型（glm-4v-flash / qwen3-vl-plus）
 *
 * 安全：Key 只存在环境变量，客户端只传云存储 fileID，图片不出云开发环境（下载后直连模型厂商）。
 */
const cloud = require('wx-server-sdk');
const https = require('https');
const { URL } = require('url');
const analyze = require('./lib/analyze');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MAX_BASE64 = 4 * 1024 * 1024; // 模型侧 base64 体积上限守卫
const REQUEST_TIMEOUT = 15000;      // 模型接口超时，云函数整体 20s，留 5s 余量

/** POST JSON，非 2xx 时把响应体带进错误信息，方便排查配额/鉴权问题 */
function postJSON(url, headers, body) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: Object.assign({ 'Content-Length': Buffer.byteLength(payload) }, headers)
    }, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('模型接口 HTTP ' + res.statusCode + '：' + data.slice(0, 300)));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('模型接口返回非 JSON：' + data.slice(0, 300)));
        }
      });
    });
    req.setTimeout(REQUEST_TIMEOUT, function () {
      req.destroy(new Error('模型接口超时'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

exports.main = async (event) => {
  const action = event && event.action;
  if (action !== 'analyze' && action !== 'correct') {
    return { code: 400, message: '未知 action' };
  }
  if (action === 'correct' && !event.correctedName) {
    return { code: 400, message: '缺少 correctedName' };
  }
  if (action === 'analyze' && !event.fileID) {
    return { code: 400, message: '缺少 fileID' };
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return { code: 500, message: '未配置 AI_API_KEY，请到云函数环境变量里设置' };
  }

  try {
    const t0 = Date.now();
    // 1. 从云存储取图（客户端不传图片二进制，避开 callFunction 1MB 限制）
    //    correct 动作下 fileID 可选：没照片也能按名字纯文本纠错
    let base64 = null;
    if (event.fileID) {
      const dl = await cloud.downloadFile({ fileID: event.fileID });
      base64 = dl.fileContent.toString('base64');
      console.log('[plantAI] 下载图片', Date.now() - t0, 'ms, base64', base64.length, 'bytes');
      if (base64.length > MAX_BASE64) {
        return { code: 413, message: '图片过大，请靠近一点重拍' };
      }
    }

    // 2. 调模型（OpenAI 兼容协议）
    const provider = analyze.resolveProvider(process.env.AI_PROVIDER);
    const model = process.env.AI_MODEL || provider.defaultModel;
    const messages = action === 'correct'
      ? analyze.buildCorrectionMessages(base64, event.correctedName)
      : analyze.buildMessages(base64);
    const t1 = Date.now();
    const resp = await postJSON(
      provider.baseURL,
      {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      Object.assign({
        model: model,
        messages: messages,
        temperature: 0.1,
        max_tokens: 1024
      }, provider.extraBody || {})
    );
    console.log('[plantAI] 调模型', model, Date.now() - t1, 'ms');

    const choice = resp && resp.choices && resp.choices[0];
    const content = choice && choice.message && choice.message.content;
    if (!content) {
      return { code: 502, message: '模型未返回内容' };
    }

    // 3. 解析 + 归一化（解析失败不重试：提示词已强约束，重试大概率还是失败）
    const parsed = analyze.parseModelJson(content);
    if (!parsed) {
      console.error('[plantAI] 模型返回无法解析：', content.slice(0, 500));
      return { code: 502, message: '模型返回格式异常，请重试' };
    }

    console.log('[plantAI] 全程耗时', Date.now() - t0, 'ms');
    return {
      code: 0,
      data: analyze.normalizeAnalysis(parsed),
      provider: process.env.AI_PROVIDER || 'zhipu',
      model: model
    };
  } catch (err) {
    console.error('[plantAI] 识别失败', err);
    return { code: 500, message: (err && err.message) || '识别失败，请重试' };
  }
};

# 日迹 · 个人生活记录助手

一个用微信小程序做的个人生活记录工具：记账、运动、体重、睡眠、喝酒、阅读……统一记成一条时间线。

**核心设计**：类型注册表驱动。新增一个记录模块只需在 `miniprogram/config/recordTypes.js` 加一段配置，首页卡片、录入表单、列表、统计图表全部自动适配，页面代码零改动。

---

## 快速开始

1. 打开 **微信开发者工具** → 导入项目
2. 目录选择本文件夹（含 `project.config.json` 的那一层）
3. AppID 选「测试号」即可（`project.config.json` 里已填 `touristappid`）
4. 编译运行

无需云开发、无需服务器、无需配置任何 key，开箱即跑。

**要发布到微信里给别人用**？看 [docs/部署指南.md](docs/部署指南.md)（注册 AppID → 体验版 → 云开发 → 提审发布，含踩坑点）。

---

## 目录结构

```
日迹-life-log/
├── project.config.json          项目配置（miniprogramRoot / cloudfunctionRoot）
├── docs/
│   ├── 设计方案.md               架构、数据模型、里程碑、合规说明
│   └── 部署指南.md               从本地跑通到提审发布的全流程
├── 小程序项目档案.md             开发进度档案（跨会话续接用）
├── cloudfunctions/
│   └── records/                 云函数：双向增量同步（M2，可选部署）
└── miniprogram/
    ├── app.js / app.json / app.wxss
    ├── config/recordTypes.js    ★ 类型注册表：所有模块的唯一真相源
    ├── utils/
    │   ├── date.js              日期工具（统一 YYYY-MM-DD 字符串）
    │   └── store.js             存储层（本地 Storage + 云同步水位线）
    ├── services/
    │   ├── record.js            记录服务：增删改查 + 看板 + 趋势 + 分布（写后自动触发云同步）
    │   └── sync.js              云同步：双水位线增量同步、防抖、冲突合并
    ├── components/
    │   └── record-card/         记录卡片（纯展示，无业务判断）
    └── pages/
        ├── home/                今日看板
        ├── record/              记一笔 / 编辑（动态表单）
        ├── list/                流水（按月分组 + 类型筛选）
        ├── stats/               统计（趋势柱图 + 构成分布）
        └── mine/                预算、模块开关、云同步、导出、清空
```

---

## 云同步部署指南（可选，v0.2.0+）

**不开云同步，程序完全本地可用，无需以下任何步骤。**

前提：需要一个已注册的小程序 AppID（**个人主体即可**；测试号 touristappid 无法开通云开发）。

1. 微信开发者工具顶部「云开发」→ 开通并创建环境，记下**环境 ID**（形如 `life-log-3gxxxxxx`）
2. 云开发控制台 → 数据库 → 创建集合 **`records`**（权限保持默认"仅创建者可读写"即可——客户端不直连数据库，所有访问都走云函数）
3. 索引管理 → 给 `records` 添加复合索引：`openid`（升序）+ `updatedAt`（升序），同步拉取走这条查询
4. 开发者工具中右键 `cloudfunctions/records` → **「上传并部署：云端安装依赖」**
5. 小程序内「我的 → 云同步」→ 填环境 ID → 打开开关。首次开启会把历史记录全部推上云

验证：云开发控制台 → 数据库 → `records` 里应能看到你的记录。

说明：云开发有免费额度，超出后按量计费，**资费以微信官方最新政策为准**；数据按 `_openid` 隔离，只有你自己的微信能读到。

---

## 怎么加一个新模块（比如「服药」）

只改 `miniprogram/config/recordTypes.js`，往 `TYPES` 数组里追加：

```js
{
  key: 'medicine',
  name: '服药',
  icon: '💊',
  color: '#4C7CE0',
  soft: 'rgba(76, 124, 224, 0.10)',
  kind: 'event',
  primary: { field: 'dose', agg: 'sum', fmt: 'count' },
  fields: [
    { key: 'drug', label: '药品', type: 'text', required: true, placeholder: '例如：维生素 D' },
    { key: 'dose', label: '剂量', type: 'number', unit: '次', required: true, placeholder: '1' },
    { key: 'note', label: '备注', type: 'text', placeholder: '选填' }
  ],
  titleField: 'drug',
  subFields: ['note']
}
```

保存 → 首页多一张卡片、录入页多一个类型、统计页多一个 tab、列表筛选多一项。**不用改任何页面代码。**

---

## 数据说明

- **默认**：全部记录存本机 `wx.setStorageSync`，key 为 `life_log_records_v1`，不上传服务器
- 开启云同步后：本地仍为工作副本，云端做备份与多设备共享，按 `updatedAt` 增量双向同步
- 不收集手机号/位置/通讯录
- 「我的 → 导出全部记录」会把 JSON 复制到剪贴板，可粘贴到备忘录备份
- 清理小程序缓存或卸载会清空本地数据；**未开云同步时换设备前务必先导出**

---

## 当前版本

v0.2.0（M2）—— 云开发同步上线：双水位线增量同步、写后防抖自动上行、多设备 last-write-wins。自定义类型、提醒见 `docs/设计方案.md` 里程碑。

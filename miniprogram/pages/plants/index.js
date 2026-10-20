/**
 * 我的绿植（REQ-001）
 *
 * 职责：档案列表 + 拍照注册 + 手动添加。
 * 拍照注册流程：chooseMedia → plantService.analyzePhoto →
 *   AI 成功 → 弹确认（可改手选）→ 建档跳详情
 *   AI 失败/无云 → toast + 底部抽屉选品种 → 建档跳详情
 * 任何分支都不让用户白拍一张照片。
 */
const plantService = require('../../services/plant');
const plantCare = require('../../utils/plantCare');

const CUSTOM_OPTION = '自定义名称';

Page({
  data: {
    plants: [],
    aiReady: false,
    sheetOpen: false,
    speciesNames: []
  },

  onLoad() {
    // 注册流程的暂存：拍好的照片 + （可选的）AI 诊断，选完品种一起入档
    this.pendingPhoto = null;
    this.pendingAnalysis = null;
    this.setData({
      speciesNames: plantCare.listNames().concat([CUSTOM_OPTION])
    });
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const plants = plantService.list().map(function (p) {
      return {
        id: p.id,
        name: p.name,
        species: p.species,
        emoji: p.emoji || '🪴',
        photoSrc: p.photo.fileID || p.photo.localPath || '',
        photoFallback: p.photo.localPath || '',
        health: p.health || '未评估',
        tone: plantCare.healthTone(p.health),
        sourceLabel: plantCare.sourceLabel(p.source)
      };
    });
    this.setData({
      plants: plants,
      aiReady: plantService.aiAvailable()
    });
  },

  /* ---------------- 拍照注册 ---------------- */

  onTakePhoto() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      success: function (res) {
        const file = res.tempFiles && res.tempFiles[0];
        if (file) that.register(file.tempFilePath);
      }
    });
  },

  register(tempFilePath) {
    const that = this;
    wx.showLoading({ title: '正在识别…', mask: true });
    plantService.analyzePhoto(tempFilePath).then(function (out) {
      wx.hideLoading();

      if (out.analysis) {
        that.confirmAnalysis(out);
        return;
      }

      if (out.reason === 'ai-failed') {
        wx.showToast({ title: '识别失败，手动选个品种吧', icon: 'none' });
      } else if (out.reason === 'upload-failed') {
        // 上传云存储失败：多为云开发未开通/环境 ID 错误/存储未启用，给出可自查的提示
        const msg = (out.error && out.error.errMsg) || '';
        console.error('[plants] 上传失败详情', out.error);
        wx.showModal({
          title: '照片上传失败',
          content: '已保留本地照片，可继续手动建档。\n若想用 AI 识别，请检查：①「我的→云同步」环境 ID 是否正确 ② 云开发是否已开通存储 ③ plantAI 云函数是否已部署。\n' + (msg ? '\n[' + msg + ']' : ''),
          showCancel: false
        });
      }
      // 无云 / 识别失败 / 上传失败：照片保留，品种走手选，诊断字段留空
      that.pendingPhoto = out.photo;
      that.pendingAnalysis = null;
      that.setData({ sheetOpen: true });
    });
  },

  confirmAnalysis(out) {
    const that = this;
    const a = out.analysis;
    const conf = plantCare.confidenceText(a.confidence);
    wx.showModal({
      title: '识别结果',
      content: '看起来是「' + (a.species || '一盆绿植') + '」' +
        (conf ? '，置信度 ' + conf : '') + '。用它建档吗？',
      confirmText: '建档',
      cancelText: '选别的',
      success: function (m) {
        if (m.confirm) {
          const p = plantService.createFromAnalysis(a, out.photo);
          that.refresh();
          wx.navigateTo({ url: '/pages/plant-detail/index?id=' + p.id });
        } else {
          // 用户不认可识别结果：照片与 AI 诊断保留，品种换成手选
          that.pendingPhoto = out.photo;
          that.pendingAnalysis = a;
          that.setData({ sheetOpen: true });
        }
      }
    });
  },

  /* ---------------- 品种选择抽屉 ---------------- */

  onManualAdd() {
    this.pendingPhoto = null;
    this.pendingAnalysis = null;
    this.setData({ sheetOpen: true });
  },

  onSheetClose() {
    this.setData({ sheetOpen: false });
  },

  onSheetPick(e) {
    const name = e.currentTarget.dataset.name;
    const that = this;

    if (name === CUSTOM_OPTION) {
      wx.showModal({
        title: '输入品种名',
        editable: true,
        placeholderText: '例如：空气凤梨',
        success: function (m) {
          if (m.confirm && m.content && m.content.trim()) {
            that.buildWith(m.content.trim());
          }
        }
      });
      return;
    }
    this.buildWith(name);
  },

  buildWith(speciesName) {
    let p;
    if (this.pendingAnalysis) {
      // AI 诊断保留（健康状态/问题/贴士），方案按手选品种重算
      p = plantService.createFromAnalysis(this.pendingAnalysis, this.pendingPhoto || undefined);
      p = plantService.changeSpecies(p.id, speciesName);
    } else {
      p = plantService.createManual(speciesName, this.pendingPhoto || undefined);
    }
    this.pendingPhoto = null;
    this.pendingAnalysis = null;
    this.setData({ sheetOpen: false });
    this.refresh();
    wx.navigateTo({ url: '/pages/plant-detail/index?id=' + p.id });
  },

  /* ---------------- 列表交互 ---------------- */

  onOpen(e) {
    wx.navigateTo({ url: '/pages/plant-detail/index?id=' + e.currentTarget.dataset.id });
  },

  onLongPress(e) {
    const id = e.currentTarget.dataset.id;
    const that = this;
    wx.showModal({
      title: '删除这盆植物？',
      content: '只删除档案，不影响其他数据',
      confirmColor: '#E4574C',
      success: function (m) {
        if (m.confirm) {
          plantService.remove(id);
          that.refresh();
          wx.showToast({ title: '已删除', icon: 'none' });
        }
      }
    });
  },

  /** 云端照片加载失败（如断网）时回落到本地副本 */
  onPhotoError(e) {
    const id = e.currentTarget.dataset.id;
    const idx = this.data.plants.findIndex(function (p) { return p.id === id; });
    if (idx === -1) return;
    const item = this.data.plants[idx];
    if (item.photoFallback && item.photoSrc !== item.photoFallback) {
      this.setData({ ['plants[' + idx + '].photoSrc']: item.photoFallback });
    }
  }
});

/**
 * 绿植详情（REQ-001）
 *
 * 展示：照片、名字/品种/来源/置信度、健康状态、当前问题、养护建议、小贴士。
 * 操作：改名、换品种（方案从知识库重算，AI 诊断保留）、删除。
 */
const plantService = require('../../services/plant');
const plantCare = require('../../utils/plantCare');

const CUSTOM_OPTION = '其他…';

Page({
  data: {
    loaded: false,
    photoSrc: '',
    photoFallback: '',
    emoji: '🪴',
    name: '',
    species: '',
    sourceLabel: '',
    confidenceText: '',
    health: '',
    tone: 'muted',
    advice: [],
    issues: [],
    tips: [],
    speciesNames: []
  },

  onLoad(options) {
    this.plantId = options.id || '';
    this.setData({
      speciesNames: plantCare.listNames().concat([CUSTOM_OPTION])
    });
    this.refresh();
  },

  refresh() {
    const p = plantService.get(this.plantId);
    if (!p) {
      wx.showToast({ title: '档案不存在', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 800);
      return;
    }
    this.setData({
      loaded: true,
      // fileID 是 cloud:// 协议，<image> 不能直接显示；先落到 localPath 兜底，
      // 有 fileID 时下面 resolvePhotoUrl 再换成 https 临时链接
      photoSrc: p.photo.localPath || '',
      photoFallback: p.photo.localPath || '',
      emoji: p.emoji || '🪴',
      name: p.name,
      species: p.species || '未识别品种',
      sourceLabel: plantCare.sourceLabel(p.source),
      confidenceText: plantCare.confidenceText(p.confidence),
      health: p.health || '未评估',
      tone: plantCare.healthTone(p.health),
      advice: plantCare.adviceItems(p.care),
      issues: p.issues || [],
      tips: p.tips || []
    });

    // 有云端 fileID 时，换临时 URL 显示（跨设备也能看照片）
    if (p.photo && p.photo.fileID) {
      this.resolvePhotoUrl(p.photo.fileID);
    }
  },

  resolvePhotoUrl(fileID) {
    const that = this;
    if (!wx.cloud || !wx.cloud.getTempFileURL) return;
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: function (res) {
        const item = res.fileList && res.fileList[0];
        if (item && item.tempFileURL) {
          that.setData({ photoSrc: item.tempFileURL });
        }
      },
      fail: function () {
        // 换 URL 失败（离线等）保持 localPath 兜底
      }
    });
  },

  onPhotoError() {
    // 云端地址加载失败（离线等）时回落本地副本
    if (this.data.photoFallback && this.data.photoSrc !== this.data.photoFallback) {
      this.setData({ photoSrc: this.data.photoFallback });
    }
  },

  onRename() {
    const that = this;
    wx.showModal({
      title: '给这盆植物起个名字',
      editable: true,
      content: this.data.name,
      placeholderText: '例如：窗台那盆',
      success: function (m) {
        const name = m.content && m.content.trim();
        if (m.confirm && name) {
          plantService.update(that.plantId, { name: name });
          that.refresh();
        }
      }
    });
  },

  onChangeSpecies(e) {
    const idx = Number(e.detail.value);
    const name = this.data.speciesNames[idx];
    const that = this;

    if (name === CUSTOM_OPTION) {
      wx.showModal({
        title: '输入品种名',
        editable: true,
        placeholderText: '例如：空气凤梨',
        success: function (m) {
          if (m.confirm && m.content) that.applySpecies(m.content);
        }
      });
      return;
    }
    this.applySpecies(name);
  },

  applySpecies(speciesName) {
    plantService.changeSpecies(this.plantId, speciesName);
    this.refresh();
    wx.showToast({ title: '方案已更新', icon: 'none' });
  },

  onDelete() {
    const that = this;
    wx.showModal({
      title: '删除这盆植物？',
      content: '档案与照片记录将一并移除',
      confirmColor: '#E4574C',
      success: function (m) {
        if (m.confirm) {
          plantService.remove(that.plantId);
          wx.showToast({ title: '已删除', icon: 'none' });
          setTimeout(function () { wx.navigateBack(); }, 600);
        }
      }
    });
  }
});

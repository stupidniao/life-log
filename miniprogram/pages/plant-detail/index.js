/**
 * 绿植详情（REQ-001）
 *
 * 展示：照片、名字/品种/来源/置信度、健康状态、当前问题、养护建议、小贴士。
 * 操作：改名、纠正品种（自由输入正确名字，按名字重新查询方案，AI 诊断保留）、删除。
 */
const plantService = require('../../services/plant');
const plantCare = require('../../utils/plantCare');

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
    tips: []
  },

  onLoad(options) {
    this.plantId = options.id || '';
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

  /** 纠错入口：自由输入正确品种名（不再弹品种列表） */
  onCorrectSpecies() {
    const that = this;
    wx.showModal({
      title: '识别不对？输入正确名字',
      editable: true,
      placeholderText: '输入正确的品种名，例如：龟背竹',
      confirmText: '确定',
      cancelText: '取消',
      success: function (m) {
        if (m.confirm && m.content && m.content.trim()) {
          that.correctSpecies(m.content.trim());
        } else if (m.confirm && !(m.content && m.content.trim())) {
          wx.showToast({ title: '请输入名字', icon: 'none' });
        }
      }
    });
  },

  /**
   * 纠错（REQ-004）：用户输入正确名字 → 按名字重新查询 → 原地重写档案。
   * 有云端照片则带图纠错（校准健康/问题）；无云或失败回退本地知识库。
   */
  correctSpecies(correctedName) {
    const that = this;
    const p = plantService.get(this.plantId);
    const photo = p && p.photo ? p.photo : null;

    if (!plantService.aiAvailable()) {
      // 无云：直接落到本地知识库（等价于旧的换品种，但用纠正名）
      plantService.applyCorrection(this.plantId, null, correctedName);
      that.refresh();
      wx.showToast({ title: '已按新名字更新', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在查询…', mask: true });
    plantService.analyzeCorrection(correctedName, photo).then(function (out) {
      wx.hideLoading();
      if (out.analysis) {
        plantService.applyCorrection(that.plantId, out.analysis, correctedName);
        that.refresh();
        wx.showToast({ title: '档案已重新生成', icon: 'none' });
      } else {
        // 云查询失败：降级本地知识库，纠错仍生效
        plantService.applyCorrection(that.plantId, null, correctedName);
        that.refresh();
        wx.showToast({ title: '已按新名字更新', icon: 'none' });
      }
    });
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

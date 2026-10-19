const recordService = require('../../services/record');
const dateUtil = require('../../utils/date');
const store = require('../../utils/store');
const { getType } = require('../../config/recordTypes');

const NUMERIC = ['money', 'number', 'decimal'];

Page({
  data: {
    types: [],
    activeType: '',
    typeName: '',
    typeColor: '#2F7D6D',
    fields: [],
    date: '',
    dateLabel: '',
    time: '',
    editing: false,
    recordId: '',
    submitting: false
  },

  onLoad(options) {
    const settings = store.getSettings();
    const enabled = (settings.enabledTypes && settings.enabledTypes.length)
      ? settings.enabledTypes
      : ['expense'];

    const types = enabled
      .map(k => getType(k))
      .filter(Boolean)
      .map(t => ({ key: t.key, name: t.name, icon: t.icon, color: t.color }));

    // 编辑模式
    if (options.id) {
      const record = recordService.get(options.id);
      if (!record) {
        wx.showToast({ title: '记录不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      const def = getType(record.type);
      this.setData({
        types: types,
        activeType: record.type,
        typeName: def.name,
        typeColor: def.color,
        date: record.date,
        dateLabel: dateUtil.friendlyDate(record.date),
        time: record.time,
        editing: true,
        recordId: record.id
      });
      this.buildFields(record.type, record.fields);
      wx.setNavigationBarTitle({ title: '编辑 · ' + def.name });
      return;
    }

    // 新建模式
    const activeType = options.type && enabled.indexOf(options.type) > -1
      ? options.type
      : types[0].key;
    const def = getType(activeType);

    this.setData({
      types: types,
      activeType: activeType,
      typeName: def.name,
      typeColor: def.color,
      date: dateUtil.today(),
      dateLabel: '今天',
      time: dateUtil.nowTime()
    });
    this.buildFields(activeType, null);
    wx.setNavigationBarTitle({ title: '记一笔 · ' + def.name });
  },

  /**
   * 根据类型定义生成表单字段
   * @param {string} typeKey
   * @param {object|null} values 已有值（编辑时传入）
   */
  buildFields(typeKey, values) {
    const def = getType(typeKey);
    const fields = (def.fields || []).map(f => {
      let value = '';
      if (values && values[f.key] !== undefined && values[f.key] !== null) {
        value = values[f.key];
      } else if (f.default !== undefined) {
        value = f.default;
      }

      const item = {
        key: f.key,
        label: f.label,
        type: f.type,
        unit: f.unit || '',
        required: !!f.required,
        placeholder: f.placeholder || '',
        options: f.options || [],
        optionIndex: 0,
        value: value
      };

      if (f.type === 'picker') {
        if (item.options.length) {
          let idx = item.options.indexOf(value);
          // 值不在选项里（历史记录、后续自定义分类），追加为选项，
          // 避免 picker 静默把值改掉第一项造成数据丢失
          if (idx === -1 && value !== '' && value !== undefined) {
            item.options = item.options.concat([value]);
            idx = item.options.length - 1;
          }
          item.optionIndex = idx > -1 ? idx : 0;
          item.value = item.options[item.optionIndex];
        }
      }

      return item;
    });

    this.setData({ fields: fields });
  },

  onTypeChange(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.activeType || this.data.editing) return;
    const def = getType(type);
    this.setData({
      activeType: type,
      typeName: def.name,
      typeColor: def.color
    });
    this.buildFields(type, null);
    wx.setNavigationBarTitle({ title: '记一笔 · ' + def.name });
  },

  onFieldInput(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      ['fields[' + index + '].value']: e.detail.value
    });
  },

  onPickerChange(e) {
    const index = e.currentTarget.dataset.index;
    const field = this.data.fields[index];
    const optionIndex = Number(e.detail.value);
    this.setData({
      ['fields[' + index + '].optionIndex']: optionIndex,
      ['fields[' + index + '].value']: field.options[optionIndex]
    });
  },

  onDateChange(e) {
    const date = e.detail.value;
    this.setData({
      date: date,
      dateLabel: dateUtil.friendlyDate(date)
    });
  },

  onTimeChange(e) {
    this.setData({ time: e.detail.value });
  },

  /** 校验并组装 fields */
  collectFields() {
    const def = getType(this.data.activeType);
    const result = {};
    const fields = this.data.fields;

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const raw = f.value;
      const isEmpty = raw === '' || raw === null || raw === undefined;

      if (f.required && isEmpty) {
        wx.showToast({ title: '请填写' + f.label, icon: 'none' });
        return null;
      }
      if (isEmpty) continue;

      if (NUMERIC.indexOf(f.type) > -1) {
        const num = Number(raw);
        if (isNaN(num)) {
          wx.showToast({ title: f.label + '需为数字', icon: 'none' });
          return null;
        }
        if (num < 0) {
          wx.showToast({ title: f.label + '不能为负数', icon: 'none' });
          return null;
        }
        result[f.key] = num;
      } else {
        result[f.key] = raw;
      }
    }

    // 兜底：主数值必须有
    const primaryValue = result[def.primary.field];
    if (primaryValue === undefined) {
      wx.showToast({ title: '请填写' + def.name + '主数值', icon: 'none' });
      return null;
    }
    return result;
  },

  onSubmit() {
    if (this.data.submitting) return;
    const fields = this.collectFields();
    if (!fields) return;

    this.setData({ submitting: true });

    try {
      const payload = {
        type: this.data.activeType,
        date: this.data.date,
        time: this.data.time,
        fields: fields
      };

      if (this.data.editing) {
        recordService.update(this.data.recordId, payload);
      } else {
        recordService.add(payload);
      }

      wx.showToast({ title: this.data.editing ? '已保存' : '记录成功', icon: 'success', duration: 900 });
      setTimeout(() => wx.navigateBack(), 700);
    } catch (err) {
      console.error('[record] 保存失败', err);
      // 存储写满（errMsg 含 exceed）时给出针对性引导，其余按通用失败处理
      const isFull = err && err.errMsg && err.errMsg.indexOf('exceed') > -1;
      wx.showToast({
        title: isFull ? '本地存储已满，请到「我的」导出后清理' : '保存失败，请重试',
        icon: 'none'
      });
      this.setData({ submitting: false });
    }
  },

  onDelete() {
    wx.showModal({
      title: '删除这条记录？',
      content: '删除后无法恢复',
      confirmColor: '#E4574C',
      success: res => {
        if (!res.confirm) return;
        recordService.remove(this.data.recordId);
        wx.showToast({ title: '已删除', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 600);
      }
    });
  }
});

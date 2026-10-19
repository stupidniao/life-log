/**
 * 记录卡片
 * 入参是已经过 services/record.js decorate() 装饰过的记录对象，
 * 组件本身不做任何业务判断，保证「加新类型不用改组件」。
 */
Component({
  properties: {
    record: {
      type: Object,
      value: null
    },
    // 是否显示右侧时间
    showTime: {
      type: Boolean,
      value: true
    }
  },

  methods: {
    onTap() {
      // 事件名刻意避开 tap/longpress：原生 tap 会冒泡到组件节点，
      // 与同名自定义事件叠加会导致父页面收到两次且 detail 被原生事件覆盖
      this.triggerEvent('itemtap', { id: this.data.record && this.data.record.id });
    },

    onLongPress() {
      this.triggerEvent('itemlong', { id: this.data.record && this.data.record.id });
    }
  }
});

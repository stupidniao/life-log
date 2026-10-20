/**
 * 小程序运行时模拟 —— 只实现被测代码真正会碰到的 API。
 * 不追求完整，追求「服务层能在 Node 里跑起来」。
 */

function createWxMock() {
  const storage = {};

  const wx = {
    _storage: storage,

    getStorageSync: function (key) {
      return storage[key] === undefined ? '' : JSON.parse(JSON.stringify(storage[key]));
    },
    setStorageSync: function (key, value) {
      storage[key] = JSON.parse(JSON.stringify(value));
    },
    removeStorageSync: function (key) {
      delete storage[key];
    },

    showToast: function () {},
    showModal: function () {},
    showLoading: function () {},
    hideLoading: function () {},

    // 测试环境刻意不给 wx.cloud —— 用来验证「无云开发也能跑」的降级路径
    cloud: undefined,

    getFileSystemManager: function () {
      return {
        saveFile: function (opt) {
          if (opt && opt.success) opt.success({ savedFilePath: 'wxfile://saved_' + Date.now() });
        },
        readFile: function (opt) {
          if (opt && opt.success) opt.success({ data: 'ZmFrZQ==' });
        }
      };
    }
  };

  return wx;
}

function install() {
  const wx = createWxMock();
  global.wx = wx;
  global.getApp = function () {
    return { globalData: { cloudEnv: '', version: 'test' } };
  };
  return wx;
}

module.exports = { install, createWxMock };

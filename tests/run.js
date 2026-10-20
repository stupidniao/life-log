/**
 * 测试入口：node tests/run.js
 * 逐文件 require，单文件加载失败（模块缺失/语法错）记为该文件全部失败，不拖垮其他文件。
 */
const fs = require('fs');
const path = require('path');
const harness = require('./harness');

const files = fs.readdirSync(__dirname)
  .filter(function (f) {
    return f.indexOf('.test.') > -1 && f.slice(-3) === '.js';
  })
  .sort();

files.forEach(function (f) {
  harness.setFile(f.replace('.test.js', ''));
  try {
    require(path.join(__dirname, f));
  } catch (err) {
    harness.test('[加载失败] ' + f, function () {
      throw err;
    });
  }
});

process.exit(harness.run() ? 0 : 1);

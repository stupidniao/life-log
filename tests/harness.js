/**
 * 极简测试骨架 —— 不引第三方框架，node tests/run.js 直接跑。
 * 小程序项目的逻辑层（services / utils / 云函数纯函数）都能在这里验证。
 */

const cases = [];
let currentFile = '';

function test(name, fn) {
  cases.push({ file: currentFile, name: name, fn: fn });
}

function setFile(name) {
  currentFile = name;
}

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error((label ? label + ' —— ' : '') + '期望 ' + e + '，实际 ' + a);
  }
}

function ok(value, label) {
  if (!value) throw new Error((label || '断言失败') + '：期望真值，实际 ' + JSON.stringify(value));
}

function notOk(value, label) {
  if (value) throw new Error((label || '断言失败') + '：期望假值，实际 ' + JSON.stringify(value));
}

function run() {
  let pass = 0;
  const failures = [];

  cases.forEach(function (c) {
    try {
      c.fn();
      pass++;
    } catch (err) {
      failures.push({ file: c.file, name: c.name, message: err && err.message });
    }
  });

  console.log('');
  failures.forEach(function (f) {
    console.log('  ✗ [' + f.file + '] ' + f.name + '\n      ' + f.message);
  });

  console.log('\n  ' + pass + '/' + (pass + failures.length) + ' 通过');
  if (failures.length) {
    console.log('  ' + failures.length + ' 条失败\n');
    process.exitCode = 1;
  } else {
    console.log('  全部通过 ✓\n');
  }
  return failures.length === 0;
}

module.exports = { test, setFile, eq, ok, notOk, run, cases };

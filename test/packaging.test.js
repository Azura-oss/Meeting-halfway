const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const config = require(path.join(ROOT, 'project.config.json'));
const appConfig = require(path.join(ROOT, 'app.json'));

test('真机调试包排除仅开发阶段的大目录', () => {
  const ignoredFolders = new Set(
    config.packOptions.ignore
      .filter(item => item.type === 'folder')
      .map(item => item.value)
  );

  assert(ignoredFolders.has('node_modules'));
  assert(ignoredFolders.has('test'));
  assert(ignoredFolders.has('docs'));
});

test('云函数目录内不得存放任何含密钥的文件', () => {
  // 实测（微信开发者工具 2.02.2608080）：
  //   1. 在 cloudfunctions/ 放入 200KB 的 .bin 探针后，预览包体从 95.1KB 涨到
  //      290.4KB（+200000 字节）—— 无论探针放在 cloudfunctions/ 根目录还是
  //      函数子目录内，结果相同。说明云函数目录下的文件确实会进入小程序包。
  //   2. 把 cloudfunctions 加入 packOptions.ignore 并重载项目配置
  //      （cli close + cli open）后探针依然生效，说明打包器会强制包含
  //      cloudfunctionRoot，忽略规则无效。
  //   3. 同样位置放 2KB 的 .json（含 config.json）时包体数值未变化，
  //      但尚不能据此断定 .json 一定被排除（也可能是包体统计口径所致），
  //      未能取得包内实际文件清单作为确证。
  //
  // 结论：无法证实 cloudfunctions/*/config.json 不会被打包，因此按"会"处理。
  // 约定：密钥只保存在云函数环境变量（控制台 / CloudBase CLI）中，
  // 不落在 cloudfunctions/ 下的任何文件里。
  const fnRoot = path.join(ROOT, 'cloudfunctions');
  const offenders = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name === 'config.json' && path.dirname(full) !== fnRoot) offenders.push(path.relative(ROOT, full));
    }
  };
  walk(fnRoot);

  assert.deepEqual(offenders, [], '以下文件会被打进小程序包，可能泄露密钥，请改用云函数环境变量：' + offenders.join(', '));
});

test('不声明代码未调用的定位私有接口', () => {
  assert.equal(appConfig.permission, undefined);
  assert.equal(appConfig.requiredPrivateInfos, undefined);
});

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const config = require(path.join(__dirname, '..', 'project.config.json'));
const appConfig = require(path.join(__dirname, '..', 'app.json'));

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

test('不声明代码未调用的定位私有接口', () => {
  assert.equal(appConfig.permission, undefined);
  assert.equal(appConfig.requiredPrivateInfos, undefined);
});

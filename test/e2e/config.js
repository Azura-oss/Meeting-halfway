const path = require('path');

module.exports = Object.freeze({
  projectPath: path.resolve(__dirname, '../..'),
  cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  defaultTimeoutMs: 10000,
  screenshotDir: path.resolve(__dirname, 'screenshots')
});

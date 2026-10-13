// 应用级用例：Mock 场景控制面只在 Mock 模式下暴露，正式（真实接口）模式无调试注入入口。
const path = require('path');
const { api, assert } = require('./helpers');

const APP_PATH = path.resolve(__dirname, '../../app.js');
let capturedApp = null;
global.App = definition => { capturedApp = definition; };

function loadApp() {
  capturedApp = null;
  delete require.cache[require.resolve(APP_PATH)];
  require(APP_PATH);
  assert(capturedApp, 'app.js 没有调用 App()');
  return capturedApp;
}

module.exports = {
  name: '应用级（Mock 控制面门禁）',
  cases: [
    {
      name: 'Mock 模式暴露场景控制，真实模式不暴露任何调试注入',
      async run() {
        api.setUseMock(true);
        api.resetMock();
        const mockApp = loadApp();
        const mockThis = { globalData: {} };
        mockApp.onLaunch.call(mockThis);
        assert(mockThis.globalData.mockControl, 'Mock 模式应暴露 mockControl');
        assert.strictEqual(typeof mockThis.globalData.mockControl.setScenario, 'function');
        assert.strictEqual(typeof mockThis.globalData.mockControl.getScenario, 'function');
        assert.strictEqual(typeof mockThis.globalData.mockControl.reset, 'function');

        api.setUseMock(false);
        const realApp = loadApp();
        const realThis = { globalData: {} };
        realApp.onLaunch.call(realThis);
        assert.strictEqual(realThis.globalData.mockControl, null, '真实模式不得暴露调试注入');

        api.setUseMock(true);
      }
    },
    {
      name: 'setScenario 返回实际场景名，getScenario 可查询',
      async run() {
        api.setUseMock(true);
        api.resetMock();
        assert.strictEqual(api.getMockScenario(), 'normal', '默认场景应为 normal');
        const result = api.setMockScenario('asrRecognize:missing');
        assert.strictEqual(result, 'asrRecognize:missing', 'setScenario 应返回实际场景名');
        assert.strictEqual(api.getMockScenario(), 'asrRecognize:missing', 'getScenario 应返回当前场景');
      }
    },
    {
      name: 'reset 返回 normal 并清除场景',
      async run() {
        api.setUseMock(true);
        api.setMockScenario('asrRecognize:missing');
        const result = api.resetMock();
        assert.strictEqual(result, 'normal', 'reset 应返回 normal');
        assert.strictEqual(api.getMockScenario(), 'normal', 'reset 后场景应为 normal');
      }
    }
  ]
};

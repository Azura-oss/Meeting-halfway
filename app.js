App({
  globalData: {
    pendingSearchContext: null,
    pendingDraft: null
  },
  onLaunch() {
    // 仅供开发者工具切换 Mock 场景；页面业务不得读取此控制器。
    // 正式（真实接口）模式下不暴露任何调试注入入口。
    const api = require('./utils/api');
    this.globalData.mockControl = api.isUseMock()
      ? { setScenario: api.setMockScenario, getScenario: api.getMockScenario, reset: api.resetMock }
      : null;
  }
});

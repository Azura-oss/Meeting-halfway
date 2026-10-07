/**
 * 全局配置（接口层专用）
 * 依据：PRD V2.1 + 接口约定 V1.1（冲突时以 PRD 为准）
 * 只被 utils/api.js、utils/mockData.js 引用，不侵入页面代码。
 */

module.exports = {
  // 是否为接口层开启本地 mock：true = 不请求云函数，直接用 utils/mockData.js 的假数据
  useMock: true,

  // 模拟网络耗时（ms），设为 0 可立即返回
  mockDelay: 300,

  /**
   * 云开发环境 ID
   * 由后端（高）提供，联调时替换为真实值。
   * ⚠️ 前端不得把真实环境 ID 提交到公开仓库：请用 project.private.config.json
   * 或本地 .env 保存真实值，公开仓库中只保留此占位符。
   */
  cloudEnv: 'your-cloud-env-id',

  // 云函数清单（与接口约定 V1.1 云函数总览一致；语义解析统一命名为 parseIntent）
  cloudFunctions: {
    searchPOI: 'searchPOI',
    asrRecognize: 'asrRecognize',
    parseIntent: 'parseIntent',
    getRecommendations: 'getRecommendations',
    getRoutes: 'getRoutes',
    getPlaceDetail: 'getPlaceDetail',
    toggleFavorite: 'toggleFavorite',
    getFavorites: 'getFavorites',
    saveHistory: 'saveHistory',
    getHistory: 'getHistory',
    clearHistory: 'clearHistory',
    reportEvent: 'reportEvent'
  },

  // AI 类云函数：供接口适配层判断两套返回结构（{ text } / { intent } 与直接字段）
  aiFunctions: ['asrRecognize', 'parseIntent'],

  // 统一返回结构：只保留成功码；业务错误码按接口返回处理
  code: {
    success: 0
  },

  defaultErrorMsg: '网络开小差了',

  // 本地缓存 key（与页面现有缓存保持一致，保证数据互通）
  storageKeys: {
    favorites: 'myFavorites',
    history: 'myHistory'
  },

  // 业务常量（PRD A2 人数上限 6 / 第 8 章历史 50 条 / B5 搜索半径）
  limits: {
    minPersonCount: 2,
    maxPersonCount: 6,
    maxHistory: 50,
    initialRadius: 1000,
    expandedRadius: 5000
  },

  // 出行方式（PRD A9：每人单选一种）
  transportOptions: [
    { value: 'walking', label: '步行' },
    { value: 'driving', label: '开车' },
    { value: 'subway', label: '地铁' },
    { value: 'bus', label: '公交' }
  ],

  // 地铁双策略（PRD B3）：仅当所有人出行方式都为地铁时才下发 strategy，否则传 null
  strategyEnum: {
    leastTransfer: 'least_transfer',
    leastStops: 'least_stops'
  },
  strategyList: [
    { key: 'least_transfer', name: '最少换乘' },
    { key: 'least_stops', name: '最少站点' }
  ],

  // 大众点评跳转：实际地址以 getPlaceDetail 返回的 dianpingUrl / dianpingFallbackUrl 为准，
  // 此处只保留兜底文案，不写死 appId 与路径
  dianping: {
    failMsg: '暂无法打开点评页面'
  },

  // 埋点事件（PRD 第 7 章 + V1.1 事件清单）
  events: {
    appLaunch: 'app_launch',
    search: 'search',
    resultExpose: 'result_expose',
    voiceUse: 'voice_use',
    placeDetail: 'place_detail',
    favorite: 'favorite',
    pin: 'pin',
    historyClick: 'history_click',
    routeView: 'route_view'
  },

  // 提示文案（与 PRD 一致，统一维护避免各页面不一致）
  messages: {
    poiUnselected: '还有 {n} 个出发地没有选定，请从联想列表中选择具体地点',
    voiceIncomplete: '请重说，还缺 {n} 项，请补充',
    voiceComplete: '信息完整，可以点击下方进入下一步',
    expanded: '1km 范围内没有，已为您展示 5km 范围内的选择',
    emptyPlaces: '附近 5km 内暂无符合条件的场所，换个组合可能就有结果了',
    networkError: '网络开小差了',
    historyEmptyToClear: '暂无可清空的历史'
  }
};

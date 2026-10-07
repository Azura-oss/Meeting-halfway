/**
 * 「哪见」统一接口层
 * ------------------------------------------------------------------
 * 1. 所有接口统一返回 { code, msg, data }，code === 0 表示成功；
 * 2. config.useMock === true 时走 utils/mockData.js 本地假数据，不请求云函数；
 *    改为 false 后自动切换到 wx.cloud.callFunction，页面代码无需任何改动；
 *    云函数调用前会先 wx.cloud.init({ env: cloudEnv })，调用时再显式传 config.env；
 *    cloudEnv 优先取本地私有文件 utils/config.local.js（不提交），
 *    读不到才回落 utils/config.js 的占位符，页面代码不得硬编码环境 ID；
 * 3. 所有接口都返回 Promise，并且在内部 try...catch，
 *    异常时统一返回 { code: 500, msg: '网络开小差了', data: null }，页面不会崩。
 *
 * 页面接入示例（本轮不改页面，仅备后续使用）：
 *   const api = require('../../utils/api');
 *   api.searchPOI({ keyword: '武侯' }).then(res => {
 *     if (res.code === 0) {
 *       this.setData({ poiList: res.data });
 *     } else {
 *       wx.showToast({ title: res.msg, icon: 'none' });
 *     }
 *   });
 */
const config = require('./config');
const mock = require('./mockData');

// 优先读取本地私有配置（utils/config.local.js，已在 .gitignore 中忽略），
// 拿不到时回落到 utils/config.js 中的占位符，保证公开仓库无敏感信息也能跑通 mock。
let localConfig = {};

try {
  localConfig = require('./config.local') || {};
} catch (err) {
  localConfig = {};
}

// 最终生效的云开发环境 ID
const cloudEnv = localConfig.cloudEnv || config.cloudEnv;

// 运行时可切换的 mock 开关（默认取 config.useMock）
let mockEnabled = !!config.useMock;

/* ==================== 基础工具 ==================== */

function success(data) {
  return {
    code: config.code.success,
    msg: 'success',
    data: typeof data === 'undefined' ? null : data
  };
}

// 本地异常统一兜底码：成功码见 config.code.success，其余业务错误码按接口返回原样透出
const FALLBACK_FAIL_CODE = 500;

function failure(msg) {
  return {
    code: FALLBACK_FAIL_CODE,
    msg: msg || config.defaultErrorMsg,
    data: null
  };
}

function delay(ms) {
  if (!ms) {
    return Promise.resolve();
  }

  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ==================== 请求通道 ==================== */

// 本地 mock 通道：延迟 + 异常兜底
function mockRequest(handler, params) {
  return delay(config.mockDelay).then(() => {
    try {
      return success(handler(params || {}));
    } catch (err) {
      console.error('[api][mock] 执行出错', err);
      return failure();
    }
  });
}

// 云环境是否已初始化（页面不得硬编码环境 ID，统一从 config.cloudEnv 取）
let cloudInited = false;

function ensureCloudInit() {
  if (cloudInited) {
    return true;
  }

  if (!wx.cloud || !wx.cloud.init) {
    return false;
  }

  try {
    wx.cloud.init({
      env: cloudEnv,
      traceUser: true
    });
    cloudInited = true;
  } catch (err) {
    console.error('[api] 云开发初始化失败，请检查 utils/config.local.js 的 cloudEnv 是否为真实环境 ID', err);
  }

  return cloudInited;
}

function isAiFunction(name) {
  return (config.aiFunctions || []).indexOf(name) > -1;
}

// AI 函数（asrRecognize / parseIntent）存在两套返回结构，这里统一拍平
// 结构一：{ text }                结构二：{ text, intent: { count, departures, ... } }
function normalizeResult(name, result) {
  if (!result || typeof result.code === 'undefined') {
    return failure();
  }

  if (!isAiFunction(name)) {
    return result;
  }

  const data = result.data;

  if (data && typeof data === 'object' && data.intent) {
    return Object.assign({}, result, {
      data: Object.assign({}, data, data.intent)
    });
  }

  return result;
}

// 云函数通道：统一解析 { code, msg, data }
function cloudRequest(name, params) {
  return new Promise(resolve => {
    if (!wx.cloud || !wx.cloud.callFunction) {
      console.error('[api] 未开启云开发能力，已回退失败态');
      resolve(failure());
      return;
    }

    ensureCloudInit();

    wx.cloud.callFunction({
      name,
      // 调用时再次显式指定环境，避免多环境串号
      config: {
        env: cloudEnv
      },
      data: params || {},
      success: res => {
        resolve(normalizeResult(name, res && res.result));
      },
      fail: err => {
        console.error('[api] 云函数调用失败：' + name, err);
        resolve(failure());
      }
    });
  });
}

// 统一入口：key 对应 config.cloudFunctions
function request(key, params, mockHandler) {
  if (mockEnabled) {
    return mockRequest(mockHandler, params);
  }

  const name = config.cloudFunctions[key];

  if (!name) {
    return mockRequest(mockHandler, params);
  }

  return cloudRequest(name, params);
}

/* ==================== 模块 A：出发信息输入 ==================== */

// POI 联想搜索（限成都市域）：支持 api.searchPOI('武侯') 或 api.searchPOI({ keyword: '武侯' })
function searchPOI(params) {
  const payload = typeof params === 'string' ? { keyword: params } : (params || {});

  return request('searchPOI', payload, mock.searchPOI);
}

// 语音识别：入参 { fileID, audioDurationMs }，返回 { text, audioDurationMs }
function asrRecognize(params) {
  return request('asrRecognize', params || {}, mock.asrRecognize);
}

// 语义解析：入参 { text }，返回 { count, isComplete, departures, transport, preferences, missingItems }
function parseIntent(params) {
  return request('parseIntent', params || {}, mock.parseIntent);
}

/* ==================== 模块 B：折中推荐 ==================== */

// 折中推荐：入参 { departures, preferences, strategy }
// strategy 仅在所有人出行方式都为地铁时下发，否则传 null
function getRecommendations(params) {
  return request('getRecommendations', params || {}, mock.getRecommendations);
}

// 每人路线：入参 { placeId, departures, transport }，返回 { polylines }
function getRoutes(params) {
  return request('getRoutes', params || {}, mock.getRoutes);
}

/* ==================== 模块 C：店铺详情 ==================== */

// 店铺详情：入参 { placeId, departures }
// 若暂未返回 participantMetrics，页面可用结果页带入的到达数据兜底
function getPlaceDetail(params) {
  return request('getPlaceDetail', params || {}, mock.getPlaceDetail);
}

/* ==================== 模块 D：收藏与置顶 ==================== */

function getFavorites() {
  return request('getFavorites', {}, mock.getFavorites);
}

function toggleFavorite(params) {
  return request('toggleFavorite', params || {}, mock.toggleFavorite);
}

function addFavorite(place) {
  return toggleFavorite({
    placeId: place && place.id,
    place,
    action: 'add'
  });
}

function removeFavorite(placeId) {
  return toggleFavorite({
    placeId,
    action: 'remove'
  });
}

/* ==================== 模块 E：历史记录 ==================== */

function saveHistory(record) {
  return request('saveHistory', record || {}, mock.saveHistory);
}

function getHistory() {
  return request('getHistory', {}, mock.getHistory);
}

function clearHistory() {
  return request('clearHistory', {}, mock.clearHistory);
}

/* ==================== 埋点 ==================== */

function reportEvent(eventName, properties) {
  return request('reportEvent', {
    eventName,
    properties: properties || {}
  }, mock.reportEvent);
}

/* ==================== 通用能力 ==================== */

// 直接调用任意云函数（后续新增接口时无需改本文件）
function callFunction(name, data) {
  if (mockEnabled) {
    return Promise.resolve(failure('mock 模式下不支持直接调用云函数'));
  }

  return cloudRequest(name, data);
}

// 运行时切换 mock（例如联调时 api.setUseMock(false)）
function setUseMock(enabled) {
  mockEnabled = !!enabled;
  config.useMock = mockEnabled;
}

function isUseMock() {
  return mockEnabled;
}

module.exports = {
  searchPOI,
  asrRecognize,
  parseIntent,
  getRecommendations,
  getRoutes,
  getPlaceDetail,
  getFavorites,
  toggleFavorite,
  addFavorite,
  removeFavorite,
  saveHistory,
  getHistory,
  clearHistory,
  reportEvent,
  callFunction,
  setUseMock,
  isUseMock,

  // 常量透出，页面可直接取枚举与文案，避免各页面写死
  config,
  placeCategories: mock.placeCategories,
  transportOptions: mock.transportOptions,
  strategyList: mock.strategyList
};

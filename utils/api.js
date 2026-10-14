/** 前端统一接口层：页面只接收业务数据或捕获标准异常。 */
const config = require('./config');
const mock = require('./mockData');

let localConfig = {};
try { localConfig = require('./config.local') || {}; } catch (err) { localConfig = {}; }

const cloudEnv = localConfig.cloudEnv || config.cloudEnv;
let mockEnabled = !!config.useMock;
let cloudInited = false;
const selectiveRealEnabled = typeof wx !== 'undefined' && typeof wx.getAccountInfoSync === 'function';
const realFunctionNames = new Set(selectiveRealEnabled && Array.isArray(localConfig.realFunctions)
  ? localConfig.realFunctions.filter(name => typeof name === 'string' && name)
  : []);

function shouldUseMock(name) {
  return mockEnabled && !realFunctionNames.has(name);
}

function createError(options) {
  const source = options || {};
  const error = new Error(source.message || config.defaultErrorMsg);
  error.code = typeof source.code === 'undefined' ? 500 : source.code;
  error.retryable = !!source.retryable;
  error.requestId = source.requestId || null;
  error.functionName = source.functionName || '';
  return error;
}

function normalizeError(err, functionName) {
  if (err && err.functionName && typeof err.retryable === 'boolean') return err;
  return createError({
    message: err && err.message,
    code: err && err.code,
    retryable: err && typeof err.retryable === 'boolean' ? err.retryable : true,
    requestId: err && err.requestId,
    functionName
  });
}

function logResult(name, startedAt, ok, requestId, code) {
  const payload = { functionName: name, durationMs: Date.now() - startedAt, requestId: requestId || null };
  if (ok) console.info('[api][success]', payload);
  else { payload.code = code; console.error('[api][failure]', payload); }
}

function delay(ms) {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

function ensureCloudInit() {
  if (cloudInited) return;
  if (!wx.cloud || !wx.cloud.init) throw createError({ message: '未开启云开发能力', code: 500, functionName: 'cloud.init' });
  wx.cloud.init({ env: cloudEnv, traceUser: true });
  cloudInited = true;
}

function callCloud(name, data) {
  ensureCloudInit();
  return new Promise((resolve, reject) => wx.cloud.callFunction({
    name,
    config: { env: cloudEnv },
    data: data || {},
    success: res => resolve((res && res.result) || {}),
    fail: reject
  }));
}

function parseAiResult(name, body) {
  if (!body || body.ok !== true) throw createError({
    message: body && body.message,
    code: body && body.code,
    retryable: body && body.retryable,
    requestId: body && body.requestId,
    functionName: name
  });
  if (name === 'parseIntent') return Object.assign({}, body.intent || {}, { requestId: body.requestId || null });
  return { text: body.text || '', audioDurationMs: Number(body.audioDurationMs) || 0, requestId: body.requestId || null };
}

function parseBusinessResult(name, body) {
  if (!body || body.code !== 0) {
    const code = body && typeof body.code !== 'undefined' ? body.code : 500;
    throw createError({
      message: body && body.msg,
      code,
      retryable: code === 429 || code >= 500,
      requestId: body && body.requestId,
      functionName: name
    });
  }
  return body.data;
}

async function request(key, params, handler) {
  const name = config.cloudFunctions[key] || key;
  const startedAt = Date.now();
  try {
    let data;
    let requestId = null;
    if (shouldUseMock(name)) {
      await delay(config.mockDelay);
      data = handler(params || {});
    } else {
      const body = await callCloud(name, params || {});
      requestId = body.requestId || null;
      data = (config.aiFunctions || []).indexOf(name) >= 0 ? parseAiResult(name, body) : parseBusinessResult(name, body);
    }
    logResult(name, startedAt, true, requestId || (data && data.requestId));
    return data;
  } catch (err) {
    const normalized = normalizeError(err, name);
    logResult(name, startedAt, false, normalized.requestId, normalized.code);
    throw normalized;
  }
}

function uploadVoice(tempFilePath) {
  ensureCloudInit();
  if (!wx.cloud.uploadFile) return Promise.reject(createError({ message: '语音上传能力不可用', code: 500, functionName: 'asrRecognize' }));
  const suffix = String(tempFilePath || '').split('.').pop() || 'mp3';
  return wx.cloud.uploadFile({
    cloudPath: 'voice-temp/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + suffix,
    filePath: tempFilePath
  }).then(res => ({ fileID: res.fileID, format: suffix }));
}

async function cleanupUploadedVoice(fileID) {
  if (typeof fileID !== 'string' || !fileID.startsWith('cloud://') || !fileID.includes('/voice-temp/')) return;
  if (!wx.cloud || typeof wx.cloud.deleteFile !== 'function') return;
  try {
    await wx.cloud.deleteFile({ fileList: [fileID] });
  } catch (err) {
    console.warn('[api][voice_cleanup_failed]', {
      code: err && err.code ? String(err.code) : 'UNKNOWN'
    });
  }
}

function searchPOI(params) {
  return request('searchPOI', typeof params === 'string' ? { keyword: params } : (params || {}), mock.searchPOI);
}

async function asrRecognize(params) {
  const payload = params || {};
  const name = config.cloudFunctions.asrRecognize || 'asrRecognize';
  if (shouldUseMock(name) || payload.fileID) return request('asrRecognize', payload, mock.asrRecognize);
  if (!payload.tempFilePath) throw createError({ message: '录音文件不存在', code: 'INVALID_INPUT', functionName: 'asrRecognize' });
  const uploaded = await uploadVoice(payload.tempFilePath);
  try {
    return await request('asrRecognize', uploaded, mock.asrRecognize);
  } finally {
    await cleanupUploadedVoice(uploaded.fileID);
  }
}

const parseIntent = params => request('parseIntent', params || {}, mock.parseIntent);
const getRecommendations = params => request('getRecommendations', params || {}, mock.getRecommendations);
const getRoutes = params => request('getRoutes', params || {}, mock.getRoutes);
const getPlaceDetail = params => request('getPlaceDetail', params || {}, mock.getPlaceDetail);
const getFavorites = params => request('getFavorites', params || {}, mock.getFavorites);
const toggleFavorite = params => request('toggleFavorite', params || {}, mock.toggleFavorite);
const saveHistory = params => request('saveHistory', params || {}, mock.saveHistory);
const getHistory = params => request('getHistory', params || {}, mock.getHistory);
const clearHistory = params => request('clearHistory', params || {}, mock.clearHistory);

function reportEvent(eventName, properties, page) {
  return request('reportEvent', { eventName, properties: properties || {}, page: page || '' }, mock.reportEvent);
}

function callFunction(name, data) {
  if (shouldUseMock(name)) return Promise.reject(createError({ message: 'Mock 模式禁止直接调用云函数', code: 400, functionName: name }));
  return request(name, data || {}, () => null);
}

function setUseMock(enabled) { mockEnabled = !!enabled; }
function isUseMock() { return mockEnabled; }
function setMockScenario(name) { return mock.setScenario(name); }
function getMockScenario() { return mock.getScenario(); }
function resetMock() { return mock.reset(); }

module.exports = {
  searchPOI, asrRecognize, parseIntent, getRecommendations, getRoutes, getPlaceDetail,
  getFavorites, toggleFavorite, saveHistory, getHistory, clearHistory, reportEvent,
  callFunction, setUseMock, isUseMock, setMockScenario, getMockScenario, resetMock, createError,
  config,
  placeCategories: mock.placeCategories,
  transportOptions: mock.transportOptions,
  strategyList: mock.strategyList
};

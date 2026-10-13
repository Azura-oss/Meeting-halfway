const assert = require('assert');
const path = require('path');
const config = require('./config');

const storage = Object.create(null);
const calls = {
  toasts: [], modals: [], navigateTo: [], navigateBack: [], switchTab: [],
  clipboard: [], phone: [], locations: [], openSetting: 0
};
const app = { globalData: { pendingDraft: null, pendingSearchContext: null, detailContext: null } };
let capturedPage = null;
let modalConfirm = true;
let authorizeAllowed = true;

function clone(value) {
  return typeof value === 'undefined' ? undefined : JSON.parse(JSON.stringify(value));
}

function setByPath(target, key, value) {
  const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cursor = target;
  parts.slice(0, -1).forEach(part => {
    if (typeof cursor[part] === 'undefined') cursor[part] = {};
    cursor = cursor[part];
  });
  cursor[parts[parts.length - 1]] = value;
}

const recorder = {
  startCalls: [], stopCalls: 0, stopHandler: null, errorHandler: null,
  onStop(handler) { this.stopHandler = handler; },
  onError(handler) { this.errorHandler = handler; },
  start(options) { this.startCalls.push(options); },
  stop() { this.stopCalls += 1; }
};

global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = clone(value); },
  removeStorageSync(key) { delete storage[key]; },
  getRecorderManager() { return recorder; },
  showToast(options) { calls.toasts.push(clone(options)); },
  showModal(options) {
    calls.modals.push({ title: options.title, content: options.content, showCancel: options.showCancel });
    if (options.success) options.success({ confirm: modalConfirm, cancel: !modalConfirm });
  },
  authorize(options) { (authorizeAllowed ? options.success : options.fail)(); },
  openSetting() { calls.openSetting += 1; },
  navigateTo(options) { calls.navigateTo.push(options.url); if (options.complete) options.complete({}); },
  navigateBack(options) { calls.navigateBack.push(options || {}); },
  switchTab(options) { calls.switchTab.push(options.url); },
  setClipboardData(options) { calls.clipboard.push(options.data); if (options.success) options.success({}); },
  makePhoneCall(options) { calls.phone.push(options.phoneNumber); },
  openLocation(options) { calls.locations.push(clone(options)); },
  cloud: {
    init() { throw new Error('Mock 页面测试不得初始化云能力'); },
    uploadFile() { throw new Error('Mock 页面测试不得上传文件'); },
    callFunction() { throw new Error('Mock 页面测试不得调用云函数'); }
  }
};

global.getApp = () => app;
global.Page = definition => { capturedPage = definition; };

const api = require('../../utils/api');
api.config.mockDelay = 0;

function clearCalls() {
  Object.keys(calls).forEach(key => {
    if (Array.isArray(calls[key])) calls[key].length = 0;
    else calls[key] = 0;
  });
}

function resetEnvironment() {
  Object.keys(storage).forEach(key => delete storage[key]);
  clearCalls();
  app.globalData.pendingDraft = null;
  app.globalData.pendingSearchContext = null;
  app.globalData.detailContext = null;
  modalConfirm = true;
  authorizeAllowed = true;
  recorder.startCalls.length = 0;
  recorder.stopCalls = 0;
  recorder.stopHandler = null;
  recorder.errorHandler = null;
  api.setUseMock(true);
  api.resetMock();
  api.config.mockDelay = 0;
}

function loadPage(relativePath) {
  capturedPage = null;
  const filename = path.resolve(config.projectPath, relativePath);
  delete require.cache[require.resolve(filename)];
  require(filename);
  assert(capturedPage, '页面没有调用 Page(): ' + relativePath);
  const instance = Object.assign({}, capturedPage, { data: clone(capturedPage.data) });
  instance.setData = patch => {
    Object.keys(patch).forEach(key => setByPath(instance.data, key, clone(patch[key])));
  };
  return instance;
}

function event(dataset, value, touches) {
  return {
    currentTarget: { dataset: dataset || {} },
    detail: typeof value === 'undefined' ? {} : { value },
    touches: touches || []
  };
}

function setModalConfirm(value) { modalConfirm = !!value; }
function setAuthorizeAllowed(value) { authorizeAllowed = !!value; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitFor(predicate, message, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 1000);
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(5);
  }
  assert(predicate(), message || '等待页面状态超时');
}

const departures = [
  { participantId: 'self', label: '我', poiId: 'poi_1', name: '双流机场', lat: 30.5757, lng: 103.9472, transportMode: 'subway' },
  { participantId: 'p1', label: '2', poiId: 'poi_2', name: '武侯祠', lat: 30.6427, lng: 104.0433, transportMode: 'subway' }
];

module.exports = {
  api, app, assert, calls, departures, event, loadPage, recorder,
  resetEnvironment, setAuthorizeAllowed, setModalConfirm, sleep, storage, waitFor
};

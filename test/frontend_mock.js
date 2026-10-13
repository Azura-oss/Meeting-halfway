const assert = require('assert');

const storage = Object.create(null);
const calls = { init: 0, callFunction: 0, uploadFile: 0 };

global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; },
  cloud: {
    init() { calls.init += 1; },
    uploadFile() { calls.uploadFile += 1; return Promise.resolve({ fileID: 'cloud://test/voice-temp/a.mp3' }); },
    callFunction(options) {
      calls.callFunction += 1;
      let result;
      if (options.name === 'parseIntent') {
        result = { ok: true, intent: { partySize: 2, origins: ['武侯祠'], transportModes: ['subway'], placePreferences: ['咖啡厅'], missingFields: [], confidence: 0.9 }, requestId: 'cloud_ai' };
      } else if (options.name === 'asrRecognize') {
        result = { ok: true, text: '测试语音', audioDurationMs: 1000, requestId: 'cloud_asr' };
      } else {
        result = { code: 0, msg: 'success', data: [{ id: 'cloud_poi' }], requestId: 'cloud_business' };
      }
      options.success({ result });
    }
  }
};

const api = require('../utils/api');
api.config.mockDelay = 0;

const departures = [
  { participantId: 'self', label: '我', poiId: 'poi_1', name: '双流机场', lat: 30.5757, lng: 103.9472, transportMode: 'subway' },
  { participantId: 'p1', label: '2', poiId: 'poi_2', name: '武侯祠', lat: 30.6427, lng: 104.0433, transportMode: 'subway' }
];

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('✓', name);
  } catch (err) {
    console.error('✗', name, err);
    throw err;
  }
}

async function expectError(fn, code) {
  let caught;
  try { await fn(); } catch (err) { caught = err; }
  assert(caught, '应当抛出异常');
  assert.strictEqual(caught.code, code);
  assert.strictEqual(typeof caught.retryable, 'boolean');
  assert(caught.functionName);
  return caught;
}

(async () => {
  api.resetMock();
  await test('Mock POI 命中且字段完整', async () => {
    const data = await api.searchPOI({ keyword: '武侯', city: '成都', limit: 10 });
    assert(data.length > 0);
    ['id', 'title', 'address', 'lat', 'lng', 'city', 'district', 'type'].forEach(key => assert(Object.prototype.hasOwnProperty.call(data[0], key)));
  });
  await test('Mock 分支不初始化、调用或上传云能力', async () => {
    await api.asrRecognize({ tempFilePath: '/tmp/a.mp3' });
    assert.deepStrictEqual(calls, { init: 0, callFunction: 0, uploadFile: 0 });
  });
  await test('POI 空态与非法参数', async () => {
    assert.deepStrictEqual(await api.searchPOI({ keyword: '不存在地点' }), []);
    await expectError(() => api.searchPOI({ keyword: '', limit: 10 }), 400);
    await expectError(() => api.searchPOI({ keyword: '武侯', limit: 21 }), 400);
  });
  await test('意图解析使用 V1.1 字段', async () => {
    const intent = await api.parseIntent({ text: '我们仨从双流机场、武侯祠出发，坐地铁，想找咖啡厅' });
    assert.strictEqual(intent.partySize, 3);
    assert.deepStrictEqual(intent.origins, ['双流机场', '武侯祠']);
    assert.deepStrictEqual(intent.transportModes, ['subway']);
    assert.deepStrictEqual(intent.placePreferences, ['咖啡厅']);
    assert.deepStrictEqual(intent.missingFields, []);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(intent, 'missingItems'), false);
  });
  await test('意图缺项与都行全量偏好', async () => {
    const missing = await api.parseIntent({ text: '想找咖啡厅' });
    assert(missing.missingFields.includes('partySize'));
    assert(missing.confidence < 0.6);
    const any = await api.parseIntent({ text: '我们俩从双流机场和武侯祠出发，坐地铁，吃什么都行' });
    assert(any.placePreferences.length > 20);
    assert(!any.missingFields.includes('placePreferences'));
  });
  await test('推荐字段、多人指标与平均距离', async () => {
    const result = await api.getRecommendations({ departures, preferences: ['咖啡厅'], strategy: 'least_transfer', midpointMode: 'auto' });
    assert.strictEqual(result.searchRadiusMeters, 1000);
    assert(result.places.length > 0);
    const place = result.places[0];
    assert.strictEqual(place.participantMetrics.length, 2);
    const average = Math.round(place.participantMetrics.reduce((sum, item) => sum + item.distanceMeters, 0) / 2);
    assert.strictEqual(place.averageDistanceMeters, average);
  });
  await test('推荐扩大、5km 空态、人数上限和混合交通', async () => {
    api.setMockScenario('getRecommendations:expanded');
    const expanded = await api.getRecommendations({ departures, preferences: ['咖啡厅'], strategy: 'least_transfer' });
    assert.strictEqual(expanded.distanceExpanded, true);
    assert.strictEqual(expanded.searchRadiusMeters, 5000);
    api.setMockScenario('normal');
    const empty = await api.getRecommendations({ departures, preferences: ['美术馆'] });
    assert.strictEqual(empty.distanceExpanded, true);
    assert.deepStrictEqual(empty.places, []);
    await expectError(() => api.getRecommendations({ departures: Array(7).fill(departures[0]), preferences: [] }), 400);
    const mixed = JSON.parse(JSON.stringify(departures));
    mixed[1].transportMode = 'bus';
    const mixedResult = await api.getRecommendations({ departures: mixed, preferences: ['咖啡厅'], strategy: 'least_transfer' });
    assert.strictEqual(mixedResult.strategy, null);
  });
  await test('路线只返回 routes 且顺序与参与人一致', async () => {
    const result = await api.getRoutes({ placeId: 'p1', departures });
    assert.strictEqual(result.routes.length, 2);
    assert.strictEqual(result.routes[0].participantId, 'self');
    assert(Array.isArray(result.routes[0].points));
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'polylines'), false);
    await expectError(() => api.getRoutes({ placeId: 'invalid', departures }), 404);
  });
  await test('超时错误保留元数据并可复位', async () => {
    api.setMockScenario('getRoutes:timeout');
    const err = await expectError(() => api.getRoutes({ placeId: 'p1', departures }), 504);
    assert.strictEqual(err.retryable, true);
    assert(err.requestId);
    api.resetMock();
    assert((await api.getRoutes({ placeId: 'p1', departures })).routes.length === 2);
  });
  await test('收藏 add/remove 幂等并支持分页', async () => {
    let result = await api.toggleFavorite({ placeId: 'p1', action: 'add' });
    assert.strictEqual(result.isFavorite, true);
    await api.toggleFavorite({ placeId: 'p1', action: 'add' });
    let list = await api.getFavorites({ page: 1, pageSize: 1 });
    assert.strictEqual(list.total, 1);
    assert.strictEqual(list.items.length, 1);
    result = await api.toggleFavorite({ placeId: 'p1', action: 'remove' });
    assert.strictEqual(result.isFavorite, false);
    await api.toggleFavorite({ placeId: 'p1', action: 'remove' });
    list = await api.getFavorites({ page: 1, pageSize: 50 });
    assert.strictEqual(list.total, 0);
  });
  await test('地点详情空值和收藏状态', async () => {
    await api.getRecommendations({ departures, preferences: ['咖啡厅'] });
    await api.toggleFavorite({ placeId: 'p2', action: 'add' });
    const detail = await api.getPlaceDetail({ placeId: 'p2' });
    assert.strictEqual(detail.isFavorite, true);
    assert.strictEqual(detail.participantMetrics.length, 2);
    assert(Array.isArray(detail.photos));
  });
  await test('历史去重、更新、分页和清空不影响收藏', async () => {
    const searchedAt = '2026-10-10T10:00:00+08:00';
    const payload = {
      departures, preferences: ['咖啡厅'], strategy: 'least_transfer', searchedAt,
      midpoint: { name: '春熙路', lat: 30.65, lng: 104.08, address: '成都', source: 'auto' },
      searchRadiusMeters: 1000, distanceExpanded: false,
      resultSnapshot: { placeIds: ['p1'], places: [] }, pinnedIds: [], favoritedIds: ['p2']
    };
    const first = await api.saveHistory(payload);
    const second = await api.saveHistory(Object.assign({}, payload, {
      searchedAt: '2026-10-10T10:05:00+08:00',
      pinnedIds: ['p1']
    }));
    assert.strictEqual(first.historyId, second.historyId);
    let history = await api.getHistory({ page: 1, pageSize: 20 });
    assert.strictEqual(history.total, 1);
    assert.deepStrictEqual(history.items[0].pinnedIds, ['p1']);
    assert.strictEqual((await api.clearHistory({ confirm: true })).deletedCount, 1);
    assert.strictEqual((await api.clearHistory({ confirm: true })).deletedCount, 0);
    assert.strictEqual((await api.getFavorites({ page: 1, pageSize: 50 })).total, 1);
    await expectError(() => api.clearHistory({ confirm: false }), 400);
  });
  await test('历史最多保留 50 条并正确分页', async () => {
    for (let i = 0; i < 51; i += 1) {
      await api.saveHistory({ departures, preferences: ['偏好' + i], searchedAt: new Date(1700000000000 + i * 1000).toISOString(), resultSnapshot: null, pinnedIds: [], favoritedIds: [] });
    }
    const page = await api.getHistory({ page: 2, pageSize: 20 });
    const all = await api.getHistory({ page: 1, pageSize: 50 });
    assert.strictEqual(all.total, 50);
    assert.strictEqual(page.items.length, 20);
  });
  await test('场景控制：默认 normal，setScenario 返回实际名，getScenario 可查询', async () => {
    api.resetMock();
    assert.strictEqual(api.getMockScenario(), 'normal');
    const ret = api.setMockScenario('asrRecognize:missing');
    assert.strictEqual(ret, 'asrRecognize:missing');
    assert.strictEqual(api.getMockScenario(), 'asrRecognize:missing');
  });

  await test('场景控制：asrRecognize:missing 返回缺项文本', async () => {
    api.setMockScenario('asrRecognize:missing');
    const asr = await api.asrRecognize({ audioDurationMs: 2000 });
    assert.strictEqual(asr.text, '想找咖啡厅');
  });

  await test('场景控制：模块重新加载后场景仍保持', async () => {
    api.setMockScenario('asrRecognize:missing');
    // 模拟模块重新加载：清除 require cache 后重新 require
    const mockPath = require.resolve('../utils/mockData');
    delete require.cache[mockPath];
    const reloadedMock = require('../utils/mockData');
    assert.strictEqual(reloadedMock.getScenario(), 'asrRecognize:missing', '重新加载后应从存储恢复场景');
    // 恢复原始模块引用
    delete require.cache[mockPath];
    require('../utils/mockData');
  });

  await test('场景控制：reset 返回 normal 并清除缓存和 ASR 默认文本', async () => {
    api.setMockScenario('asrRecognize:missing');
    const ret = api.resetMock();
    assert.strictEqual(ret, 'normal');
    assert.strictEqual(api.getMockScenario(), 'normal');
    const asr = await api.asrRecognize({ audioDurationMs: 3200 });
    assert.strictEqual(asr.text, '我们仨从双流机场、武侯祠出发，坐地铁，想找咖啡厅');
  });

  await test('场景控制：缓存读写异常时安全回退不崩溃', async () => {
    // 临时替换 wx 存储 API 为会抛异常的版本
    const origGet = wx.getStorageSync;
    const origSet = wx.setStorageSync;
    const origRemove = wx.removeStorageSync;
    wx.getStorageSync = () => { throw new Error('storage read error'); };
    wx.setStorageSync = () => { throw new Error('storage write error'); };
    wx.removeStorageSync = () => { throw new Error('storage remove error'); };
    try {
      // 即使存储全部异常，setScenario/getScenario/reset 仍应正常工作
      const ret = api.setMockScenario('asrRecognize:missing');
      assert.strictEqual(ret, 'asrRecognize:missing');
      assert.strictEqual(api.getMockScenario(), 'asrRecognize:missing');
      const asr = await api.asrRecognize({ audioDurationMs: 1000 });
      assert.strictEqual(asr.text, '想找咖啡厅');
      const resetRet = api.resetMock();
      assert.strictEqual(resetRet, 'normal');
      assert.strictEqual(api.getMockScenario(), 'normal');
    } finally {
      wx.getStorageSync = origGet;
      wx.setStorageSync = origSet;
      wx.removeStorageSync = origRemove;
    }
  });

  await test('场景控制：不同测试之间不串场景', async () => {
    // 上一个测试已 reset，这里确认场景是 normal
    assert.strictEqual(api.getMockScenario(), 'normal');
    const asr = await api.asrRecognize({ audioDurationMs: 3200 });
    assert.strictEqual(asr.text, '我们仨从双流机场、武侯祠出发，坐地铁，想找咖啡厅');
  });

  await test('真实通道可解包业务、AI，并由 API 层上传语音', async () => {
    api.setUseMock(false);
    const poi = await api.searchPOI({ keyword: '云端' });
    assert.strictEqual(poi[0].id, 'cloud_poi');
    const intent = await api.parseIntent({ text: '测试' });
    assert.strictEqual(intent.partySize, 2);
    const asr = await api.asrRecognize({ tempFilePath: '/tmp/a.mp3' });
    assert.strictEqual(asr.text, '测试语音');
    assert.strictEqual(calls.init, 1);
    assert.strictEqual(calls.uploadFile, 1);
    api.setUseMock(true);
  });

  console.log('\n前端 Mock/API 测试通过：' + passed + '/' + passed);
})().catch(() => process.exit(1));

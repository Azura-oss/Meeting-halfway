const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const originalLoad = Module._load;
const originalRequireRealMap = process.env.REQUIRE_REAL_MAP;
const originalMapKey = process.env.TENCENT_MAP_KEY;

const cloudStub = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'DYNAMIC_CURRENT_ENV',
  getWXContext() { return { OPENID: 'o-test-user' }; },
  database() {
    return {
      command: { in(values) { return { values }; } },
      collection() { throw new Error('strict map guard should run before database access'); }
    };
  }
};

Module._load = function load(request) {
  if (request === 'wx-server-sdk') return cloudStub;
  return originalLoad.apply(this, arguments);
};
process.env.REQUIRE_REAL_MAP = 'true';
delete process.env.TENCENT_MAP_KEY;

const searchPOI = require('../cloudfunctions/searchPOI/index.js');
const getRecommendations = require('../cloudfunctions/getRecommendations/index.js');
const getRoutes = require('../cloudfunctions/getRoutes/index.js');

const departures = [
  { participantId: 'self', poiId: 'p1', name: '地点一', lat: 30.6, lng: 104.0, transportMode: 'subway' },
  { participantId: 'p1', poiId: 'p2', name: '地点二', lat: 30.7, lng: 104.1, transportMode: 'subway' }
];

test.after(() => {
  Module._load = originalLoad;
  if (originalRequireRealMap === undefined) delete process.env.REQUIRE_REAL_MAP;
  else process.env.REQUIRE_REAL_MAP = originalRequireRealMap;
  if (originalMapKey === undefined) delete process.env.TENCENT_MAP_KEY;
  else process.env.TENCENT_MAP_KEY = originalMapKey;
});

test('正式地图模式缺少 Key 时三个地图函数均明确失败，不返回种子数据', async () => {
  const poi = await searchPOI.main({ keyword: '武侯祠' });
  const recommendations = await getRecommendations.main({ departures, preferences: ['咖啡厅'] });
  const routes = await getRoutes.main({ placeId: 'p1', departures });

  for (const result of [poi, recommendations, routes]) {
    assert.equal(result.code, 502);
    assert.equal(result.data, null);
    assert.equal(result.msg, '地图服务暂时不可用');
  }
});

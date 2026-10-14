// 冒烟测试：stub wx-server-sdk（内存数据库），验证 9 个云函数的主流程
const Module = require('module');
const origLoad = Module._load;

const store = { places: [], favorites: [], history: [] };
let idSeq = 1;
let failPlaceWrites = false;

function match(d, q) {
  return Object.keys(q).every((k) => {
    const v = q[k];
    if (v && v.__in) return v.values.indexOf(d[k]) >= 0;
    return d[k] === v;
  });
}

function makeChain(arr, baseFilter) {
  let sorters = [];
  let skipN = 0;
  let limitN = Infinity;
  const api = {
    orderBy(field, dir) { sorters.push([field, dir]); return api; },
    skip(n) { skipN = n; return api; },
    limit(n) { limitN = n; return api; },
    async get() {
      let rows = arr.filter(baseFilter);
      for (const s of sorters) {
        rows = rows.slice().sort((a, b) => (s[1] === 'desc' ? (a[s[0]] < b[s[0]] ? 1 : -1) : (a[s[0]] > b[s[0]] ? 1 : -1)));
      }
      return { data: rows.slice(skipN, skipN + limitN) };
    },
    async count() { return { total: arr.filter(baseFilter).length }; },
    async remove() {
      const before = arr.length;
      const keep = arr.filter((d) => !baseFilter(d));
      arr.length = 0;
      arr.push.apply(arr, keep);
      return { stats: { removed: before - arr.length } };
    }
  };
  return api;
}

const wxStub = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'DYNAMIC_CURRENT_ENV',
  getWXContext() { return { OPENID: 'o-test-user' }; },
  database() {
    return {
      command: { in: (values) => ({ __in: true, values }) },
      collection(name) {
        const arr = store[name];
        return {
          where(q) { return makeChain(arr, (d) => match(d, q)); },
          async add({ data }) {
            if (name === 'places' && failPlaceWrites) throw new Error('simulated places write failure');
            data._id = 'id_' + (idSeq++);
            arr.push(data);
            return { _id: data._id };
          },
          doc(id) {
            return {
              async update({ data: patch }) {
                if (name === 'places' && failPlaceWrites) throw new Error('simulated places write failure');
                const d = arr.find((x) => x._id === id);
                if (d) Object.assign(d, patch);
              },
              async remove() {
                const i = arr.findIndex((x) => x._id === id);
                if (i >= 0) arr.splice(i, 1);
              }
            };
          }
        };
      }
    };
  }
};

Module._load = function (request) {
  if (request === 'wx-server-sdk') return wxStub;
  return origLoad.apply(this, arguments);
};

const SELF = { participantId: 'self', label: '我', poiId: 'poi_shuangliu_t1', name: '双流机场', lat: 30.5785, lng: 103.9471, transportMode: 'subway' };
const P1 = { participantId: 'p1', label: '小明', poiId: 'poi_wuhouci', name: '武侯祠', lat: 30.6429, lng: 104.0431, transportMode: 'bus' };

function assert(cond, label) {
  if (!cond) { console.error('FAIL: ' + label); process.exitCode = 1; }
  else console.log('PASS: ' + label);
}

(async () => {
  const searchPOI = require('../cloudfunctions/searchPOI/index.js');
  const s1 = await searchPOI.main({ keyword: '武侯' });
  if (process.env.TENCENT_MAP_KEY) {
    assert(s1.code === 0 && s1.data.length > 0 && s1.data.every((p) => typeof p.lat === 'number' && p.id && p.title), 'searchPOI 真实联想结果结构正确');
  } else {
    assert(s1.code === 0 && s1.data.some((p) => p.title.indexOf('武侯') >= 0), 'searchPOI 命中武侯祠（种子模式）');
  }
  const s2 = await searchPOI.main({ keyword: '' });
  assert(s2.code === 400, 'searchPOI 空关键词 400');

  const rec = require('../cloudfunctions/getRecommendations/index.js');
  const r1 = await rec.main({ departures: [SELF, P1], preferences: ['咖啡厅'], strategy: 'least_transfer' });
  assert(r1.code === 0, 'getRecommendations code 0');
  const hasRealMap = !!process.env.TENCENT_MAP_KEY;
  if (hasRealMap) {
    assert(r1.data.searchRadiusMeters === 1000 || r1.data.searchRadiusMeters === 5000, '搜索半径为 1000 或 5000');
    assert(r1.data.distanceExpanded === (r1.data.searchRadiusMeters === 5000), 'distanceExpanded 与扩径一致');
  } else {
    assert(r1.data.searchRadiusMeters === 5000 && r1.data.distanceExpanded === true, '1km 无结果自动扩到 5km（种子模式）');
  }
  assert(r1.data.places.length >= 1, '咖啡厅候选非空');
  const place = r1.data.places[0];
  assert(place.participantMetrics.length === 2, 'participantMetrics 两人');
  assert(place.averageDistanceMeters === Math.round(place.participantMetrics.reduce((s, m) => s + m.distanceMeters, 0) / 2), 'averageDistanceMeters 为均值');
  assert(typeof place.isFavorite === 'boolean' && place.openHours !== undefined, 'isFavorite/openHours 字段存在');
  assert(r1.data.strategy === null, '非全员 subway 时 strategy 为 null');
  assert(store.places.length >= 1, 'places 快照入库');

  const rSingle = await rec.main({ departures: [SELF], preferences: ['咖啡厅'] });
  assert(rSingle.code === 400, 'getRecommendations 拒绝少于 2 人');

  const seven = [];
  for (let i = 0; i < 7; i++) seven.push(Object.assign({}, SELF, { participantId: 'p' + i }));
  const r7 = await rec.main({ departures: seven, preferences: ['咖啡厅'] });
  assert(r7.code === 400 && r7.msg === '最多支持 6 人同行', '7 人返回 400 最多支持 6 人同行');

  const rArt = await rec.main({ departures: [SELF, P1], preferences: ['美术馆'] });
  if (hasRealMap) {
    assert(rArt.code === 0 && Array.isArray(rArt.data.places), '美术馆偏好结构正确（真实数据可能有结果）');
  } else {
    assert(rArt.code === 0 && rArt.data.places.length === 0 && rArt.data.distanceExpanded === true, '美术馆偏好返回空态（种子模式）');
  }

  failPlaceWrites = true;
  const rCacheFailure = await rec.main({
    departures: [Object.assign({}, SELF, { participantId: 'cache-self' }), P1],
    preferences: ['咖啡厅']
  });
  failPlaceWrites = false;
  assert(rCacheFailure.code === 500, 'places 快照入库失败时推荐不返回假成功');

  const getRoutes = require('../cloudfunctions/getRoutes/index.js');
  const g1 = await getRoutes.main({ placeId: place.id, departures: [SELF, P1] });
  assert(g1.code === 0 && g1.data.routes.length === 2, 'getRoutes 两人各一条');
  assert(g1.data.routes[0].points.length >= 2 && g1.data.routes[0].color, 'points 与 color 存在');
  const g2 = await getRoutes.main({ placeId: 'not_exist', departures: [SELF] });
  assert(g2.code === 400, 'getRoutes 拒绝少于 2 人');
  const g3 = await getRoutes.main({ placeId: 'not_exist', departures: [SELF, P1] });
  assert(g3.code === 404, '无效 placeId 404');

  const toggleFavorite = require('../cloudfunctions/toggleFavorite/index.js');
  const t1 = await toggleFavorite.main({ placeId: place.id, action: 'add' });
  await new Promise((r) => setTimeout(r, 350)); // 避开 300ms 连点限流（契约 6.1：连点触发 429）
  const t2 = await toggleFavorite.main({ placeId: place.id, action: 'add' });
  assert(t1.code === 0 && t1.data.isFavorite === true && t2.code === 0 && t2.data.isFavorite === true, '重复 add 幂等');
  assert(store.favorites.length === 1, 'favorites 唯一约束（内存验证）');

  const getPlaceDetail = require('../cloudfunctions/getPlaceDetail/index.js');
  const d1 = await getPlaceDetail.main({ placeId: place.id, departures: [SELF, P1], midpoint: r1.data.midpoint });
  assert(d1.code === 0 && d1.data.isFavorite === true, 'getPlaceDetail isFavorite=true');
  assert(d1.data.participantMetrics.length === 2 && d1.data.distanceToMidpointMeters > 0, 'getPlaceDetail 到达情况');
  const d2 = await getPlaceDetail.main({ placeId: place.id });
  assert(d2.data.participantMetrics.length === 0 && d2.data.averageDistanceMeters === null, '不传 departures 时空值形态');

  const getFavorites = require('../cloudfunctions/getFavorites/index.js');
  const f1 = await getFavorites.main({});
  assert(f1.code === 0 && f1.data.total === 1 && f1.data.items[0].id === place.id, 'getFavorites 1 条');

  const saveHistory = require('../cloudfunctions/saveHistory/index.js');
  const hSingle = await saveHistory.main({ departures: [SELF] });
  assert(hSingle.code === 400, 'saveHistory 拒绝少于 2 人');
  const h1 = await saveHistory.main({
    partySize: 2, departures: [SELF, P1], preferences: ['咖啡厅'], strategy: null,
    midpoint: r1.data.midpoint, searchedAt: '2026-10-09T14:30:00+08:00',
    searchRadiusMeters: 5000, distanceExpanded: true,
    resultSnapshot: { placeIds: [place.id], places: [] }, pinnedIds: [], favoritedIds: [place.id]
  });
  assert(h1.code === 0 && h1.data.historyId, 'saveHistory 返回 historyId');
  const h2 = await saveHistory.main({
    partySize: 2, departures: [SELF, P1], preferences: ['咖啡厅'], strategy: null,
    midpoint: r1.data.midpoint, searchedAt: '2026-10-09T14:30:00+08:00',
    resultSnapshot: null
  });
  assert(h2.data.historyId === h1.data.historyId, '重复上报去重返回同一 historyId');
  assert(store.history.length === 1, 'history 仅 1 条');
  const hInvalidSnapshot = await saveHistory.main({
    departures: [SELF, P1], preferences: ['快餐'], searchedAt: 'not-a-date',
    resultSnapshot: { placeIds: [], places: new Array(21).fill({ id: 'p' }) }
  });
  assert(hInvalidSnapshot.code === 400, 'saveHistory 拒绝超过 20 条的结果快照');
  const hInvalidDate = await saveHistory.main({
    departures: [SELF, P1], preferences: ['奶茶'], searchedAt: 'not-a-date',
    resultSnapshot: null
  });
  assert(hInvalidDate.code === 0 && Number.isFinite(Date.parse(store.history.find((h) => h._id === hInvalidDate.data.historyId).searchedAt)),
    'saveHistory 为非法 searchedAt 生成有效时间');

  const getHistory = require('../cloudfunctions/getHistory/index.js');
  const gh = await getHistory.main({});
  assert(gh.code === 0 && gh.data.items.length === 2, 'getHistory 2 条');
  const restored = gh.data.items.find((item) => item.id === h1.data.historyId);
  assert(restored.favoriteCount === 1 && restored.displayTime.length > 0, 'favoriteCount 与 displayTime');
  assert(restored.midpointMode === 'auto', 'getHistory 返回 midpointMode');

  const clearHistory = require('../cloudfunctions/clearHistory/index.js');
  const c1 = await clearHistory.main({ confirm: true });
  const c2 = await clearHistory.main({ confirm: true });
  const c3 = await clearHistory.main({ confirm: false });
  assert(c1.data.deletedCount === 2 && c2.data.deletedCount === 0, 'clearHistory 第二次 deletedCount=0');
  assert(c3.code === 400, 'confirm 非 true 400');
  assert(store.favorites.length === 1, '清空历史不影响收藏');

  console.log('=== DONE ===');
})().catch((e) => { console.error('ERROR', e); process.exitCode = 1; });

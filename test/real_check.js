// 真实 Key 下 getRoutes 深度验证：polyline 解码 / 换乘 / 站点数
// 用法：$env:TENCENT_MAP_KEY='你的Key'; node test/real_check.js
if (!process.env.TENCENT_MAP_KEY) {
  console.error('请先设置环境变量 TENCENT_MAP_KEY 再运行本脚本');
  process.exit(1);
}

const Module = require('module');
const origLoad = Module._load;
const store = { places: [], favorites: [], history: [] };
let idSeq = 1;
function match(d, q) { return Object.keys(q).every((k) => d[k] === q[k]); }
Module._load = function (request) {
  if (request === 'wx-server-sdk') {
    return {
      init() {},
      DYNAMIC_CURRENT_ENV: 'x',
      getWXContext() { return { OPENID: 'o-test' }; },
      database() {
        return {
          command: { in: (v) => v },
          collection(name) {
            const arr = store[name];
            return {
              where(q) { return { async get() { return { data: arr.filter((d) => match(d, q)) }; } }; },
              async add({ data }) { data._id = 'id' + (idSeq++); arr.push(data); return { _id: data._id }; },
              doc(id) { return { async update() {}, async remove() {} }; }
            };
          }
        };
      }
    };
  }
  return origLoad.apply(this, arguments);
};

(async () => {
  const rec = require('../cloudfunctions/getRecommendations/index.js');
  const routesFn = require('../cloudfunctions/getRoutes/index.js');
  const SELF = { participantId: 'self', label: '我', poiId: 'x', name: '双流机场', lat: 30.5785, lng: 103.9471, transportMode: 'subway' };
  const P1 = { participantId: 'p1', label: '小明', poiId: 'y', name: '武侯祠', lat: 30.6429, lng: 104.0431, transportMode: 'walking' };
  const r = await rec.main({ departures: [SELF, P1], preferences: ['咖啡厅'], strategy: null });
  console.log('midpoint:', JSON.stringify(r.data.midpoint));
  console.log('radius:', r.data.searchRadiusMeters, 'expanded:', r.data.distanceExpanded, 'places:', r.data.places.length);
  console.log('first place:', r.data.places[0].name, '| id:', r.data.places[0].id, '| avgDist:', r.data.places[0].averageDistanceMeters);
  const g = await routesFn.main({ placeId: r.data.places[0].id, departures: [SELF, P1] });
  for (const rt of g.data.routes) {
    console.log(JSON.stringify({
      participantId: rt.participantId, mode: rt.transportMode,
      distanceMeters: rt.distanceMeters, durationMinutes: rt.durationMinutes,
      transferCount: rt.transferCount, stopCount: rt.stopCount,
      points: rt.points.length, first: rt.points[0], last: rt.points[rt.points.length - 1]
    }));
  }
  console.log('=== OK ===');
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
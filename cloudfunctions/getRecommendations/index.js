// 云函数：getRecommendations（高-4、高-5）
// 用途：多人折中推荐（V1.1：participantMetrics / averageDistanceMeters / searchRadiusMeters / 6 人上限）
// 契约：《哪见接口约定 V1.1》4.1
// 说明：
//   1) 折中点：auto = 等权地理中心（有 Key 时逆地理编码补名称地址）；manual = 使用请求指定点
//   2) 搜索半径：先 1000m，无满足偏好的结果自动扩到 5000m 并置 distanceExpanded: true
//   3) 参与人到各场所的距离/耗时为占位估算（直线距离 × 绕行系数 ÷ 速度），结构严格对齐契约，
//      后续接入腾讯路径规划可无缝替换（见 9.2 验收策略：允许占位结果，但结构必须正确）
//   4) 结果快照写入 places 集合，供 getRoutes / getPlaceDetail / toggleFavorite 校验 placeId

const https = require('https');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const MAP_KEY = process.env.TENCENT_MAP_KEY || '';
const TRANSPORT_MODES = ['walking', 'driving', 'subway', 'bus'];
// 绕行系数与速度（米/分钟）：占位估算口径
const MODE_FACTOR = { walking: 1.25, driving: 1.45, subway: 1.5, bus: 1.5 };
const MODE_SPEED = { walking: 75, driving: 400, subway: 460, bus: 280 };

function genRequestId() {
  const d = new Date();
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `req_${ts}_${Math.random().toString(36).slice(2, 8)}`;
}
const ok = (data, requestId) => ({ code: 0, msg: 'success', requestId, data });
const fail = (code, msg, requestId) => ({ code, msg, data: null, requestId });
const round6 = (n) => Math.round(n * 1e6) / 1e6;

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('upstream timeout')));
  });
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function estimateRoute(fromLat, fromLng, toLat, toLng, mode) {
  const straight = haversine(fromLat, fromLng, toLat, toLng);
  const dist = Math.round(straight * (MODE_FACTOR[mode] || 1.4));
  const speed = MODE_SPEED[mode] || 350;
  let minutes = Math.ceil(dist / speed);
  if (mode === 'subway' || mode === 'bus') minutes += 5; // 等车 + 进出站
  return { distanceMeters: dist, durationMinutes: Math.max(1, minutes) };
}

// 腾讯位置服务：周边搜索
async function searchNearbyByTencent(lat, lng, radius, keyword) {
  const url = `https://apis.map.qq.com/ws/place/v1/search?boundary=nearby(${lat},${lng},${radius})`
    + `&keyword=${encodeURIComponent(keyword)}&orderby=_distance&page_size=10&page_index=1&key=${MAP_KEY}`;
  const res = await httpGetJson(url);
  if (res.status !== 0 || !Array.isArray(res.data)) return [];
  return res.data
    .filter((p) => p.location && typeof p.location.lat === 'number')
    .map((p) => ({
      id: `poi_${p.id}`,
      name: p.title,
      type: p.category || (p.type ? String(p.type).split(';')[0] : '') || '其他',
      lat: p.location.lat,
      lng: p.location.lng,
      address: p.address || '',
      openHours: null,
      imageUrl: null
    }));
}

// 无 Key / 上游异常时的本地兜底场所（均位于市中心 5km 内；刻意不含「美术馆」，用于空态联调）
const SEED_PLACES = [
  { id: 'p_tk_coffee_1', name: '星巴克臻选（太古里店）', type: '咖啡厅', lat: 30.6533, lng: 104.0822, address: '成都市锦江区中纱帽街8号远洋太古里', openHours: '08:00-22:30' },
  { id: 'p_tk_coffee_2', name: 'Manner Coffee（春熙路店）', type: '咖啡厅', lat: 30.6602, lng: 104.0815, address: '成都市锦江区春熙路南段8号群光广场B1', openHours: '08:00-21:00' },
  { id: 'p_tk_coffee_3', name: '瑞幸咖啡（天府广场店）', type: '咖啡厅', lat: 30.6568, lng: 104.0663, address: '成都市青羊区人民南路一段86号', openHours: '07:30-20:30' },
  { id: 'p_tk_coffee_4', name: '星巴克（红牌楼店）', type: '咖啡厅', lat: 30.6058, lng: 104.0345, address: '成都市武侯区佳灵路3号红牌楼广场', openHours: '08:00-22:00' },
  { id: 'p_cn_1', name: '小龙坎火锅（春熙路店）', type: '中餐', lat: 30.6595, lng: 104.0805, address: '成都市锦江区下东大街21号2层', openHours: '11:00-02:00' },
  { id: 'p_cn_2', name: '陈麻婆豆腐（骡马市店）', type: '中餐', lat: 30.6621, lng: 104.0723, address: '成都市青羊区西玉龙街197号', openHours: '11:00-21:00' },
  { id: 'p_cn_3', name: '蜀大侠火锅（红牌楼店）', type: '中餐', lat: 30.608, lng: 104.035, address: '成都市武侯区佳灵路9号', openHours: '11:00-23:00' },
  { id: 'p_ff_1', name: '肯德基（春熙路餐厅）', type: '快餐', lat: 30.659, lng: 104.081, address: '成都市锦江区中山广场西侧', openHours: '07:00-23:00' },
  { id: 'p_tea_1', name: '喜茶（IFS店）', type: '奶茶', lat: 30.6572, lng: 104.0818, address: '成都市锦江区红星路三段1号IFS L1', openHours: '10:00-22:00' },
  { id: 'p_tea_2', name: '茶百道（天府广场店）', type: '奶茶', lat: 30.6575, lng: 104.065, address: '成都市青羊区人民南路一段86号', openHours: '09:30-22:00' },
  { id: 'p_ds_1', name: '好利来（春熙路店）', type: '甜品', lat: 30.6605, lng: 104.0808, address: '成都市锦江区春熙路北段24号', openHours: '09:00-22:00' },
  { id: 'p_mall_1', name: '成都IFS国际金融中心', type: '商场', lat: 30.657, lng: 104.0817, address: '成都市锦江区红星路三段1号', openHours: '10:00-22:00' },
  { id: 'p_mall_2', name: '王府井百货（总府店）', type: '商场', lat: 30.6596, lng: 104.079, address: '成都市锦江区总府路15号', openHours: '10:00-22:00' },
  { id: 'p_super_1', name: '伊藤洋华堂（春熙店）', type: '超市', lat: 30.6585, lng: 104.0825, address: '成都市锦江区大科甲巷8号', openHours: '09:00-22:00' },
  { id: 'p_ktv_1', name: '纯K（春熙路店）', type: 'KTV', lat: 30.6578, lng: 104.0785, address: '成都市锦江区暑袜北一街117号', openHours: '10:00-06:00' },
  { id: 'p_bar_1', name: 'LAN Lagom 兰酒吧', type: '酒吧', lat: 30.6528, lng: 104.0835, address: '成都市锦江区天仙桥滨河路6号', openHours: '19:00-02:00' },
  { id: 'p_cinema_1', name: '万达影城（春熙路店）', type: '电影院', lat: 30.6592, lng: 104.083, address: '成都市锦江区大慈寺路15号', openHours: '09:30-24:00' },
  { id: 'p_park_1', name: '人民公园鹤鸣茶社', type: '公园广场', lat: 30.6648, lng: 104.056, address: '成都市青羊区少城路12号', openHours: '06:00-22:00' },
  { id: 'p_museum_1', name: '成都博物馆', type: '博物馆', lat: 30.6579, lng: 104.0633, address: '成都市青羊区小河街1号', openHours: '09:00-17:00' },
  { id: 'p_gym_1', name: '超级猩猩健身房（春熙路店）', type: '健身房', lat: 30.656, lng: 104.0775, address: '成都市锦江区暑袜南街42号', openHours: '07:00-23:00' },
  { id: 'p_game_1', name: '网鱼网咖（春熙路店）', type: '网吧', lat: 30.6608, lng: 104.077, address: '成都市锦江区中新街49号', openHours: '24小时' }
];

function searchNearbyBySeed(midpoint, radius, preferences) {
  return SEED_PLACES
    .filter((p) => (preferences.length === 0 || preferences.indexOf(p.type) >= 0)
      && haversine(midpoint.lat, midpoint.lng, p.lat, p.lng) <= radius)
    .map((p) => ({ id: p.id, name: p.name, type: p.type, lat: p.lat, lng: p.lng, address: p.address, openHours: p.openHours, imageUrl: null }));
}

async function searchPlaces(midpoint, preferences, radius) {
  const keywords = (preferences && preferences.length ? preferences : ['美食']).slice(0, 3);
  if (MAP_KEY) {
    const seen = new Set();
    const out = [];
    for (const kw of keywords) {
      try {
        const list = await searchNearbyByTencent(midpoint.lat, midpoint.lng, radius, kw);
        for (const p of list) {
          if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
        }
      } catch (e) {
        console.error('[getRecommendations] 上游搜索异常，降级本地种子', e && e.message);
      }
    }
    if (out.length) return out;
  }
  return searchNearbyBySeed(midpoint, radius, preferences || []);
}

// 腾讯位置服务：逆地理编码（折中点补名称/地址）
async function reverseGeocode(lat, lng) {
  const res = await httpGetJson(`https://apis.map.qq.com/ws/geocoder/v1/?location=${lat},${lng}&key=${MAP_KEY}`);
  if (res.status === 0 && res.result) {
    const recommend = (res.result.formatted_addresses && res.result.formatted_addresses.recommend) || null;
    return { name: recommend, address: res.result.address || null };
  }
  return { name: null, address: null };
}

// 场所快照入库（places 集合），失败不影响主流程
async function cachePlaces(places) {
  try {
    for (const p of places) {
      const found = await db.collection('places').where({ id: p.id }).get();
      const doc = {
        id: p.id, name: p.name, type: p.type,
        lat: round6(p.lat), lng: round6(p.lng),
        address: p.address || '',
        openHours: p.openHours || null,
        imageUrl: p.imageUrl || null,
        phone: null, rating: null, photos: [],
        updatedAt: Date.now()
      };
      if (found.data && found.data.length) {
        await db.collection('places').doc(found.data[0]._id).update({ data: doc });
      } else {
        await db.collection('places').add({ data: doc });
      }
    }
  } catch (e) {
    console.error('[getRecommendations] places 快照入库失败', e && e.message);
  }
}

// 简易防连点（单实例内存态，尽力而为）
const lastCallMap = {};

exports.main = async (event) => {
  const requestId = genRequestId();
  try {
    const departures = event.departures;
    const preferences = Array.isArray(event.preferences) ? event.preferences : [];
    const strategy = event.strategy || null;
    const midpointMode = event.midpointMode || 'auto';

    // ---- 参数校验（契约 4.1 错误表）----
    if (!Array.isArray(departures) || departures.length === 0) {
      return fail(400, '请求参数有误，请稍后重试', requestId);
    }
    if (departures.length > 6) {
      return fail(400, '最多支持 6 人同行', requestId);
    }
    for (const d of departures) {
      if (!d || !d.participantId || !d.poiId || !d.name
        || typeof d.lat !== 'number' || typeof d.lng !== 'number'
        || TRANSPORT_MODES.indexOf(d.transportMode) < 0) {
        return fail(400, '请求参数有误，请稍后重试', requestId);
      }
    }

    // ---- 防连点（429）----
    const openid = (cloud.getWXContext() || {}).OPENID || '';
    const sig = JSON.stringify([departures, preferences]);
    const now = Date.now();
    const throttleKey = openid || 'anon';
    if (lastCallMap[throttleKey] && lastCallMap[throttleKey].sig === sig
      && now - lastCallMap[throttleKey].ts < 1200) {
      return fail(429, '操作过于频繁，请稍后再试', requestId);
    }
    lastCallMap[throttleKey] = { sig, ts: now };

    // ---- 出行策略：仅全员 subway 时生效，其余忽略并返回 null ----
    let effectiveStrategy = null;
    if (strategy
      && departures.every((d) => d.transportMode === 'subway')
      && ['least_transfer', 'least_stops'].indexOf(strategy) >= 0) {
      effectiveStrategy = strategy;
    }

    // ---- 折中点 ----
    let midpoint;
    if (midpointMode === 'manual'
      && event.midpoint && typeof event.midpoint.lat === 'number' && typeof event.midpoint.lng === 'number') {
      const m = event.midpoint;
      midpoint = {
        name: m.name || '指定碰面点',
        lat: round6(m.lat),
        lng: round6(m.lng),
        address: m.address || null,
        source: 'manual'
      };
    } else {
      const lat = round6(departures.reduce((s, d) => s + d.lat, 0) / departures.length);
      const lng = round6(departures.reduce((s, d) => s + d.lng, 0) / departures.length);
      midpoint = { name: '折中点（估算）', lat, lng, address: null, source: 'auto' };
      if (MAP_KEY) {
        try {
          const geo = await reverseGeocode(lat, lng);
          if (geo.name) { midpoint.name = geo.name; midpoint.address = geo.address; }
          else if (geo.address) { midpoint.address = geo.address; }
        } catch (e) {
          console.error('[getRecommendations] 逆地理编码失败，使用估算折中点', e && e.message);
        }
      }
    }

    // ---- 搜索半径：1km 无结果自动扩到 5km ----
    let radius = 1000;
    let expanded = false;
    let places = await searchPlaces(midpoint, preferences, radius);
    if (places.length === 0) {
      expanded = true;
      radius = 5000;
      places = await searchPlaces(midpoint, preferences, radius);
    }

    // ---- 收藏状态（isFavorite 统一由本接口返回）----
    const favoriteSet = new Set();
    if (openid && places.length) {
      try {
        const fav = await db.collection('favorites')
          .where({ openid, placeId: _.in(places.map((p) => p.id)) }).get();
        (fav.data || []).forEach((f) => favoriteSet.add(f.placeId));
      } catch (e) {
        console.error('[getRecommendations] 收藏状态查询失败', e && e.message);
      }
    }

    // ---- 组装场所（participantMetrics / averageDistanceMeters）----
    const enriched = places.map((p) => {
      const participantMetrics = departures.map((d) => {
        const est = estimateRoute(d.lat, d.lng, p.lat, p.lng, d.transportMode);
        return {
          participantId: d.participantId,
          label: d.label || d.participantId,
          transportMode: d.transportMode,
          distanceMeters: est.distanceMeters,
          durationMinutes: est.durationMinutes
        };
      });
      const averageDistanceMeters = participantMetrics.length
        ? Math.round(participantMetrics.reduce((s, m) => s + m.distanceMeters, 0) / participantMetrics.length)
        : 0;
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        lat: round6(p.lat),
        lng: round6(p.lng),
        address: p.address || '',
        openHours: p.openHours || null,
        imageUrl: p.imageUrl || null,
        distanceToMidpointMeters: haversine(midpoint.lat, midpoint.lng, p.lat, p.lng),
        averageDistanceMeters,
        isFavorite: favoriteSet.has(p.id),
        participantMetrics
      };
    });

    // ---- 排序：全体参与人最大耗时升序；平局按到折中点直线距离升序（算法原序）----
    enriched.sort((a, b) => {
      const am = Math.max.apply(null, a.participantMetrics.map((m) => m.durationMinutes));
      const bm = Math.max.apply(null, b.participantMetrics.map((m) => m.durationMinutes));
      return am !== bm ? am - bm : a.distanceToMidpointMeters - b.distanceToMidpointMeters;
    });

    const top = enriched.slice(0, 20);

    // 快照入库，供 getRoutes / getPlaceDetail / toggleFavorite 使用
    await cachePlaces(top);

    return ok({
      midpoint,
      searchRadiusMeters: radius,
      distanceExpanded: expanded,
      strategy: effectiveStrategy,
      places: top
    }, requestId);
  } catch (e) {
    console.error('[getRecommendations]', e);
    return fail(500, '网络开小差了', requestId);
  }
};

// 云函数：getPlaceDetail（高-5，V1.1 新增）
// 用途：地点详情页（图片、营业时间、电话、地址、大众点评入口、各人到达情况）
// 契约：《哪见接口约定 V1.1》5.1
// 说明：
//   1) 契约请求示例只带 placeId；participantMetrics / distanceToMidpointMeters 依赖
//      本次搜索上下文，因此本实现额外支持可选参数 departures / midpoint（由前端从
//      结果页透传）。未传时 participantMetrics 为 []，距离字段为 null（空值形态
//      遵循 2.5：空列表 []、空对象 null）
//   2) placeId 必须存在于 places 集合（getRecommendations 快照），否则 404
//   3) isFavorite 统一由本接口返回（收藏状态唯一来源之一）

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TRANSPORT_MODES = ['walking', 'driving', 'subway', 'bus'];
const MODE_FACTOR = { walking: 1.25, driving: 1.45, subway: 1.5, bus: 1.5 };
const MODE_SPEED = { walking: 75, driving: 400, subway: 460, bus: 280 };

function genRequestId() {
  const d = new Date();
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `req_${ts}_${Math.random().toString(36).slice(2, 8)}`;
}
const ok = (data, requestId) => ({ code: 0, msg: 'success', requestId, data });
const fail = (code, msg, requestId) => ({ code, msg, data: null, requestId });

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
  if (mode === 'subway' || mode === 'bus') minutes += 5;
  return { distanceMeters: dist, durationMinutes: Math.max(1, minutes) };
}

async function getPlaceFromCache(placeId) {
  const r = await db.collection('places').where({ id: placeId }).get();
  return r.data && r.data[0] ? r.data[0] : null;
}

exports.main = async (event) => {
  const requestId = genRequestId();
  try {
    const placeId = event.placeId;

    // ---- 参数校验（契约 5.1 错误表）----
    if (!placeId || typeof placeId !== 'string') {
      return fail(400, '请求参数有误，请稍后重试', requestId);
    }

    const place = await getPlaceFromCache(placeId);
    if (!place) {
      return fail(404, '该地点已不存在', requestId);
    }

    // ---- 收藏状态（唯一来源之一）----
    const openid = (cloud.getWXContext() || {}).OPENID || '';
    let isFavorite = false;
    if (openid) {
      try {
        const fav = await db.collection('favorites').where({ openid, placeId }).get();
        isFavorite = fav.data && fav.data.length > 0;
      } catch (e) {
        console.error('[getPlaceDetail] 收藏状态查询失败', e && e.message);
      }
    }

    // ---- 到达情况（可选参数 departures / midpoint 透传时计算）----
    const departures = Array.isArray(event.departures) ? event.departures : [];
    const midpoint = event.midpoint && typeof event.midpoint.lat === 'number'
      && typeof event.midpoint.lng === 'number' ? event.midpoint : null;

    let participantMetrics = [];
    let averageDistanceMeters = null;
    let distanceToMidpointMeters = null;

    const valid = departures.filter((d) => d && typeof d.lat === 'number'
      && typeof d.lng === 'number' && TRANSPORT_MODES.indexOf(d.transportMode) >= 0);
    if (valid.length) {
      participantMetrics = valid.map((d) => {
        const est = estimateRoute(d.lat, d.lng, place.lat, place.lng, d.transportMode);
        return {
          participantId: d.participantId,
          label: d.label || d.participantId,
          transportMode: d.transportMode,
          distanceMeters: est.distanceMeters,
          durationMinutes: est.durationMinutes
        };
      });
      averageDistanceMeters = Math.round(
        participantMetrics.reduce((s, m) => s + m.distanceMeters, 0) / participantMetrics.length
      );
    }
    if (midpoint) {
      distanceToMidpointMeters = haversine(midpoint.lat, midpoint.lng, place.lat, place.lng);
    }

    return ok({
      id: place.id,
      name: place.name,
      type: place.type,
      lat: place.lat,
      lng: place.lng,
      address: place.address || '',
      phone: place.phone || null,
      openHours: place.openHours || null,
      imageUrl: place.imageUrl || null,
      photos: Array.isArray(place.photos) ? place.photos : [],
      rating: typeof place.rating === 'number' ? place.rating : null,
      isFavorite,
      dianpingUrl: null,
      dianpingFallbackUrl: `https://m.dianping.com/searchlist?keyword=${encodeURIComponent(place.name)}`,
      distanceToMidpointMeters,
      averageDistanceMeters,
      participantMetrics
    }, requestId);
  } catch (e) {
    console.error('[getPlaceDetail]', e);
    return fail(500, '网络开小差了', requestId);
  }
};

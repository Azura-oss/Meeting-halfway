// 云函数：saveHistory（高-6）
// 契约：《哪见接口约定 V1.1》7.1
// 1) openid 由云函数上下文取得；2) 同一搜索重复上报按 openid+searchedAt+departures 去重；
// 3) 最多保留最近 50 条，超出淘汰最旧；4) searchedAt 前端传入，非法时服务端兜底。

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TRANSPORT_MODES = ['walking', 'driving', 'subway', 'bus'];
const MAX_HISTORY = 50;

function genRequestId() {
  const d = new Date();
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `req_${ts}_${Math.random().toString(36).slice(2, 8)}`;
}
const ok = (data, requestId) => ({ code: 0, msg: 'success', requestId, data });
const fail = (code, msg, requestId) => ({ code, msg, data: null, requestId });

function validateDepartures(departures) {
  if (!Array.isArray(departures) || departures.length === 0 || departures.length > 6) return false;
  for (const d of departures) {
    if (!d || !d.participantId || !d.poiId || typeof d.lat !== 'number'
      || typeof d.lng !== 'number' || TRANSPORT_MODES.indexOf(d.transportMode) < 0) {
      return false;
    }
  }
  return true;
}

exports.main = async (event) => {
  const requestId = genRequestId();
  try {
    const openid = (cloud.getWXContext() || {}).OPENID || '';
    if (!openid) {
      return fail(401, '登录状态已失效，请重新进入小程序', requestId);
    }
    if (!validateDepartures(event.departures)) {
      return fail(400, '请求参数有误，请稍后重试', requestId);
    }

    const departures = event.departures;
    const searchedAt = (typeof event.searchedAt === 'string' && event.searchedAt)
      || new Date().toISOString();
    const departureNames = departures.map((d) => d.name || d.participantId);
    const transportModes = Array.from(new Set(departures.map((d) => d.transportMode)));
    const preferences = Array.isArray(event.preferences) ? event.preferences : [];
    const pinnedIds = Array.isArray(event.pinnedIds) ? event.pinnedIds : [];
    const favoritedIds = Array.isArray(event.favoritedIds) ? event.favoritedIds : [];

    // 去重：openid + searchedAt + departures
    const sig = JSON.stringify(departures.map((d) => [d.participantId, d.poiId]));
    const dup = await db.collection('history')
      .where({ openid, searchedAt }).limit(MAX_HISTORY).get();
    const dupDoc = (dup.data || []).find((h) => {
      const hSig = JSON.stringify((h.departures || []).map((d) => [d.participantId, d.poiId]));
      return hSig === sig;
    });
    if (dupDoc) {
      return ok({ historyId: dupDoc._id }, requestId);
    }

    const added = await db.collection('history').add({
      data: {
        openid,
        partySize: departures.length,
        departures,
        departureNames,
        transportModes,
        preferences,
        strategy: event.strategy || null,
        midpoint: event.midpoint || null,
        searchedAt,
        searchRadiusMeters: typeof event.searchRadiusMeters === 'number'
          ? event.searchRadiusMeters : 1000,
        distanceExpanded: !!event.distanceExpanded,
        resultSnapshot: event.resultSnapshot || null,
        pinnedIds,
        favoritedIds,
        favoriteCount: favoritedIds.length,
        createdAt: Date.now()
      }
    });

    // 最多保留最近 50 条，淘汰最旧
    try {
      const cnt = await db.collection('history').where({ openid }).count();
      if (cnt.total > MAX_HISTORY) {
        const old = await db.collection('history')
          .where({ openid })
          .orderBy('searchedAt', 'asc')
          .limit(cnt.total - MAX_HISTORY)
          .get();
        for (const doc of old.data || []) {
          await db.collection('history').doc(doc._id).remove();
        }
      }
    } catch (e) {
      console.error('[saveHistory] 淘汰旧历史失败', e && e.message);
    }

    return ok({ historyId: added._id }, requestId);
  } catch (e) {
    console.error('[saveHistory]', e);
    return fail(500, '网络开小差了', requestId);
  }
};

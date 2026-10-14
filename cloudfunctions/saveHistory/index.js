// 云函数：saveHistory（高-6）
// 契约：《哪见接口约定 V1.1》7.1
// 1) openid 由云函数上下文取得；2) 同一搜索重复上报按「openid + 出发地/交通方式 + 偏好 + 策略 + 折中点模式」去重
//    （与前端 Mock 层同口径，不把 searchedAt 计入签名）；
// 3) 最多保留最近 50 条，超出淘汰最旧；4) searchedAt 前端传入，非法时服务端兜底。

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TRANSPORT_MODES = ['walking', 'driving', 'subway', 'bus'];
const MAX_HISTORY = 50;
const MAX_SNAPSHOT_PLACES = 20;
const MAX_SNAPSHOT_BYTES = 512 * 1024;

function genRequestId() {
  const d = new Date();
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `req_${ts}_${Math.random().toString(36).slice(2, 8)}`;
}
const ok = (data, requestId) => ({ code: 0, msg: 'success', requestId, data });
const fail = (code, msg, requestId) => ({ code, msg, data: null, requestId });

function validateDepartures(departures) {
  if (!Array.isArray(departures) || departures.length < 2 || departures.length > 6) return false;
  for (const d of departures) {
    if (!d || !d.participantId || !d.poiId || typeof d.lat !== 'number'
      || typeof d.lng !== 'number' || TRANSPORT_MODES.indexOf(d.transportMode) < 0) {
      return false;
    }
  }
  return true;
}

function normalizeSearchedAt(value) {
  return typeof value === 'string' && value && Number.isFinite(Date.parse(value))
    ? value : new Date().toISOString();
}

function validateResultSnapshot(snapshot) {
  if (snapshot === null || typeof snapshot === 'undefined') return true;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  if (!Array.isArray(snapshot.placeIds) || !Array.isArray(snapshot.places)) return false;
  if (snapshot.placeIds.length > MAX_SNAPSHOT_PLACES || snapshot.places.length > MAX_SNAPSHOT_PLACES) return false;
  if (!snapshot.placeIds.every((id) => typeof id === 'string' && id.length > 0)) return false;
  if (!snapshot.places.every((place) => place && typeof place === 'object'
    && typeof place.id === 'string' && place.id.length > 0)) return false;
  try {
    return Buffer.byteLength(JSON.stringify(snapshot), 'utf8') <= MAX_SNAPSHOT_BYTES;
  } catch (e) {
    return false;
  }
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
    if (!validateResultSnapshot(event.resultSnapshot)) {
      return fail(400, '结果快照过大或格式有误', requestId);
    }

    const departures = event.departures;
    const searchedAt = normalizeSearchedAt(event.searchedAt);
    const departureNames = departures.map((d) => d.name || d.participantId);
    const transportModes = Array.from(new Set(departures.map((d) => d.transportMode)));
    const preferences = Array.isArray(event.preferences) ? event.preferences : [];
    const pinnedIds = Array.isArray(event.pinnedIds) ? event.pinnedIds : [];
    const favoritedIds = Array.isArray(event.favoritedIds) ? event.favoritedIds : [];

    // 去重：与前端 Mock 层保持同一口径（出发地+交通方式 / 偏好 / 策略 / 折中点模式），
    // 不把 searchedAt 计入签名——否则同一组合搜索每次重进结果页都会新增一条历史。
    const signatureOf = (departuresList, preferencesList, strategyValue, midpointModeValue) => JSON.stringify({
      departures: (departuresList || []).map((d) => ({
        participantId: d.participantId, poiId: d.poiId, transportMode: d.transportMode
      })),
      preferences: (preferencesList || []).slice().sort(),
      strategy: strategyValue || null,
      midpointMode: midpointModeValue || 'auto'
    });
    const sig = signatureOf(departures, preferences, event.strategy, event.midpointMode);
    const recent = await db.collection('history')
      .where({ openid })
      .orderBy('searchedAt', 'desc')
      .limit(MAX_HISTORY)
      .get();
    const dupDoc = (recent.data || []).find((h) => signatureOf(
      h.departures, h.preferences, h.strategy, h.midpointMode
    ) === sig);
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
        midpointMode: event.midpointMode || 'auto',
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

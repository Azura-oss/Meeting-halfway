// 云函数：getHistory（高-6）
// 契约：《哪见接口约定 V1.1》7.2
// 返回可按原样恢复的搜索记录（最多最近 50 条，searchedAt 倒序）

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const MAX_HISTORY = 50;

function genRequestId() {
  const d = new Date();
  const ts = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return 'req_' + ts + '_' + Math.random().toString(36).slice(2, 8);
}

function displayTime(iso) {
  const d = new Date(iso);
  if (!d.getTime()) return '';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return '今天 ' + hm;
  if (sameDay(d, yesterday)) return '昨天 ' + hm;
  if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function ok(data, requestId) { return { code: 0, msg: 'success', requestId, data }; }
function fail(code, msg, requestId) { return { code: code, msg: msg, data: null, requestId: requestId }; }

exports.main = async (event) => {
  const requestId = genRequestId();
  try {
    const openid = (cloud.getWXContext() || {}).OPENID || '';
    if (!openid) {
      return fail(401, '登录状态已失效，请重新进入小程序', requestId);
    }

    const page = Number.isInteger(event.page) && event.page >= 1 ? event.page : 1;
    const pageSize = Number.isInteger(event.pageSize) && event.pageSize >= 1 ? Math.min(event.pageSize, MAX_HISTORY) : 20;

    const cnt = await db.collection('history').where({ openid: openid }).count();
    const res = await db.collection('history')
      .where({ openid: openid })
      .orderBy('searchedAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const items = (res.data || []).map((h) => ({
      id: h._id,
      partySize: h.partySize || (h.departures || []).length,
      departureNames: h.departureNames || [],
      departures: h.departures || [],
      transportModes: h.transportModes || [],
      preferences: h.preferences || [],
      strategy: h.strategy || null,
      midpoint: h.midpoint || null,
      searchRadiusMeters: typeof h.searchRadiusMeters === 'number' ? h.searchRadiusMeters : 1000,
      distanceExpanded: !!h.distanceExpanded,
      resultSnapshot: h.resultSnapshot || null,
      pinnedIds: h.pinnedIds || [],
      favoritedIds: h.favoritedIds || [],
      favoriteCount: h.favoriteCount || 0,
      searchedAt: h.searchedAt,
      displayTime: displayTime(h.searchedAt)
    }));

    return ok({ total: cnt.total, items: items }, requestId);
  } catch (e) {
    console.error('[getHistory]', e);
    return fail(500, '网络开小差了', requestId);
  }
};

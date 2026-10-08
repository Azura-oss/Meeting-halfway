// 云函数：toggleFavorite（高-6）
// 用途：收藏 / 取消收藏一个场所（写入幂等，openid + placeId 唯一）
// 契约：《哪见接口约定 V1.1》6.1
// 说明：
//   1) 身份由 cloud.getWXContext().OPENID 取得，前端不得传 openid
//   2) placeId 必须存在于 places 集合（getRecommendations 快照），否则 404
//   3) 重复 add / remove 均返回 code 0 与操作后的最终状态（幂等）
//   4) 连点限流：同一 openid + placeId 300ms 内重复调用返回 429（单实例内存态，尽力而为）

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function genRequestId() {
  const d = new Date();
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `req_${ts}_${Math.random().toString(36).slice(2, 8)}`;
}
const ok = (data, requestId) => ({ code: 0, msg: 'success', requestId, data });
const fail = (code, msg, requestId) => ({ code, msg, data: null, requestId });

// 连点限流（单实例内存态）
const throttleMap = {};

exports.main = async (event) => {
  const requestId = genRequestId();
  try {
    const wx = cloud.getWXContext();
    const openid = wx.OPENID || '';
    if (!openid) {
      return fail(401, '登录状态已失效，请重新进入小程序', requestId);
    }

    const placeId = event.placeId;
    const action = event.action;

    // ---- 参数校验（契约 6.1 错误表）----
    if (!placeId || typeof placeId !== 'string' || (action !== 'add' && action !== 'remove')) {
      return fail(400, '请求参数有误，请稍后重试', requestId);
    }

    // ---- 连点限流（429）----
    const now = Date.now();
    const key = `${openid}:${placeId}`;
    if (throttleMap[key] && now - throttleMap[key] < 300) {
      return fail(429, '操作过于频繁，请稍后再试', requestId);
    }
    throttleMap[key] = now;

    // ---- placeId 校验（快照不存在 → 404）----
    const found = await db.collection('places').where({ id: placeId }).get();
    const place = found.data && found.data[0];
    if (!place) {
      return fail(404, '该地点已不存在', requestId);
    }

    if (action === 'add') {
      // 幂等：命中唯一约束（openid + placeId 已存在）时按成功处理
      const existing = await db.collection('favorites').where({ openid, placeId }).get();
      if (!existing.data || existing.data.length === 0) {
        await db.collection('favorites').add({
          data: {
            openid,
            placeId,
            name: place.name,
            type: place.type,
            lat: place.lat,
            lng: place.lng,
            address: place.address || '',
            imageUrl: place.imageUrl || null,
            pinned: false,
            favoritedAt: new Date().toISOString(),
            createdAt: Date.now()
          }
        });
      }
      return ok({ placeId, isFavorite: true }, requestId);
    }

    // remove：幂等，不存在时同样返回 code 0 与最终状态 false
    await db.collection('favorites').where({ openid, placeId }).remove();
    return ok({ placeId, isFavorite: false }, requestId);
  } catch (e) {
    console.error('[toggleFavorite]', e);
    return fail(500, '网络开小差了', requestId);
  }
};

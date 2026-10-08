// 云函数：getFavorites（高-6）
// 用途：收藏页列表（pinned 优先，其余按 favoritedAt 倒序）
// 契约：《哪见接口约定 V1.1》6.2
// 说明：
//   1) 身份由 cloud.getWXContext().OPENID 取得
//   2) distanceToMidpointMeters 无最近折中点为 null（空值形态遵循 2.5）
//   3) 收藏状态来源已统一：列表页/详情页用 getRecommendations / getPlaceDetail
//      的 isFavorite，本接口仅用于收藏页与历史恢复

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

exports.main = async (event) => {
  const requestId = genRequestId();
  try {
    const openid = (cloud.getWXContext() || {}).OPENID || '';
    if (!openid) {
      return fail(401, '登录状态已失效，请重新进入小程序', requestId);
    }

    let page = Number.isInteger(event.page) ? event.page : 1;
    let pageSize = Number.isInteger(event.pageSize) ? event.pageSize : 50;
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      return fail(400, '请求参数有误，请稍后重试', requestId);
    }

    const cnt = await db.collection('favorites').where({ openid }).count();
    const res = await db.collection('favorites')
      .where({ openid })
      .orderBy('favoritedAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    // pinned 优先：同页内稳定重排（时间倒序已由库端排序保证）
    const items = (res.data || [])
      .slice()
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
      .map((f) => ({
        id: f.placeId,
        name: f.name,
        type: f.type,
        lat: f.lat,
        lng: f.lng,
        address: f.address || '',
        imageUrl: f.imageUrl || null,
        distanceToMidpointMeters: null,
        pinned: !!f.pinned,
        favoritedAt: f.favoritedAt
      }));

    return ok({ total: cnt.total, items }, requestId);
  } catch (e) {
    console.error('[getFavorites]', e);
    return fail(500, '网络开小差了', requestId);
  }
};

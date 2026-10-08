// 云函数：clearHistory（高-6，V1.1 新增）
// 用途：清空当前用户的历史记录，仅影响 history 集合，不影响收藏数据
// 契约：《哪见接口约定 V1.1》7.3

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function genRequestId() {
  const d = new Date();
  const ts = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return 'req_' + ts + '_' + Math.random().toString(36).slice(2, 8);
}
function ok(data, requestId) { return { code: 0, msg: 'success', requestId, data }; }
function fail(code, msg, requestId) { return { code: code, msg: msg, data: null, requestId: requestId }; }

// 1) confirm 必须为 true（前端二次确认后传入），否则 400
// 2) 只在 openid 范围内删除，不接受任何前端传入的用户标识
// 3) 无历史时返回 code 0、deletedCount: 0（正常空态，非错误）

exports.main = async (event) => {
  const requestId = genRequestId();
  try {
    const openid = (cloud.getWXContext() || {}).OPENID || '';
    if (!openid) {
      return fail(401, '登录状态已失效，请重新进入小程序', requestId);
    }
    if (event.confirm !== true) {
      return fail(400, '请求参数有误，请稍后重试', requestId);
    }

    const res = await db.collection('history').where({ openid: openid }).remove();
    const deletedCount = (res && res.stats && res.stats.removed) || 0;
    return ok({ deletedCount: deletedCount }, requestId);
  } catch (e) {
    console.error('[clearHistory]', e);
    return fail(500, '网络开小差了', requestId);
  }
};

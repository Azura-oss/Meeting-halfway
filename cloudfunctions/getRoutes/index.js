// 云函数：getRoutes（高-1）
// 用途：结果页点选场所后，获取每位参与人的路线用于地图 polyline 绘制
// 契约：《哪见接口约定 V1.1》4.2（删除统一 transport，每人用自己的 transportMode，返回 routes）
// 说明：
//   1) placeId 必须存在于 places 集合（getRecommendations 快照），否则 404
//   2) 配置 TENCENT_MAP_KEY 后走腾讯位置服务路径规划（步行/驾车/公交地铁换乘）；
//      未配置或上游异常时降级为占位路线（直线插值点 + 估算距离耗时），结构严格对齐契约
//   3) points 上限 2000 个点，超出按固定间隔抽稀

const https = require('https');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const MAP_KEY = process.env.TENCENT_MAP_KEY || '';
const TRANSPORT_MODES = ['walking', 'driving', 'subway', 'bus'];
const MODE_FACTOR = { walking: 1.25, driving: 1.45, subway: 1.5, bus: 1.5 };
const MODE_SPEED = { walking: 75, driving: 400, subway: 460, bus: 280 };
const ROUTE_COLORS = ['#07C160', '#1296DB', '#F4A900', '#E64340', '#8A2BE2', '#00B8A9'];

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
  if (mode === 'subway' || mode === 'bus') minutes += 5;
  return { distanceMeters: dist, durationMinutes: Math.max(1, minutes) };
}

// 腾讯 polyline 解码。实测 direction v1（walking/driving/transit）返回扁平数字数组：
// [lat0, lng0, dLat1, dLng1, ...]，首点为绝对坐标（度），后续成对差值为整数微度（1e-6 度）。
// 同时兼容对象数组形式 [{latitude, longitude}]（可能为差值且放大 1e6）。
function decodePolyline(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  // 形态一：扁平数字数组
  if (typeof raw[0] === 'number') {
    const pts = [];
    let lat = raw[0];
    let lng = raw[1];
    pts.push({ lat: round6(lat), lng: round6(lng) });
    for (let i = 2; i + 1 < raw.length; i += 2) {
      const dLat = raw[i];
      const dLng = raw[i + 1];
      // 自适应：|差值| >= 1 视为微度（相邻点不可能相距超过 1 度），否则视为度
      lat += Math.abs(dLat) < 1 ? dLat : dLat / 1e6;
      lng += Math.abs(dLng) < 1 ? dLng : dLng / 1e6;
      pts.push({ lat: round6(lat), lng: round6(lng) });
    }
    return pts;
  }
  // 形态二：对象数组
  const first = raw[0];
  const compressed = typeof first.latitude === 'number'
    && (Math.abs(first.latitude) > 1000 || Math.abs(first.longitude) > 1000);
  const pts = [];
  let lat = 0;
  let lng = 0;
  for (const p of raw) {
    if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;
    if (compressed) {
      lat += p.latitude;
      lng += p.longitude;
      pts.push({ lat: round6(lat / 1e6), lng: round6(lng / 1e6) });
    } else {
      pts.push({ lat: round6(p.latitude), lng: round6(p.longitude) });
    }
  }
  return pts;
}

function thinPoints(pts, max) {
  if (pts.length <= max) return pts;
  const step = Math.ceil(pts.length / max);
  const out = pts.filter((_, i) => i % step === 0);
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (!tail || tail.lat !== last.lat || tail.lng !== last.lng) out.push(last);
  return out;
}

// 占位路线点：起终点直线 8 段插值
function makeFallbackPoints(fromLat, fromLng, toLat, toLng) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push({ lat: round6(fromLat + (toLat - fromLat) * t), lng: round6(fromLng + (toLng - fromLng) * t) });
  }
  return pts;
}

// 两点之间插 n 个点（用于无 polyline 的地铁/公交段补线）
function interpolatePoints(from, to, n) {
  const pts = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push({ lat: round6(from.lat + (to.lat - from.lat) * t), lng: round6(from.lng + (to.lng - from.lng) * t) });
  }
  return pts;
}

async function routeByTencent(from, to, mode, strategy) {
  const fromStr = `${from.lat},${from.lng}`;
  const toStr = `${to.lat},${to.lng}`;

  if (mode === 'walking' || mode === 'driving') {
    const api = mode;
    const res = await httpGetJson(`https://apis.map.qq.com/ws/direction/v1/${api}?from=${fromStr}&to=${toStr}&key=${MAP_KEY}`);
    if (res.status === 0 && res.result && res.result.routes && res.result.routes[0]) {
      const r = res.result.routes[0];
      // 腾讯 direction v1 的 duration 单位为分钟
      const pts = decodePolyline(r.polyline);
      return {
        distanceMeters: Math.round(r.distance),
        durationMinutes: Math.max(1, Math.round(r.duration)),
        points: thinPoints(pts.length >= 2 ? pts : makeFallbackPoints(from.lat, from.lng, to.lat, to.lng), 2000),
        transferCount: null,
        stopCount: null
      };
    }
    throw new Error(`${api} route empty`);
  }

  // subway / bus → 公交地铁换乘（transit）
  // 实测 transit 的分段在 result.routes[0].steps：mode=WALKING 含 polyline（扁平差值），
  // mode=TRANSIT 的 lines[] 含 vehicle（SUBWAY/BUS）与 station_count，地铁段本身通常无 polyline
  let policy = '';
  if (strategy === 'least_transfer') policy = '&policy=LEAST_TRANSFER';
  else if (strategy === 'least_stops') policy = '&policy=LEAST_TIME';
  const res = await httpGetJson(`https://apis.map.qq.com/ws/direction/v1/transit?from=${fromStr}&to=${toStr}${policy}&key=${MAP_KEY}`);
  if (res.status === 0 && res.result && res.result.routes && res.result.routes[0]) {
    const r = res.result.routes[0];
    const steps = Array.isArray(r.steps) ? r.steps : [];
    const segs = steps.map((st) => (Array.isArray(st.polyline) && st.polyline.length ? decodePolyline(st.polyline) : null));

    const transitLines = [];
    for (const st of steps) {
      if (st && st.mode === 'TRANSIT' && Array.isArray(st.lines)) {
        const line = st.lines.find((l) => l && (l.vehicle === 'SUBWAY' || l.vehicle === 'BUS'));
        if (line) transitLines.push(line);
      }
    }
    const stopCount = transitLines.reduce((s, l) => s + (l.station_count || 0), 0);
    const transferCount = Math.max(0, transitLines.length - 1);

    // 按步骤顺序拼接坐标；无 polyline 的地铁段用前后已知点插值补线
    const out = [];
    let last = { lat: from.lat, lng: from.lng };
    for (let i = 0; i < steps.length; i++) {
      if (segs[i]) {
        out.push(...segs[i]);
        last = segs[i][segs[i].length - 1];
      } else {
        let next = { lat: to.lat, lng: to.lng };
        for (let j = i + 1; j < steps.length; j++) {
          if (segs[j]) { next = segs[j][0]; break; }
        }
        out.push(...interpolatePoints(last, next, 4));
        last = next;
      }
    }
    const est = estimateRoute(from.lat, from.lng, to.lat, to.lng, mode);
    return {
      distanceMeters: Math.round(r.distance) || est.distanceMeters,
      durationMinutes: Math.max(1, Math.round(r.duration)),
      points: thinPoints(out.length >= 2 ? out : makeFallbackPoints(from.lat, from.lng, to.lat, to.lng), 2000),
      transferCount: mode === 'subway' ? transferCount : null,
      stopCount: mode === 'subway' ? stopCount : null
    };
  }
  throw new Error('transit route empty');
}

function fallbackRoute(d, place) {
  const est = estimateRoute(d.lat, d.lng, place.lat, place.lng, d.transportMode);
  return {
    distanceMeters: est.distanceMeters,
    durationMinutes: est.durationMinutes,
    points: makeFallbackPoints(d.lat, d.lng, place.lat, place.lng),
    transferCount: d.transportMode === 'subway' ? (est.distanceMeters > 6000 ? 1 : 0) : null,
    stopCount: d.transportMode === 'subway' ? Math.max(2, Math.round(est.distanceMeters / 1200)) : null
  };
}

async function getPlaceFromCache(placeId) {
  const r = await db.collection('places').where({ id: placeId }).get();
  return r.data && r.data[0] ? r.data[0] : null;
}

exports.main = async (event) => {
  const requestId = genRequestId();
  try {
    const placeId = event.placeId;
    const departures = event.departures;
    const strategy = event.strategy || null;

    // ---- 参数校验（契约 4.2 错误表）----
    if (!placeId || typeof placeId !== 'string') {
      return fail(400, '请求参数有误，请稍后重试', requestId);
    }
    if (!Array.isArray(departures) || departures.length === 0) {
      return fail(400, '请求参数有误，请稍后重试', requestId);
    }
    if (departures.length > 6) {
      return fail(400, '最多支持 6 人同行', requestId);
    }
    for (const d of departures) {
      if (!d || !d.participantId || typeof d.lat !== 'number' || typeof d.lng !== 'number'
        || TRANSPORT_MODES.indexOf(d.transportMode) < 0) {
        return fail(400, '请求参数有误，请稍后重试', requestId);
      }
    }

    // ---- placeId 校验（快照不存在 → 404）----
    const place = await getPlaceFromCache(placeId);
    if (!place) {
      return fail(404, '该地点已不存在', requestId);
    }

    // ---- 每人一条路线，顺序与 departures 一致 ----
    const routes = [];
    for (let i = 0; i < departures.length; i++) {
      const d = departures[i];
      let r;
      if (MAP_KEY) {
        try {
          r = await routeByTencent({ lat: d.lat, lng: d.lng }, { lat: place.lat, lng: place.lng }, d.transportMode, strategy);
        } catch (e) {
          console.error('[getRoutes] 上游路径规划失败，降级占位路线', e && e.message);
          r = fallbackRoute(d, place);
        }
      } else {
        r = fallbackRoute(d, place);
      }
      routes.push({
        participantId: d.participantId,
        label: d.label || d.participantId,
        transportMode: d.transportMode,
        distanceMeters: r.distanceMeters,
        durationMinutes: r.durationMinutes,
        transferCount: r.transferCount,
        stopCount: r.stopCount,
        color: ROUTE_COLORS[i % ROUTE_COLORS.length],
        points: r.points
      });
    }

    return ok({ placeId, routes }, requestId);
  } catch (e) {
    console.error('[getRoutes]', e);
    return fail(500, '网络开小差了', requestId);
  }
};

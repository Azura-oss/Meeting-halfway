// 云函数：searchPOI（高-4）
// 用途：POI 关键词联想与校验（成都市区，GCJ-02）
// 契约：《哪见接口约定 V1.1》3.1
// 说明：腾讯位置服务 Key 通过云函数环境变量 TENCENT_MAP_KEY 注入（不得进入客户端或文档）；
//       未配置 Key 或上游异常时，降级为内置种子 POI，保证「输入 → 出结果」闭环可跑通。

const https = require('https');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MAP_KEY = process.env.TENCENT_MAP_KEY || '';

function genRequestId() {
  const d = new Date();
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `req_${ts}_${Math.random().toString(36).slice(2, 8)}`;
}
const ok = (data, requestId) => ({ code: 0, msg: 'success', requestId, data });
const fail = (code, msg, requestId) => ({ code, msg, data: null, requestId });

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

// 本地兜底 POI（成都市域地标，id 稳定，联调期可保证闭环）
const SEED_POIS = [
  { id: 'poi_chunxi_rd', title: '春熙路', address: '成都市锦江区春熙路街道', lat: 30.6598, lng: 104.0817, district: '锦江区', type: '商业街区' },
  { id: 'poi_ifs', title: '成都IFS国际金融中心', address: '成都市锦江区红星路三段1号', lat: 30.657, lng: 104.0817, district: '锦江区', type: '购物中心' },
  { id: 'poi_taikoo', title: '太古里', address: '成都市锦江区中纱帽街8号', lat: 30.653, lng: 104.082, district: '锦江区', type: '商业街区' },
  { id: 'poi_tianfu_sq', title: '天府广场', address: '成都市青羊区人民南路一段86号', lat: 30.657, lng: 104.0657, district: '青羊区', type: '广场' },
  { id: 'poi_renmin_park', title: '人民公园', address: '成都市青羊区少城路12号', lat: 30.6649, lng: 104.0556, district: '青羊区', type: '公园' },
  { id: 'poi_wuhouci', title: '武侯祠', address: '成都市武侯区武侯祠大街231号', lat: 30.6429, lng: 104.0431, district: '武侯区', type: '风景名胜' },
  { id: 'poi_jinli', title: '锦里古街', address: '成都市武侯区武侯祠大街231号附2号', lat: 30.6419, lng: 104.044, district: '武侯区', type: '商业街区' },
  { id: 'poi_kuanzhai', title: '宽窄巷子', address: '成都市青羊区金河路口', lat: 30.6622, lng: 104.054, district: '青羊区', type: '商业街区' },
  { id: 'poi_shuangliu_t1', title: '双流国际机场 T1', address: '成都市双流区机场高速东一路', lat: 30.5785, lng: 103.9471, district: '双流区', type: '机场' },
  { id: 'poi_shuangliu_t2', title: '双流国际机场 T2', address: '成都市双流区机场高速东一路', lat: 30.5845, lng: 103.9546, district: '双流区', type: '机场' },
  { id: 'poi_east_station', title: '成都东站', address: '成都市成华区邛崃山路333号', lat: 30.6305, lng: 104.1415, district: '成华区', type: '火车站' },
  { id: 'poi_south_station', title: '成都南站', address: '成都市武侯区天府大道北段1号', lat: 30.6103, lng: 104.0723, district: '武侯区', type: '火车站' },
  { id: 'poi_yulin', title: '玉林路', address: '成都市武侯区玉林东路', lat: 30.628, lng: 104.07, district: '武侯区', type: '街区' },
  { id: 'poi_wenshu', title: '文殊院', address: '成都市青羊区文殊院街66号', lat: 30.6742, lng: 104.0672, district: '青羊区', type: '风景名胜' },
  { id: 'poi_hongpailou', title: '红牌楼', address: '成都市武侯区佳灵路', lat: 30.6065, lng: 104.0352, district: '武侯区', type: '商圈' },
  { id: 'poi_global_center', title: '环球中心', address: '成都市武侯区天府大道北段1700号', lat: 30.5728, lng: 104.0627, district: '武侯区', type: '购物中心' }
];

// 输入限流（单实例内存态，尽力而为）
const lastHitMap = {};

exports.main = async (event) => {
  const requestId = genRequestId();
  try {
    const keyword = typeof event.keyword === 'string' ? event.keyword.trim() : '';
    if (!keyword || keyword.length > 30) {
      return fail(400, '请求参数有误，请稍后重试', requestId);
    }
    const city = (typeof event.city === 'string' && event.city) || '成都';
    let limit = Number.isInteger(event.limit) ? event.limit : 10;
    if (limit < 1) limit = 10;
    if (limit > 20) limit = 20;

    // 简易防抖：同一用户 300ms 内重复调用返回 429
    const openid = (cloud.getWXContext() || {}).OPENID || '';
    const now = Date.now();
    const key = openid || 'anon';
    if (lastHitMap[key] && now - lastHitMap[key] < 300) {
      return fail(429, '操作过于频繁，请稍后再试', requestId);
    }
    lastHitMap[key] = now;

    // 优先走腾讯位置服务（WebServiceAPI 地点输入提示）
    if (MAP_KEY) {
      try {
        const url = `https://apis.map.qq.com/ws/place/v1/suggestion?keyword=${encodeURIComponent(keyword)}`
          + `&region=${encodeURIComponent(city)}&region_fix=1&key=${MAP_KEY}`;
        const res = await httpGetJson(url);
        if (res.status === 0 && Array.isArray(res.data)) {
          const list = res.data
            .filter((p) => p.location && typeof p.location.lat === 'number')
            .map((p) => ({
              id: `poi_${p.id}`,
              title: p.title,
              address: p.address || '',
              lat: p.location.lat,
              lng: p.location.lng,
              city: p.city || city,
              district: p.district || '',
              type: p.category || ''
            }));
          return ok(list.slice(0, limit), requestId);
        }
        if (res.status === 1001) {
          // 关键词无匹配：按契约属于空态而非错误，返回空数组
          return ok([], requestId);
        }
      } catch (e) {
        console.error('[searchPOI] 上游异常，降级本地种子', e && e.message);
      }
    }

    // 无 Key / 上游异常时的本地兜底
    const list = SEED_POIS
      .filter((p) => p.title.indexOf(keyword) >= 0 || p.address.indexOf(keyword) >= 0 || p.district.indexOf(keyword) >= 0)
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        title: p.title,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        city: '成都',
        district: p.district,
        type: p.type
      }));
    return ok(list, requestId);
  } catch (e) {
    console.error('[searchPOI]', e);
    return fail(500, '网络开小差了', requestId);
  }
};

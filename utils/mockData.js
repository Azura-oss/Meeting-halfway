/** V1.1 本地 Mock。所有收藏与历史缓存仅允许在本文件访问。 */
const config = require('./config');

const PLACE_CATEGORIES = [
  { title: '吃吃喝喝', items: ['中餐', '西餐', '快餐', '咖啡厅', '奶茶', '甜品'] },
  { title: '逛逛商场', items: ['商场', '超市'] },
  { title: 'High 玩', items: ['酒吧', 'KTV', '棋牌游戏', '网吧', '游乐场', '洗浴推拿'] },
  { title: '运动健身', items: ['网球', '篮球', '足球', '溜冰', '游泳', '乒乓球', '台球', '羽毛球', '滑雪', '跆拳道', '保龄球', '健身房'] },
  { title: '文娱活动', items: ['电影院', '音乐厅', '剧场'] },
  { title: 'City Walk', items: ['公园广场', '景区', '博物馆', '美术馆', '图书馆'] }
];
const ALL_PREFERENCES = PLACE_CATEGORIES.reduce((all, group) => all.concat(group.items), []);
const POIS = [
  { id: 'poi_1', title: '双流机场', address: '成都市双流区机场路', lat: 30.5757, lng: 103.9472, city: '成都', district: '双流区', type: '交通设施' },
  { id: 'poi_2', title: '武侯祠', address: '成都市武侯区武侯祠大街231号', lat: 30.6427, lng: 104.0433, city: '成都', district: '武侯区', type: '风景名胜' },
  { id: 'poi_3', title: '春熙路', address: '成都市锦江区春熙路', lat: 30.6578, lng: 104.0810, city: '成都', district: '锦江区', type: '商圈' },
  { id: 'poi_4', title: '天府广场', address: '成都市青羊区人民南路一段', lat: 30.6570, lng: 104.0657, city: '成都', district: '青羊区', type: '地名地址' },
  { id: 'poi_5', title: '宽窄巷子', address: '成都市青羊区长顺街', lat: 30.6690, lng: 104.0550, city: '成都', district: '青羊区', type: '风景名胜' },
  { id: 'poi_6', title: '成都东站', address: '成都市成华区邛崃山路333号', lat: 30.6290, lng: 104.1416, city: '成都', district: '成华区', type: '交通设施' },
  { id: 'poi_7', title: '环球中心', address: '成都市武侯区天府大道北段1700号', lat: 30.5750, lng: 104.0640, city: '成都', district: '武侯区', type: '商场' },
  { id: 'poi_8', title: '人民公园', address: '成都市青羊区少城路12号', lat: 30.6620, lng: 104.0580, city: '成都', district: '青羊区', type: '公园广场' }
];
const BASE_PLACES = [
  { id: 'p1', name: '星巴克（春熙路店）', type: '咖啡厅', lat: 30.6586, lng: 104.0826, address: '成都市锦江区红星路三段1号', openHours: '07:00-22:00', imageUrl: null, phone: '028-86661234', rating: 4.6, distanceToMidpointMeters: 180 },
  { id: 'p2', name: '小龙坎老火锅（春熙路店）', type: '中餐', lat: 30.6562, lng: 104.0791, address: '成都市锦江区春熙路南段68号', openHours: '11:00-次日02:00', imageUrl: null, phone: '028-86666088', rating: 4.7, distanceToMidpointMeters: 320 },
  { id: 'p3', name: '成都远洋太古里', type: '商场', lat: 30.6551, lng: 104.0837, address: '成都市锦江区中纱帽街8号', openHours: '10:00-22:00', imageUrl: null, phone: null, rating: 4.8, distanceToMidpointMeters: 450 },
  { id: 'p4', name: '喜茶（IFS店）', type: '奶茶', lat: 30.6538, lng: 104.0803, address: '成都市锦江区红星路三段1号', openHours: '10:00-22:00', imageUrl: null, phone: null, rating: 4.5, distanceToMidpointMeters: 620 }
];
const COLORS = ['#07C160', '#1989FA', '#FF9500', '#FA5151', '#8E44AD', '#00B8D9'];

// 持久化场景：模块加载时从存储恢复，使场景在重新编译/重启后仍保持
let scenario = 'normal';
try {
  const saved = wx.getStorageSync(config.storageKeys.mockScenario);
  if (saved && typeof saved === 'string' && saved.length > 0) {
    scenario = saved;
  }
} catch (err) { /* 存储不可用时回退到内存值 */ }

let lastRecommendationContext = { departures: [], midpoint: null, places: [] };

function persistScenario(name) {
  try { wx.setStorageSync(config.storageKeys.mockScenario, name); } catch (err) { /* 写入失败时内存值仍生效 */ }
}
function clearPersistedScenario() {
  try { wx.removeStorageSync(config.storageKeys.mockScenario); } catch (err) { /* 清除失败时内存值仍生效 */ }
}

function fail(message, code, retryable) {
  const error = new Error(message);
  error.code = code;
  error.retryable = !!retryable;
  error.requestId = 'mock_' + Date.now();
  throw error;
}

function guard(name) {
  if (scenario === name + ':error' || scenario === 'request:error') fail('网络开小差了', 500, true);
  if (scenario === name + ':timeout' || scenario === 'request:timeout') fail('请求超时，请重试', 504, true);
}

function read(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return typeof value === 'undefined' || value === '' ? fallback : value;
  } catch (err) { return fallback; }
}

function write(key, value) { wx.setStorageSync(key, value); }
function remove(key) { wx.removeStorageSync(key); }
function favorites() { const value = read(config.storageKeys.favorites, []); return Array.isArray(value) ? value : []; }
function histories() { const value = read(config.storageKeys.history, []); return Array.isArray(value) ? value : []; }

function routePoints(from, to, bend) {
  const result = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const arc = Math.sin(Math.PI * t) * bend;
    result.push({ lat: from.lat + (to.lat - from.lat) * t + arc, lng: from.lng + (to.lng - from.lng) * t + arc });
  }
  return result;
}

function metrics(place, departures) {
  return departures.map(item => {
    const distanceMeters = Math.max(300, Math.round(Math.sqrt(Math.pow(item.lat - place.lat, 2) + Math.pow(item.lng - place.lng, 2)) * 90000));
    return {
      participantId: item.participantId,
      label: item.label,
      transportMode: item.transportMode,
      distanceMeters,
      durationMinutes: Math.max(5, Math.round(distanceMeters / (item.transportMode === 'walking' ? 80 : 260)))
    };
  });
}

function isoNow() { return new Date().toISOString(); }
function displayTime(value) {
  const date = new Date(value);
  const pad = n => String(n).padStart(2, '0');
  return '今天 ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

const handlers = {
  placeCategories: PLACE_CATEGORIES,
  transportOptions: config.transportOptions,
  strategyList: config.strategyList,
  setScenario(name) { scenario = name || 'normal'; persistScenario(scenario); return scenario; },
  getScenario() { return scenario; },
  reset() { scenario = 'normal'; clearPersistedScenario(); lastRecommendationContext = { departures: [], midpoint: null, places: [] }; return 'normal'; },

  searchPOI(params) {
    guard('searchPOI');
    const keyword = String(params.keyword || '').trim();
    const limit = typeof params.limit === 'undefined' ? 10 : Number(params.limit);
    if (!keyword || keyword.length > 30 || !Number.isInteger(limit) || limit < 1 || limit > 20) fail('请求参数有误，请稍后重试', 400, false);
    if (scenario === 'searchPOI:empty' || /不存在|外地/.test(keyword)) return [];
    return POIS.filter(item => item.city === (params.city || '成都') && (item.title.indexOf(keyword) >= 0 || item.address.indexOf(keyword) >= 0)).slice(0, limit);
  },

  asrRecognize(params) {
    guard('asrRecognize');
    if (scenario === 'asrRecognize:no-speech') fail('没有听清，请再说一次', 'NO_SPEECH', true);
    const text = scenario === 'asrRecognize:missing' ? '想找咖啡厅' : '我们仨从双流机场、武侯祠出发，坐地铁，想找咖啡厅';
    return { text, audioDurationMs: Number(params.audioDurationMs) || 3200, requestId: 'mock_asr' };
  },

  parseIntent(params) {
    guard('parseIntent');
    const text = String(params.text || '').trim();
    if (!text || text.length > 500) fail('请求参数有误', 'INVALID_INPUT', false);
    const origins = POIS.filter(item => text.indexOf(item.title) >= 0).map(item => item.title);
    let partySize = null;
    const digit = text.match(/(\d+)\s*[人个位]/);
    if (digit) partySize = Number(digit[1]);
    else if (text.indexOf('仨') >= 0) partySize = 3;
    else if (text.indexOf('俩') >= 0 || text.indexOf('两个') >= 0) partySize = 2;
    const transportModes = [];
    if (/地铁/.test(text)) transportModes.push('subway');
    else if (/步行|走路/.test(text)) transportModes.push('walking');
    else if (/开车|自驾/.test(text)) transportModes.push('driving');
    else if (/公交/.test(text)) transportModes.push('bus');
    let placePreferences = [];
    if (/都行|随便|都可以|无所谓/.test(text)) placePreferences = ALL_PREFERENCES.slice();
    else placePreferences = ALL_PREFERENCES.filter(item => text.toUpperCase().indexOf(item.toUpperCase()) >= 0);
    const missingFields = [];
    if (!partySize) missingFields.push('partySize');
    if (!origins.length) missingFields.push('origins');
    if (!transportModes.length) missingFields.push('transportModes');
    if (!placePreferences.length) missingFields.push('placePreferences');
    return { partySize, origins, transportModes, placePreferences, missingFields, confidence: missingFields.length ? 0.55 : 0.95, requestId: 'mock_intent' };
  },

  getRecommendations(params) {
    guard('getRecommendations');
    const departures = Array.isArray(params.departures) ? params.departures : [];
    if (!departures.length || departures.length > 6 || departures.some(item => !item.poiId || typeof item.lat !== 'number' || typeof item.lng !== 'number')) {
      fail(departures.length > 6 ? '最多支持6人同行' : '请求参数有误，请稍后重试', 400, false);
    }
    const preferences = Array.isArray(params.preferences) ? params.preferences : [];
    const allSubway = departures.every(item => item.transportMode === 'subway');
    const strategyValue = allSubway ? (params.strategy || 'least_transfer') : null;
    const midpoint = strategyValue === 'least_stops'
      ? { name: '东门大桥地铁站B口', lat: 30.6543, lng: 104.0918, address: '成都市锦江区东大街', source: 'auto' }
      : { name: '春熙路地铁站A口', lat: 30.6578, lng: 104.0810, address: '成都市锦江区红星路三段', source: 'auto' };
    const forceEmpty = scenario === 'getRecommendations:empty' || (preferences.length === 1 && preferences[0] === '美术馆');
    const expanded = forceEmpty || scenario === 'getRecommendations:expanded';
    const favoriteIds = favorites().map(item => item.id);
    const places = (forceEmpty ? [] : BASE_PLACES).map(place => {
      const participantMetrics = metrics(place, departures);
      return Object.assign({}, place, {
        participantMetrics,
        averageDistanceMeters: Math.round(participantMetrics.reduce((sum, item) => sum + item.distanceMeters, 0) / participantMetrics.length),
        isFavorite: favoriteIds.indexOf(place.id) >= 0
      });
    });
    lastRecommendationContext = { departures: departures.slice(), midpoint, places };
    return { midpoint, searchRadiusMeters: expanded ? 5000 : 1000, distanceExpanded: expanded, strategy: strategyValue, places };
  },

  getRoutes(params) {
    guard('getRoutes');
    const place = BASE_PLACES.find(item => item.id === params.placeId);
    const departures = Array.isArray(params.departures) ? params.departures : [];
    if (!place) fail('该地点已不存在', 404, false);
    if (!departures.length) fail('请求参数有误，请稍后重试', 400, false);
    const participantMetrics = metrics(place, departures);
    return {
      placeId: place.id,
      routes: departures.map((item, index) => ({
        participantId: item.participantId,
        label: item.label,
        transportMode: item.transportMode,
        distanceMeters: participantMetrics[index].distanceMeters,
        durationMinutes: participantMetrics[index].durationMinutes,
        transferCount: item.transportMode === 'subway' ? 1 : null,
        stopCount: item.transportMode === 'subway' ? 6 + index : null,
        color: COLORS[index % COLORS.length],
        points: routePoints(item, place, 0.004 * (index + 1))
      }))
    };
  },

  getPlaceDetail(params) {
    guard('getPlaceDetail');
    const place = BASE_PLACES.find(item => item.id === params.placeId);
    if (!place) fail('该地点已不存在', 404, false);
    const rec = lastRecommendationContext.places.find(item => item.id === place.id);
    return Object.assign({}, place, {
      photos: [],
      isFavorite: favorites().some(item => item.id === place.id),
      dianpingUrl: 'dianping://shopinfo?id=' + place.id,
      dianpingFallbackUrl: 'https://m.dianping.com/shop/' + place.id,
      participantMetrics: rec ? rec.participantMetrics : [],
      averageDistanceMeters: rec ? rec.averageDistanceMeters : null
    });
  },

  toggleFavorite(params) {
    guard('toggleFavorite');
    const place = BASE_PLACES.find(item => item.id === params.placeId);
    if (!place) fail('该地点已不存在', 404, false);
    if (params.action !== 'add' && params.action !== 'remove') fail('请求参数有误，请稍后重试', 400, false);
    const list = favorites();
    const index = list.findIndex(item => item.id === place.id);
    if (params.action === 'add' && index < 0) list.push({
      id: place.id, name: place.name, type: place.type, lat: place.lat, lng: place.lng,
      address: place.address, imageUrl: place.imageUrl, distanceToMidpointMeters: place.distanceToMidpointMeters,
      pinned: false, favoritedAt: isoNow()
    });
    if (params.action === 'remove' && index >= 0) list.splice(index, 1);
    write(config.storageKeys.favorites, list);
    return { placeId: place.id, isFavorite: params.action === 'add' };
  },

  getFavorites(params) {
    guard('getFavorites');
    const page = typeof params.page === 'undefined' ? 1 : Number(params.page);
    const pageSize = typeof params.pageSize === 'undefined' ? 50 : Number(params.pageSize);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) fail('请求参数有误，请稍后重试', 400, false);
    const list = favorites().slice().sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || String(b.favoritedAt).localeCompare(String(a.favoritedAt)));
    return { total: list.length, items: list.slice((page - 1) * pageSize, page * pageSize) };
  },

  saveHistory(params) {
    guard('saveHistory');
    const departures = Array.isArray(params.departures) ? params.departures : [];
    if (!departures.length) fail('请求参数有误，请稍后重试', 400, false);
    const list = histories();
    const searchedAt = params.searchedAt || isoNow();
    const signature = JSON.stringify({
      departures: departures.map(item => ({
        participantId: item.participantId,
        poiId: item.poiId,
        transportMode: item.transportMode
      })),
      preferences: (params.preferences || []).slice().sort(),
      strategy: params.strategy || null,
      midpointMode: params.midpointMode || 'auto'
    });
    const existing = list.find(item => item.signature === signature);
    const record = Object.assign({}, params, {
      id: existing ? existing.id : 'h_' + Date.now(), signature, partySize: departures.length,
      departureNames: departures.map(item => item.name),
      transportModes: Array.from(new Set(departures.map(item => item.transportMode))),
      searchedAt, displayTime: displayTime(searchedAt), favoriteCount: (params.favoritedIds || []).length
    });
    if (existing) Object.assign(existing, record); else list.unshift(record);
    write(config.storageKeys.history, list.slice(0, config.limits.maxHistory));
    return { historyId: record.id };
  },

  getHistory(params) {
    guard('getHistory');
    const page = typeof params.page === 'undefined' ? 1 : Number(params.page);
    const pageSize = typeof params.pageSize === 'undefined' ? 20 : Number(params.pageSize);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) fail('请求参数有误，请稍后重试', 400, false);
    const list = histories().slice().sort((a, b) => String(b.searchedAt).localeCompare(String(a.searchedAt)));
    return { total: list.length, items: list.slice((page - 1) * pageSize, page * pageSize) };
  },

  clearHistory(params) {
    guard('clearHistory');
    if (params.confirm !== true) fail('请求参数有误，请稍后重试', 400, false);
    const deletedCount = histories().length;
    remove(config.storageKeys.history);
    return { deletedCount };
  },

  reportEvent(params) {
    guard('reportEvent');
    console.info('[mock][reportEvent]', params.eventName);
    return null;
  }
};

module.exports = handlers;

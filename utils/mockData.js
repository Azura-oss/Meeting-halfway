/**
 * 接口层本地假数据（仅被 utils/api.js 引用）
 * 数据结构严格对齐《哪见接口约定》与 PRD，页面无需改动即可在接入 api.js 后直接复用。
 */
const config = require('./config');

/* ==================== 一、POI 联想库（searchPOI） ==================== */

const POI_DB = [
  { id: 'poi_1', title: '双流机场', address: '成都市双流区航空港街道', lat: 30.5757, lng: 103.9472 },
  { id: 'poi_2', title: '武侯祠', address: '成都市武侯区武侯祠大街 231 号', lat: 30.6427, lng: 104.0433 },
  { id: 'poi_3', title: '春熙路', address: '成都市锦江区春熙路街道', lat: 30.6578, lng: 104.0810 },
  { id: 'poi_4', title: '天府广场', address: '成都市青羊区人民南路一段', lat: 30.6570, lng: 104.0657 },
  { id: 'poi_5', title: '宽窄巷子', address: '成都市青羊区同仁路以东', lat: 30.6690, lng: 104.0550 },
  { id: 'poi_6', title: '成都东站', address: '成都市成华区邛崃山路 333 号', lat: 30.6290, lng: 104.1416 },
  { id: 'poi_7', title: '环球中心', address: '成都市武侯区天府大道北段 1700 号', lat: 30.5750, lng: 104.0640 },
  { id: 'poi_8', title: '锦里', address: '成都市武侯区武侯祠大街 231 号附 1 号', lat: 30.6410, lng: 104.0470 },
  { id: 'poi_9', title: '人民公园', address: '成都市青羊区少城路 12 号', lat: 30.6620, lng: 104.0580 },
  { id: 'poi_10', title: '东郊记忆', address: '成都市成华区建设南支路 4 号', lat: 30.6650, lng: 104.1290 },
  { id: 'poi_11', title: '成都南站', address: '成都市武侯区火车南站西路 1 号', lat: 30.6080, lng: 104.0680 },
  { id: 'poi_12', title: '犀浦地铁站', address: '成都市郫都区犀浦镇', lat: 30.7550, lng: 103.9700 }
];

/* ==================== 二、语音识别与语义解析（asrRecognize / parseIntent） ==================== */

// 交替返回：第 1 次信息完整、第 2 次缺项，便于联调两种状态
const MOCK_ASR_TEXTS = [
  '我们仨从双流机场、武侯祠出发，坐地铁，想找咖啡厅',
  '想找咖啡厅'
];

let asrRound = 0;

// 出行方式关键词（长词优先）
const TRANSPORT_KEYWORDS = [
  { keyword: '步行', value: 'walking' },
  { keyword: '走路', value: 'walking' },
  { keyword: '开车', value: 'driving' },
  { keyword: '自驾', value: 'driving' },
  { keyword: '地铁', value: 'subway' },
  { keyword: '公交', value: 'bus' }
];

// 场所类型六大类（PRD A10）
const PLACE_CATEGORIES = [
  { title: '吃吃喝喝', items: ['中餐', '西餐', '快餐', '咖啡厅', '奶茶', '甜品'] },
  { title: '逛逛商场', items: ['商场', '超市'] },
  { title: 'High 玩', items: ['酒吧', 'KTV', '棋牌游戏', '网吧', '游乐场', '洗浴推拿'] },
  { title: '运动健身', items: ['网球', '篮球', '足球', '溜冰', '游泳', '乒乓球', '台球', '羽毛球', '滑雪', '跆拳道', '保龄球', '健身房'] },
  { title: '文娱活动', items: ['电影院', '音乐厅', '剧场'] },
  { title: 'City Walk', items: ['公园广场', '景区', '博物馆', '美术馆', '图书馆'] }
];

const PLACE_KEYWORDS = PLACE_CATEGORIES.reduce((all, group) => all.concat(group.items), []);

const FUZZY_WORDS = /都行|随便|都可以|无所谓|不挑/;

/* ==================== 三、推荐结果（getRecommendations / getRoutes / getPlaceDetail） ==================== */

const MIDPOINTS = {
  least_transfer: {
    name: '春熙路地铁站 A 口',
    lat: 30.6578,
    lng: 104.0810,
    address: '成都市锦江区红星路三段'
  },
  least_stops: {
    name: '东门大桥地铁站 B 口',
    lat: 30.6543,
    lng: 104.0918,
    address: '成都市锦江区东大街'
  }
};

// 场所基础信息（fakeRoute 由 buildFakeRoutes 依据出发地动态生成）
const PLACES = {
  least_transfer: [
    { id: 'p1', name: '星巴克（春熙路店）', type: '咖啡厅', openTime: '07:00-22:00', distanceToMidpoint: 180, distanceToUser: 220, arrivalTime: 8, lat: 30.6586, lng: 104.0826, address: '成都市锦江区红星路三段 1 号 IFS 商场 L1', phone: '028-86661234' },
    { id: 'p2', name: '小龙坎老火锅（春熙路店）', type: '中餐', openTime: '11:00-次日 02:00', distanceToMidpoint: 320, distanceToUser: 260, arrivalTime: 7, lat: 30.6562, lng: 104.0791, address: '成都市锦江区春熙路南段 68 号', phone: '028-86666088' },
    { id: 'p3', name: '成都远洋太古里', type: '商场', openTime: '10:00-22:00', distanceToMidpoint: 450, distanceToUser: 510, arrivalTime: 9, lat: 30.6551, lng: 104.0837, address: '成都市锦江区中纱帽街 8 号', phone: '028-85558888' },
    { id: 'p4', name: '喜茶（IFS 店）', type: '奶茶', openTime: '10:00-22:00', distanceToMidpoint: 260, distanceToUser: 300, arrivalTime: 8, lat: 30.6538, lng: 104.0803, address: '成都市锦江区红星路三段 1 号 IFS 商场 LG1', phone: '028-86661111' },
    { id: 'p5', name: '太平洋影城（春熙路店）', type: '电影院', openTime: '10:00-24:00', distanceToMidpoint: 640, distanceToUser: 580, arrivalTime: 10, lat: 30.6598, lng: 104.0842, address: '成都市锦江区春熙路北段 28 号 5 层', phone: '028-86662222' }
  ],
  least_stops: [
    { id: 's1', name: '漫咖啡（东大街店）', type: '咖啡厅', openTime: '09:00-23:00', distanceToMidpoint: 210, distanceToUser: 640, arrivalTime: 9, lat: 30.6552, lng: 104.0931, address: '成都市锦江区东大街 188 号', phone: '028-86663333' },
    { id: 's2', name: '玉林串串香（东大街店）', type: '中餐', openTime: '11:00-23:00', distanceToMidpoint: 380, distanceToUser: 720, arrivalTime: 11, lat: 30.6528, lng: 104.0899, address: '成都市锦江区东大街 268 号', phone: '028-86664444' },
    { id: 's3', name: '王府井百货（总府路店）', type: '商场', openTime: '10:00-22:00', distanceToMidpoint: 520, distanceToUser: 860, arrivalTime: 12, lat: 30.6585, lng: 104.0871, address: '成都市锦江区总府路 15 号', phone: '028-86665555' },
    { id: 's4', name: '几何书店（成都店）', type: '图书馆', openTime: '10:00-22:00', distanceToMidpoint: 640, distanceToUser: 950, arrivalTime: 13, lat: 30.6512, lng: 104.0952, address: '成都市锦江区东大街 99 号', phone: '028-86667777' },
    { id: 's5', name: '锦绣天府塔', type: '景区', openTime: '09:30-22:00', distanceToMidpoint: 780, distanceToUser: 1080, arrivalTime: 14, lat: 30.6495, lng: 104.0971, address: '成都市成华区猛追湾街 168 号', phone: '028-86669999' }
  ]
};

const LINE_COLORS = ['#07C160', '#1989FA', '#FF9500', '#FA5151', '#8E44AD', '#00B8D9'];

// 每人到达耗时偏移（按顺序取，人数上限 6）
const ARRIVAL_OFFSETS = [0, 1, -1, 2, 0, 1];

/* ==================== 四、内部工具函数 ==================== */

function findPlace(placeId) {
  const keys = Object.keys(PLACES);

  for (let i = 0; i < keys.length; i++) {
    const hit = PLACES[keys[i]].filter(place => place.id === placeId)[0];

    if (hit) {
      return hit;
    }
  }

  return null;
}

// 生成「出发地 → 场所」的弧形假路线（非两点直线）
function buildRoute(from, to, bend) {
  const points = [];
  const total = 6;
  const start = {
    lat: from && from.lat ? from.lat : 30.67,
    lng: from && from.lng ? from.lng : 104.06
  };

  for (let i = 0; i <= total; i++) {
    const t = i / total;
    const arc = Math.sin(Math.PI * t) * bend;

    points.push({
      lat: start.lat + (to.lat - start.lat) * t + arc,
      lng: start.lng + (to.lng - start.lng) * t + arc
    });
  }

  return points;
}

function buildFakeRoutes(place, departures) {
  const list = (departures && departures.length)
    ? departures
    : [{ name: '我', lat: 30.67, lng: 104.06 }];

  return list.map((person, index) => ({
    label: person.name || String(index + 1),
    color: LINE_COLORS[index % LINE_COLORS.length],
    points: buildRoute(person, place, 0.006 * (index + 1))
  }));
}

function buildArrivalList(departures, baseMinutes) {
  const list = (departures && departures.length)
    ? departures
    : [{ name: '我' }, { name: '2' }];

  return list.map((person, index) => ({
    name: person.name || String(index + 1),
    minutes: Math.max(1, baseMinutes + (ARRIVAL_OFFSETS[index] || 0))
  }));
}

function isAllSubway(departures) {
  return (departures || []).length > 0 &&
    departures.every(item => item.transport === 'subway' || item.transport === '地铁');
}

function readStorage(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value || fallback;
  } catch (err) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (err) {
    return false;
  }
}

function isFavorite(placeId) {
  return readStorage(config.storageKeys.favorites, [])
    .some(item => item.id === placeId);
}

function formatNow() {
  const now = new Date();
  const hh = now.getHours() < 10 ? '0' + now.getHours() : String(now.getHours());
  const mm = now.getMinutes() < 10 ? '0' + now.getMinutes() : String(now.getMinutes());

  return '今天 ' + hh + ':' + mm;
}

/* ==================== 五、对外 mock handler ==================== */

module.exports = {
  placeCategories: PLACE_CATEGORIES,
  transportOptions: config.transportOptions,
  strategyList: config.strategyList,

  // 1.1 POI 联想搜索（限成都市域）
  searchPOI(params) {
    const keyword = ((params && params.keyword) || '').trim();
    const list = keyword
      ? POI_DB.filter(item => item.title.indexOf(keyword) > -1 || item.address.indexOf(keyword) > -1)
      : POI_DB.slice(0, 8);

    return list.slice(0, 10);
  },

  // 1.2 语音识别：返回文字与录音时长
  asrRecognize(params) {
    const text = MOCK_ASR_TEXTS[asrRound % MOCK_ASR_TEXTS.length];
    asrRound += 1;

    return {
      text,
      audioDurationMs: (params && params.audioDurationMs) || 3200
    };
  },

  // 1.3 语义解析：人数 / 出发地 / 出行方式 / 场所偏好 / 缺项
  parseIntent(params) {
    const text = (params && params.text) || '';
    const upperText = text.toUpperCase();
    const departures = [];
    const missingItems = [];

    // 人数
    let count = 0;
    const numMatch = text.match(/(\d+)\s*[人个位]/);

    if (numMatch) {
      count = parseInt(numMatch[1], 10);
    } else if (text.indexOf('仨') > -1) {
      count = 3;
    } else if (text.indexOf('俩') > -1 || text.indexOf('两个') > -1) {
      count = 2;
    }

    // 出发地：优先取「从……出发」，否则用 POI 库兜底匹配
    const fromMatch = text.match(/从(.+?)(?:出发|过去|过来|走)/);

    if (fromMatch) {
      fromMatch[1].split(/[、,，和及\s]+/).forEach(raw => {
        const name = raw.replace(/[（(].*?[)）]/g, '').trim();

        if (name && name.length <= 12) {
          departures.push({ name });
        }
      });
    }

    if (departures.length === 0) {
      POI_DB.forEach(poi => {
        if (text.indexOf(poi.title) > -1) {
          departures.push({ name: poi.title, lat: poi.lat, lng: poi.lng });
        }
      });
    }

    // 出行方式（枚举值）
    let transport = null;

    for (let i = 0; i < TRANSPORT_KEYWORDS.length; i++) {
      if (text.indexOf(TRANSPORT_KEYWORDS[i].keyword) > -1) {
        transport = TRANSPORT_KEYWORDS[i].value;
        break;
      }
    }

    // 场所偏好：「都行 / 随便」→ 默认全选，不判为缺项
    let preferences = [];

    if (FUZZY_WORDS.test(text)) {
      preferences = PLACE_KEYWORDS.slice();
    } else {
      PLACE_KEYWORDS.forEach(name => {
        const hit = name === 'KTV' ? upperText.indexOf('KTV') > -1 : text.indexOf(name) > -1;

        if (hit && preferences.indexOf(name) === -1) {
          preferences.push(name);
        }
      });
    }

    // 缺项（顺序固定，便于前端直接拼接文案）
    if (departures.length === 0) {
      missingItems.push('出发地');
    }
    if (!count) {
      missingItems.push('人数');
    }
    if (!transport) {
      missingItems.push('出行方式');
    }
    if (preferences.length === 0) {
      missingItems.push('场所偏好');
    }

    return {
      count,
      isComplete: missingItems.length === 0,
      departures,
      transport,
      preferences,
      missingItems
    };
  },

  // 2.1 折中推荐结果
  getRecommendations(params) {
    const departures = (params && params.departures) || [];
    const preferences = (params && params.preferences) || [];
    const strategyParam = (params && params.strategy) || null;

    // 与《接口约定》一致的两个联调测试钩子
    const onlyArtMuseum = preferences.length === 1 && preferences[0] === '美术馆';
    const tooManyDepartures = departures.length > 5;

    if (onlyArtMuseum) {
      return {
        midpoint: MIDPOINTS.least_transfer,
        distanceExpanded: true,
        places: []
      };
    }

    // strategy 取值 least_transfer / least_stops，非全员地铁时一律回落最少换乘
    const strategy = (isAllSubway(departures) && strategyParam)
      ? strategyParam
      : config.strategyEnum.leastTransfer;

    const placeList = (PLACES[strategy] || PLACES.least_transfer).slice(0, tooManyDepartures ? 1 : 5);

    return {
      midpoint: MIDPOINTS[strategy] || MIDPOINTS.least_transfer,
      distanceExpanded: tooManyDepartures,
      strategy,
      places: placeList.map(place => Object.assign({}, place, {
        distanceInMeters: place.distanceToMidpoint,
        fakeRoute: buildFakeRoutes(place, departures),
        isFavorite: isFavorite(place.id)
      }))
    };
  },

  // 2.2 每人路线（按 polylines 结构返回）
  getRoutes(params) {
    const placeId = (params && params.placeId) || '';
    const departures = (params && params.departures) || [];
    const place = findPlace(placeId);

    if (!place) {
      return { polylines: [] };
    }

    return {
      polylines: buildFakeRoutes(place, departures).map(route => ({
        label: route.label,
        points: route.points.map(point => ({
          latitude: point.lat,
          longitude: point.lng
        })),
        color: route.color,
        width: 4
      }))
    };
  },

  // 3 店铺详情（含各人到达指标 participantMetrics）
  getPlaceDetail(params) {
    const placeId = (params && params.placeId) || '';
    const departures = (params && params.departures) || [];
    const place = findPlace(placeId);

    if (!place) {
      return null;
    }

    return Object.assign({}, place, {
      recommend: Number(place.distanceToMidpoint) <= 320,
      coverText: '店铺头图（占位图）',
      distanceToMe: place.distanceToUser,
      arrivalTimeText: place.arrivalTime + '分',
      avgArrival: place.arrivalTime,
      participantMetrics: buildArrivalList(departures, place.arrivalTime),
      isFavorite: isFavorite(place.id)
    });
  },

  // 4 收藏：以本地缓存为准（与现有页面 key 一致）
  getFavorites() {
    const list = readStorage(config.storageKeys.favorites, []);

    return Array.isArray(list) ? list : [];
  },

  toggleFavorite(params) {
    const place = (params && params.place) || {};
    const placeId = (params && params.placeId) || place.id;
    const action = (params && params.action) || '';
    const list = module.exports.getFavorites();
    const index = list.findIndex(item => item.id === placeId);
    const shouldRemove = action === 'remove' || (action !== 'add' && index > -1);

    if (shouldRemove) {
      if (index > -1) {
        list.splice(index, 1);
      }
    } else if (index === -1) {
      list.push({
        id: placeId,
        name: place.name || '',
        type: place.type || '',
        distanceToMidpoint: place.distanceToMidpoint || 0
      });
    }

    writeStorage(config.storageKeys.favorites, list);

    return list;
  },

  // 5 历史记录：最多 50 条，超出删除最旧
  getHistory() {
    const list = readStorage(config.storageKeys.history, []);

    return Array.isArray(list) ? list : [];
  },

  saveHistory(params) {
    const record = Object.assign({
      id: 'h_' + Date.now(),
      createdAt: formatNow()
    }, params || {});

    const list = module.exports.getHistory();
    list.unshift(record);

    // 失败静默：写缓存失败也不影响结果页展示
    writeStorage(config.storageKeys.history, list.slice(0, config.limits.maxHistory));

    return true;
  },

  clearHistory() {
    try {
      wx.removeStorageSync(config.storageKeys.history);
      return true;
    } catch (err) {
      return false;
    }
  },

  // 6 埋点：本地只打印，接入云函数后自动上报
  reportEvent(params) {
    console.log('[reportEvent]', params && params.eventName, params && params.properties);

    return true;
  },

  // 供页面/其他模块复用的工具
  buildRoute,
  buildFakeRoutes,
  buildArrivalList,
  isAllSubway,
  isFavorite
};

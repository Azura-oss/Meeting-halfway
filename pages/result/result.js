const LOADING_DURATION = 2000;

// 默认地图中心（成都市中心）
const DEFAULT_MAP = { lat: 30.67, lng: 104.06 };

// 无参数进入时的兜底参与人
const MOCK_PERSONS = [
  { id: 1, name: '我', location: '双流机场', transport: '地铁' },
  { id: 2, name: '2', location: '武侯祠', transport: '地铁' }
];

// 出发地坐标（本地 mock，未接腾讯 POI）
const MOCK_COORDS = {
  '双流机场': { lat: 30.5757, lng: 103.9472 },
  '武侯祠': { lat: 30.6427, lng: 104.0433 },
  '春熙路': { lat: 30.6578, lng: 104.0810 },
  '天府广场': { lat: 30.6570, lng: 104.0657 },
  '宽窄巷子': { lat: 30.6690, lng: 104.0550 },
  '成都东站': { lat: 30.6290, lng: 104.1416 }
};

// 每人路线配色：我=微信绿，2=蓝色，其余依次
const LINE_COLORS = ['#07C160', '#1989FA', '#FF9500', '#FA5151', '#8E44AD', '#00B8D9'];

// 测试开关：distanceExpanded 提示条 / 空态
const MOCK_DISTANCE_EXPANDED = true;
const MOCK_EMPTY = false;

// 地铁双策略结果（本地 mock）
// 每个 place 的 fakeRoute 为「多人路线」结构：[{ label, points: [{lat,lng}...] }]
const MOCK_RESULT = {
  least_transfer: {
    midpoint: {
      name: '春熙路地铁站 A 口',
      lat: 30.6578,
      lng: 104.0810,
      address: '成都市锦江区红星路三段'
    },
    places: [
      {
        id: 'p1',
        name: '星巴克（春熙路店）',
        type: '咖啡厅',
        openTime: '07:00-22:00',
        distanceToMidpoint: 180,
        distanceToUser: 220,
        arrivalTime: 8,
        lat: 30.6586,
        lng: 104.0826,
        fakeRoute: [
          {
            label: '我',
            points: [
              { lat: 30.5757, lng: 103.9472 },
              { lat: 30.5930, lng: 103.9760 },
              { lat: 30.6120, lng: 104.0020 },
              { lat: 30.6350, lng: 104.0280 },
              { lat: 30.6480, lng: 104.0560 },
              { lat: 30.6586, lng: 104.0826 }
            ]
          },
          {
            label: '2',
            points: [
              { lat: 30.6427, lng: 104.0433 },
              { lat: 30.6480, lng: 104.0560 },
              { lat: 30.6535, lng: 104.0700 },
              { lat: 30.6586, lng: 104.0826 }
            ]
          }
        ]
      },
      {
        id: 'p2',
        name: '小龙坎老火锅（春熙路店）',
        type: '中餐',
        openTime: '11:00-次日 02:00',
        distanceToMidpoint: 320,
        distanceToUser: 260,
        arrivalTime: 7,
        lat: 30.6562,
        lng: 104.0791,
        fakeRoute: [
          {
            label: '我',
            points: [
              { lat: 30.5757, lng: 103.9472 },
              { lat: 30.5905, lng: 103.9720 },
              { lat: 30.6080, lng: 103.9960 },
              { lat: 30.6300, lng: 104.0220 },
              { lat: 30.6450, lng: 104.0500 },
              { lat: 30.6562, lng: 104.0791 }
            ]
          },
          {
            label: '2',
            points: [
              { lat: 30.6427, lng: 104.0433 },
              { lat: 30.6460, lng: 104.0530 },
              { lat: 30.6515, lng: 104.0670 },
              { lat: 30.6562, lng: 104.0791 }
            ]
          }
        ]
      },
      {
        id: 'p3',
        name: '成都远洋太古里',
        type: '商场',
        openTime: '10:00-22:00',
        distanceToMidpoint: 450,
        distanceToUser: 510,
        arrivalTime: 9,
        lat: 30.6551,
        lng: 104.0837,
        fakeRoute: [
          {
            label: '我',
            points: [
              { lat: 30.5757, lng: 103.9472 },
              { lat: 30.5945, lng: 103.9800 },
              { lat: 30.6160, lng: 104.0080 },
              { lat: 30.6380, lng: 104.0340 },
              { lat: 30.6490, lng: 104.0600 },
              { lat: 30.6551, lng: 104.0837 }
            ]
          },
          {
            label: '2',
            points: [
              { lat: 30.6427, lng: 104.0433 },
              { lat: 30.6465, lng: 104.0555 },
              { lat: 30.6508, lng: 104.0705 },
              { lat: 30.6551, lng: 104.0837 }
            ]
          }
        ]
      },
      {
        id: 'p4',
        name: '喜茶（IFS 店）',
        type: '奶茶',
        openTime: '10:00-22:00',
        distanceToMidpoint: 260,
        distanceToUser: 300,
        arrivalTime: 8,
        lat: 30.6538,
        lng: 104.0803,
        fakeRoute: [
          {
            label: '我',
            points: [
              { lat: 30.5757, lng: 103.9472 },
              { lat: 30.5920, lng: 103.9740 },
              { lat: 30.6100, lng: 103.9980 },
              { lat: 30.6320, lng: 104.0240 },
              { lat: 30.6440, lng: 104.0520 },
              { lat: 30.6538, lng: 104.0803 }
            ]
          },
          {
            label: '2',
            points: [
              { lat: 30.6427, lng: 104.0433 },
              { lat: 30.6460, lng: 104.0545 },
              { lat: 30.6499, lng: 104.0674 },
              { lat: 30.6538, lng: 104.0803 }
            ]
          }
        ]
      },
      {
        id: 'p5',
        name: '太平洋影城（春熙路店）',
        type: '电影院',
        openTime: '10:00-24:00',
        distanceToMidpoint: 640,
        distanceToUser: 580,
        arrivalTime: 10,
        lat: 30.6598,
        lng: 104.0842,
        fakeRoute: [
          {
            label: '我',
            points: [
              { lat: 30.5757, lng: 103.9472 },
              { lat: 30.5950, lng: 103.9780 },
              { lat: 30.6140, lng: 104.0040 },
              { lat: 30.6360, lng: 104.0300 },
              { lat: 30.6500, lng: 104.0600 },
              { lat: 30.6598, lng: 104.0842 }
            ]
          },
          {
            label: '2',
            points: [
              { lat: 30.6427, lng: 104.0433 },
              { lat: 30.6482, lng: 104.0570 },
              { lat: 30.6540, lng: 104.0706 },
              { lat: 30.6598, lng: 104.0842 }
            ]
          }
        ]
      }
    ]
  },
  least_stops: {
    midpoint: {
      name: '东门大桥地铁站 B 口',
      lat: 30.6543,
      lng: 104.0918,
      address: '成都市锦江区东大街'
    },
    places: [
      {
        id: 's1',
        name: '漫咖啡（东大街店）',
        type: '咖啡厅',
        openTime: '09:00-23:00',
        distanceToMidpoint: 210,
        distanceToUser: 640,
        arrivalTime: 9,
        lat: 30.6552,
        lng: 104.0931,
        fakeRoute: [
          {
            label: '我',
            points: [
              { lat: 30.5757, lng: 103.9472 },
              { lat: 30.5960, lng: 103.9820 },
              { lat: 30.6180, lng: 104.0120 },
              { lat: 30.6400, lng: 104.0400 },
              { lat: 30.6500, lng: 104.0700 },
              { lat: 30.6552, lng: 104.0931 }
            ]
          },
          {
            label: '2',
            points: [
              { lat: 30.6427, lng: 104.0433 },
              { lat: 30.6460, lng: 104.0590 },
              { lat: 30.6506, lng: 104.0760 },
              { lat: 30.6552, lng: 104.0931 }
            ]
          }
        ]
      },
      {
        id: 's2',
        name: '玉林串串香（东大街店）',
        type: '中餐',
        openTime: '11:00-23:00',
        distanceToMidpoint: 380,
        distanceToUser: 720,
        arrivalTime: 11,
        lat: 30.6528,
        lng: 104.0899,
        fakeRoute: [
          {
            label: '我',
            points: [
              { lat: 30.5757, lng: 103.9472 },
              { lat: 30.5935, lng: 103.9780 },
              { lat: 30.6140, lng: 104.0060 },
              { lat: 30.6350, lng: 104.0340 },
              { lat: 30.6460, lng: 104.0640 },
              { lat: 30.6528, lng: 104.0899 }
            ]
          },
          {
            label: '2',
            points: [
              { lat: 30.6427, lng: 104.0433 },
              { lat: 30.6452, lng: 104.0583 },
              { lat: 30.6490, lng: 104.0741 },
              { lat: 30.6528, lng: 104.0899 }
            ]
          }
        ]
      },
      {
        id: 's3',
        name: '王府井百货（总府路店）',
        type: '商场',
        openTime: '10:00-22:00',
        distanceToMidpoint: 520,
        distanceToUser: 860,
        arrivalTime: 12,
        lat: 30.6585,
        lng: 104.0871,
        fakeRoute: [
          {
            label: '我',
            points: [
              { lat: 30.5757, lng: 103.9472 },
              { lat: 30.5975, lng: 103.9850 },
              { lat: 30.6200, lng: 104.0160 },
              { lat: 30.6420, lng: 104.0440 },
              { lat: 30.6530, lng: 104.0720 },
              { lat: 30.6585, lng: 104.0871 }
            ]
          },
          {
            label: '2',
            points: [
              { lat: 30.6427, lng: 104.0433 },
              { lat: 30.6485, lng: 104.0579 },
              { lat: 30.6535, lng: 104.0725 },
              { lat: 30.6585, lng: 104.0871 }
            ]
          }
        ]
      },
      {
        id: 's4',
        name: '几何书店（成都店）',
        type: '图书馆',
        openTime: '10:00-22:00',
        distanceToMidpoint: 640,
        distanceToUser: 950,
        arrivalTime: 13,
        lat: 30.6512,
        lng: 104.0952,
        fakeRoute: [
          {
            label: '我',
            points: [
              { lat: 30.5757, lng: 103.9472 },
              { lat: 30.5940, lng: 103.9800 },
              { lat: 30.6160, lng: 104.0100 },
              { lat: 30.6380, lng: 104.0380 },
              { lat: 30.6480, lng: 104.0680 },
              { lat: 30.6512, lng: 104.0952 }
            ]
          },
          {
            label: '2',
            points: [
              { lat: 30.6427, lng: 104.0433 },
              { lat: 30.6445, lng: 104.0606 },
              { lat: 30.6478, lng: 104.0779 },
              { lat: 30.6512, lng: 104.0952 }
            ]
          }
        ]
      },
      {
        id: 's5',
        name: '锦绣天府塔',
        type: '景区',
        openTime: '09:30-22:00',
        distanceToMidpoint: 780,
        distanceToUser: 1080,
        arrivalTime: 14,
        lat: 30.6495,
        lng: 104.0971,
        fakeRoute: [
          {
            label: '我',
            points: [
              { lat: 30.5757, lng: 103.9472 },
              { lat: 30.5920, lng: 103.9760 },
              { lat: 30.6120, lng: 104.0060 },
              { lat: 30.6340, lng: 104.0360 },
              { lat: 30.6450, lng: 104.0680 },
              { lat: 30.6495, lng: 104.0971 }
            ]
          },
          {
            label: '2',
            points: [
              { lat: 30.6427, lng: 104.0433 },
              { lat: 30.6432, lng: 104.0612 },
              { lat: 30.6463, lng: 104.0791 },
              { lat: 30.6495, lng: 104.0971 }
            ]
          }
        ]
      }
    ]
  }
};

// 店铺补充信息（地址 / 电话 / 类型），按 id 关联并合并进 places，
// 保证 places 里每个场所都包含完整字段：id / name / type / openTime /
// distanceToMidpoint / distanceToUser / arrivalTime / address / phone
const MOCK_SHOP_EXTRA = {
  p1: { address: '成都市锦江区红星路三段 1 号 IFS 商场 L1', phone: '028-86661234' },
  p2: { address: '成都市锦江区春熙路南段 68 号', phone: '028-86666088' },
  p3: { address: '成都市锦江区中纱帽街 8 号', phone: '028-85558888' },
  p4: { address: '成都市锦江区红星路三段 1 号 IFS 商场 LG1', phone: '028-86661111' },
  p5: { address: '成都市锦江区春熙路北段 28 号 5 层', phone: '028-86662222' },
  s1: { address: '成都市锦江区东大街 188 号', phone: '028-86663333' },
  s2: { address: '成都市锦江区东大街 268 号', phone: '028-86664444' },
  s3: { address: '成都市锦江区总府路 15 号', phone: '028-86665555' },
  s4: { address: '成都市锦江区东大街 99 号', phone: '028-86667777' },
  s5: { address: '成都市成华区猛追湾街 168 号', phone: '028-86669999' }
};

// 折中点本身的基准到达耗时
const MIDPOINT_BASE_MINUTES = 8;

// 本地缓存 key（模拟数据库）与历史上限
const FAVORITES_KEY = 'myFavorites';
const HISTORY_KEY = 'myHistory';
const MAX_HISTORY = 50;

Page({
  data: {
    loading: true,
    loadingText: '正在为你计算碰面点，大家都不吃亏的位置，大约需要 3 秒',

    mapLat: DEFAULT_MAP.lat,
    mapLng: DEFAULT_MAP.lng,
    markers: [],
    polylines: [],

    midpoint: {},
    arrivalList: [],

    distanceExpanded: MOCK_DISTANCE_EXPANDED,

    personList: [],
    departures: [],
    preferences: [],

    showStrategy: false,
    strategy: 'least_transfer',
    strategyList: [
      { key: 'least_transfer', name: '最少换乘' },
      { key: 'least_stops', name: '最少站点' }
    ],

    places: [],
    selectedPlaceId: '',
    selectedPlaceName: '',
    routeLegend: [],
    pinnedIds: [],
    favoritedIds: [],

    // 是否由历史记录进入（进入时不重复写入历史）
    fromHistory: false
  },

  onLoad(options) {
    const params = options || {};
    const personList = this.parsePersonList(params);
    const departures = this.resolveDepartures(personList);

    // 从历史记录进入时，恢复当时的置顶 / 收藏状态
    const pinnedIds = this.parseIdList(params.pinnedIds);
    const favoritedIds = this.parseIdList(params.favoritedIds);
    const fromHistory = params.from === 'history';
    const preferences = this.parseIdList(params.preferences);

    // 仅当所有人都选择地铁时，才展示地铁策略切换
    const showStrategy = personList.length > 0 &&
      personList.every(item => item.transport === '地铁');

    this.setData({
      personList,
      departures,
      showStrategy,
      pinnedIds,
      favoritedIds,
      fromHistory,
      preferences
    });

    // 模拟 2 秒计算过程
    this.loadingTimer = setTimeout(() => {
      this.loadingTimer = null;
      this.setData({ loading: false });
      this.applyStrategy(this.data.strategy, true);
    }, LOADING_DURATION);
  },

  onUnload() {
    if (this.loadingTimer) {
      clearTimeout(this.loadingTimer);
      this.loadingTimer = null;
    }
  },

  /* ---------------- 参数与数据准备 ---------------- */

  // 解析 URL 里的数组参数（兼容未编码 / 已编码两种形式）
  parseIdList(raw) {
    if (!raw) {
      return [];
    }

    const candidates = [raw];
    try {
      candidates.push(decodeURIComponent(raw));
    } catch (err) {
      // 忽略解码失败
    }

    for (let i = 0; i < candidates.length; i++) {
      try {
        const parsed = JSON.parse(candidates[i]);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (err) {
        // 继续尝试下一种形式
      }
    }

    // 兜底：按逗号分隔
    return String(raw).split(',').filter(item => item);
  },

  // 接收上一页参数（兼容未编码 / 已编码两种形式）
  parsePersonList(params) {
    const raw = params.personList;

    if (!raw) {
      return MOCK_PERSONS;
    }

    const candidates = [raw];
    try {
      candidates.push(decodeURIComponent(raw));
    } catch (err) {
      // 忽略解码失败
    }

    for (let i = 0; i < candidates.length; i++) {
      try {
        const parsed = JSON.parse(candidates[i]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (err) {
        // 继续尝试下一种形式
      }
    }

    return MOCK_PERSONS;
  },

  resolveDepartures(personList) {
    return personList.map((person, index) => {
      const coord = MOCK_COORDS[person.location] || {
        lat: DEFAULT_MAP.lat + 0.012 * (index + 1),
        lng: DEFAULT_MAP.lng - 0.014 * (index + 1)
      };

      return {
        id: person.id || index + 1,
        name: person.name || String(index + 1),
        location: person.location,
        lat: coord.lat,
        lng: coord.lng
      };
    });
  },

  buildArrivalList(personList, baseMinutes) {
    const offsets = [0, 1, -1, 2, 0, 1];

    return personList.map((person, index) => ({
      id: person.id || index + 1,
      name: person.name || String(index + 1),
      minutes: Math.max(1, baseMinutes + (offsets[index] || 0))
    }));
  },

  // 排序规则：已置顶 > 已收藏 > 默认（算法原序），并写入按钮状态
  decorate(places, pinnedIds, favoritedIds) {
    const buckets = [[], [], []];

    places.forEach(place => {
      const isPinned = pinnedIds.indexOf(place.id) > -1;
      const isFav = favoritedIds.indexOf(place.id) > -1;
      const item = Object.assign({}, place, MOCK_SHOP_EXTRA[place.id] || {}, {
        isPinned,
        isFav,
        // 统一成多人路线结构：[{ label, points }]
        fakeRoute: this.normalizeRoutes(place)
      });
      const rank = isPinned ? 0 : (isFav ? 1 : 2);

      buckets[rank].push(item);
    });

    return buckets[0].concat(buckets[1], buckets[2]);
  },

  /* ---------------- 多人假路线 ---------------- */

  // 统一 fakeRoute 结构，兼容旧版「扁平点数组」写法
  normalizeRoutes(place) {
    const raw = place.fakeRoute;
    const departures = this.data.departures || [];

    // 新结构：[{ label, points }]
    if (Array.isArray(raw) && raw.length > 0 && raw[0] && Array.isArray(raw[0].points)) {
      return raw.map((route, index) => ({
        label: route.label || (departures[index] && departures[index].name) || String(index + 1),
        points: route.points
      }));
    }

    // 旧结构：扁平点数组 → 作为第一个人的路线，其余人自动补
    if (Array.isArray(raw) && raw.length > 1) {
      const routes = this.buildFakeRoutes(place);
      routes[0] = {
        label: (departures[0] && departures[0].name) || '我',
        points: raw
      };
      return routes;
    }

    return this.buildFakeRoutes(place);
  },

  // 兜底：按参与人生成「出发地 → 场所」的弧形假路线
  buildFakeRoutes(place) {
    const departures = (this.data.departures && this.data.departures.length)
      ? this.data.departures
      : [{ name: '我', lat: DEFAULT_MAP.lat, lng: DEFAULT_MAP.lng }];

    return departures.map((person, index) => {
      const points = [];
      const total = 4;

      for (let i = 0; i <= total; i++) {
        const t = i / total;
        const arc = Math.sin(Math.PI * t) * 0.006 * (index + 1);

        points.push({
          lat: person.lat + (place.lat - person.lat) * t + arc,
          lng: person.lng + (place.lng - person.lng) * t + arc
        });
      }

      return {
        label: person.name || String(index + 1),
        points
      };
    });
  },

  // 遍历 fakeRoute，为每个人生成一条独立 polyline（颜色区分，宽度 4）
  buildPolylinesByPlace(place) {
    const routes = this.normalizeRoutes(place);

    return routes.map((route, index) => ({
      points: (route.points || []).map(point => ({
        latitude: point.lat,
        longitude: point.lng
      })),
      color: LINE_COLORS[index % LINE_COLORS.length],
      width: 4,
      arrowLine: true,
      borderWidth: 1,
      borderColor: '#FFFFFF'
    }));
  },

  buildRouteLegend(place) {
    return this.normalizeRoutes(place).map((route, index) => ({
      name: route.label || String(index + 1),
      color: LINE_COLORS[index % LINE_COLORS.length]
    }));
  },

  /* ---------------- 地图标注 ---------------- */

  buildMarkers(midpoint, place) {
    const markers = [];
    const departures = this.data.departures;

    if (midpoint && midpoint.lat) {
      markers.push({
        id: 1,
        latitude: midpoint.lat,
        longitude: midpoint.lng,
        width: 30,
        height: 30,
        label: {
          content: '碰面点',
          color: '#07C160',
          fontSize: 11,
          anchorX: 0,
          anchorY: -40,
          borderRadius: 6,
          bgColor: '#FFFFFF',
          padding: 6
        }
      });
    }

    departures.forEach((item, index) => {
      markers.push({
        id: 10 + index,
        latitude: item.lat,
        longitude: item.lng,
        width: 30,
        height: 30,
        label: {
          content: item.name,
          color: LINE_COLORS[index % LINE_COLORS.length],
          fontSize: 11,
          anchorX: 0,
          anchorY: -40,
          borderRadius: 6,
          bgColor: '#FFFFFF',
          padding: 6
        }
      });
    });

    if (place && place.lat) {
      markers.push({
        id: 2,
        latitude: place.lat,
        longitude: place.lng,
        width: 30,
        height: 30,
        label: {
          content: place.name,
          color: '#FA5151',
          fontSize: 11,
          anchorX: 0,
          anchorY: -40,
          borderRadius: 6,
          bgColor: '#FFFFFF',
          padding: 6
        }
      });
    }

    return markers;
  },

  /* ---------------- 策略与交互 ---------------- */

  applyStrategy(key, shouldRecord) {
    const mock = MOCK_RESULT[key] || MOCK_RESULT.least_transfer;
    const midpoint = mock.midpoint;
    const places = MOCK_EMPTY
      ? []
      : this.decorate(mock.places, this.data.pinnedIds, this.data.favoritedIds);

    this.setData({
      strategy: key,
      midpoint,
      mapLat: midpoint.lat,
      mapLng: midpoint.lng,
      places,
      selectedPlaceId: '',
      selectedPlaceName: '',
      routeLegend: [],
      polylines: [],
      markers: this.buildMarkers(midpoint, null),
      arrivalList: this.buildArrivalList(this.data.personList, MIDPOINT_BASE_MINUTES)
    });

    // 首次拿到推荐数据后落一条历史记录（切换策略不重复写入）
    if (shouldRecord) {
      this.saveHistoryRecord();
    }
  },

  onSwitchStrategy(e) {
    const key = e.currentTarget.dataset.key;

    if (key === this.data.strategy) {
      return;
    }

    this.applyStrategy(key);
  },

  // 点击卡片：只负责画该场所的每人路线（覆盖旧路线）与卡片高亮，不做任何跳转
  onSelectPlace(e) {
    const id = e.currentTarget.dataset.id;
    const place = this.data.places.filter(item => item.id === id)[0];

    if (!place) {
      return;
    }

    const polylines = this.buildPolylinesByPlace(place);

    this.setData({
      selectedPlaceId: id,
      selectedPlaceName: place.name,
      markers: this.buildMarkers(this.data.midpoint, place),
      polylines,
      routeLegend: this.buildRouteLegend(place),
      arrivalList: this.buildArrivalList(this.data.personList, place.arrivalTime)
    });
  },

  // 「查看详情 >」按钮：catchtap 触发（阻止冒泡），只负责跳转店铺详情页
  goToDetail(e) {
    const dataset = e.currentTarget.dataset;
    const id = dataset.id;
    const name = dataset.name;

    if (!id) {
      return;
    }

    wx.navigateTo({
      url: '/pages/shop-detail/shop-detail?id=' + id
        + '&name=' + encodeURIComponent(name || ''),
      fail: () => {
        wx.showToast({
          title: '详情页跳转失败',
          icon: 'none'
        });
      }
    });
  },

  onTogglePin(e) {
    const id = e.currentTarget.dataset.id;
    const pinnedIds = this.data.pinnedIds.slice();
    const index = pinnedIds.indexOf(id);

    if (index > -1) {
      pinnedIds.splice(index, 1);
    } else {
      pinnedIds.push(id);
    }

    this.setData({
      pinnedIds,
      places: this.decorate(this.data.places, pinnedIds, this.data.favoritedIds)
    });

    // 置顶仅本次搜索生效，但要同步到最新一条历史记录
    this.syncLatestHistoryRecord();
  },

  onToggleFav(e) {
    const id = e.currentTarget.dataset.id;
    const place = this.data.places.filter(item => item.id === id)[0];
    const favoritedIds = this.data.favoritedIds.slice();
    const index = favoritedIds.indexOf(id);

    if (index > -1) {
      favoritedIds.splice(index, 1);
    } else {
      favoritedIds.push(id);
    }

    this.setData({
      favoritedIds,
      places: this.decorate(this.data.places, this.data.pinnedIds, favoritedIds)
    });

    // 收藏持久化到本地缓存（已存在则移除，实现取消收藏）
    if (place) {
      this.toggleFavoriteCache(place);
    }

    this.syncLatestHistoryRecord();
  },

  /* ---------------- 本地缓存（模拟数据库） ---------------- */

  readFavorites() {
    try {
      const list = wx.getStorageSync(FAVORITES_KEY);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  },

  // 收藏 / 取消收藏：写入 myFavorites，防止重复添加
  toggleFavoriteCache(place) {
    const list = this.readFavorites();
    const index = list.findIndex(item => item.id === place.id);

    if (index > -1) {
      list.splice(index, 1);
    } else {
      list.push({
        id: place.id,
        name: place.name,
        type: place.type,
        distanceToMidpoint: place.distanceToMidpoint
      });
    }

    wx.setStorageSync(FAVORITES_KEY, list);
  },

  readHistory() {
    try {
      const list = wx.getStorageSync(HISTORY_KEY);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  },

  // 写入一条历史记录：最多保留 50 条，超出自动删除最旧的
  saveHistoryRecord() {
    if (this.data.fromHistory) {
      return;
    }

    const personList = this.data.personList || [];
    const record = {
      id: 'h_' + Date.now(),
      departureNames: personList.map(item => item.location),
      count: personList.length,
      transport: this.buildTransportText(personList),
      preferences: this.data.preferences || [],
      midpointName: (this.data.midpoint && this.data.midpoint.name) || '',
      favoriteCount: this.data.favoritedIds.length,
      pinnedIds: this.data.pinnedIds.slice(),
      favoritedIds: this.data.favoritedIds.slice(),
      createdAt: this.formatNow()
    };

    const list = this.readHistory();
    list.unshift(record);

    wx.setStorageSync(HISTORY_KEY, list.slice(0, MAX_HISTORY));
  },

  // 置顶 / 收藏变化后，把状态同步回最新一条历史记录，便于从历史恢复
  syncLatestHistoryRecord() {
    const list = this.readHistory();

    if (list.length === 0) {
      return;
    }

    list[0].pinnedIds = this.data.pinnedIds.slice();
    list[0].favoritedIds = this.data.favoritedIds.slice();
    list[0].favoriteCount = this.data.favoritedIds.length;

    wx.setStorageSync(HISTORY_KEY, list);
  },

  buildTransportText(personList) {
    if (!personList || personList.length === 0) {
      return '';
    }

    const first = personList[0].transport || '';
    const same = personList.every(item => item.transport === first);

    return same ? first : '多种方式';
  },

  formatNow() {
    const now = new Date();
    const hh = now.getHours() < 10 ? '0' + now.getHours() : String(now.getHours());
    const mm = now.getMinutes() < 10 ? '0' + now.getMinutes() : String(now.getMinutes());

    return '今天 ' + hh + ':' + mm;
  },

  onBackModify() {
    wx.showToast({
      title: '返回修改出发信息',
      icon: 'none'
    });
  }
});

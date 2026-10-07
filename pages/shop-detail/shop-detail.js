// ===== 店铺详情模拟库：以 id 为键，与结果页 places 的 id 一一对应 =====
const mockDetailData = {
  p1: {
    name: '星巴克（春熙路店）',
    type: '咖啡厅',
    recommend: true,
    coverText: '店铺头图（占位图）',
    distance: 180,
    distanceToMe: 220,
    avgArrival: 8,
    arrivalTime: '8分',
    arrivalList: [{ name: '我', minutes: 8 }, { name: '小红', minutes: 9 }],
    openTime: '07:00-22:00',
    address: '成都市锦江区红星路三段 1 号 IFS 商场 L1',
    phone: '028-86661234'
  },
  p2: {
    name: '小龙坎老火锅（春熙路店）',
    type: '中餐',
    recommend: true,
    coverText: '店铺头图（占位图）',
    distance: 320,
    distanceToMe: 260,
    avgArrival: 7,
    arrivalTime: '7分',
    arrivalList: [{ name: '我', minutes: 7 }, { name: '小红', minutes: 8 }],
    openTime: '11:00-次日 02:00',
    address: '成都市锦江区春熙路南段 68 号',
    phone: '028-86666088'
  },
  p3: {
    name: '成都远洋太古里',
    type: '商场',
    recommend: false,
    coverText: '店铺头图（占位图）',
    distance: 450,
    distanceToMe: 510,
    avgArrival: 9,
    arrivalTime: '9分',
    arrivalList: [{ name: '我', minutes: 9 }, { name: '小红', minutes: 10 }],
    openTime: '10:00-22:00',
    address: '成都市锦江区中纱帽街 8 号',
    phone: '028-85558888'
  },
  p4: {
    name: '喜茶（IFS 店）',
    type: '奶茶',
    recommend: false,
    coverText: '店铺头图（占位图）',
    distance: 260,
    distanceToMe: 300,
    avgArrival: 8,
    arrivalTime: '8分',
    arrivalList: [{ name: '我', minutes: 8 }, { name: '小红', minutes: 8 }],
    openTime: '10:00-22:00',
    address: '成都市锦江区红星路三段 1 号 IFS 商场 LG1',
    phone: '028-86661111'
  },
  p5: {
    name: '太平洋影城（春熙路店）',
    type: '电影院',
    recommend: false,
    coverText: '店铺头图（占位图）',
    distance: 640,
    distanceToMe: 580,
    avgArrival: 10,
    arrivalTime: '10分',
    arrivalList: [{ name: '我', minutes: 10 }, { name: '小红', minutes: 11 }],
    openTime: '10:00-24:00',
    address: '成都市锦江区春熙路北段 28 号 5 层',
    phone: '028-86662222'
  },
  s1: {
    name: '漫咖啡（东大街店）',
    type: '咖啡厅',
    recommend: true,
    coverText: '店铺头图（占位图）',
    distance: 210,
    distanceToMe: 640,
    avgArrival: 9,
    arrivalTime: '9分',
    arrivalList: [{ name: '我', minutes: 9 }, { name: '小红', minutes: 7 }],
    openTime: '09:00-23:00',
    address: '成都市锦江区东大街 188 号',
    phone: '028-86663333'
  },
  s2: {
    name: '玉林串串香（东大街店）',
    type: '中餐',
    recommend: false,
    coverText: '店铺头图（占位图）',
    distance: 380,
    distanceToMe: 720,
    avgArrival: 11,
    arrivalTime: '11分',
    arrivalList: [{ name: '我', minutes: 11 }, { name: '小红', minutes: 9 }],
    openTime: '11:00-23:00',
    address: '成都市锦江区东大街 268 号',
    phone: '028-86664444'
  },
  s3: {
    name: '王府井百货（总府路店）',
    type: '商场',
    recommend: false,
    coverText: '店铺头图（占位图）',
    distance: 520,
    distanceToMe: 860,
    avgArrival: 12,
    arrivalTime: '12分',
    arrivalList: [{ name: '我', minutes: 12 }, { name: '小红', minutes: 10 }],
    openTime: '10:00-22:00',
    address: '成都市锦江区总府路 15 号',
    phone: '028-86665555'
  },
  s4: {
    name: '几何书店（成都店）',
    type: '图书馆',
    recommend: false,
    coverText: '店铺头图（占位图）',
    distance: 640,
    distanceToMe: 950,
    avgArrival: 13,
    arrivalTime: '13分',
    arrivalList: [{ name: '我', minutes: 13 }, { name: '小红', minutes: 11 }],
    openTime: '10:00-22:00',
    address: '成都市锦江区东大街 99 号',
    phone: '028-86667777'
  },
  s5: {
    name: '锦绣天府塔',
    type: '景区',
    recommend: false,
    coverText: '店铺头图（占位图）',
    distance: 780,
    distanceToMe: 1080,
    avgArrival: 14,
    arrivalTime: '14分',
    arrivalList: [{ name: '我', minutes: 14 }, { name: '小红', minutes: 12 }],
    openTime: '09:30-22:00',
    address: '成都市成华区猛追湾街 168 号',
    phone: '028-86669999'
  }
};

// 无参数 / id 匹配不到时的兜底数据，保证页面不白屏
const DEFAULT_DETAIL = Object.assign({ id: '' }, mockDetailData.p1);

// 大众点评占位 appId（真实 appId 需在大众点评开放平台申请）
const DIANPING_APPID = 'wx1234567890';
const DIANPING_HOME_PATH = 'pages/index/index';

// 本地缓存 key（模拟数据库）
const FAVORITES_KEY = 'myFavorites';

Page({
  data: {
    shopInfo: Object.assign({}, DEFAULT_DETAIL, {
      arrivalText: '我 8分，小红 9分'
    }),
    isFav: false
  },

  onLoad(options) {
    const params = options || {};
    const id = params.id ? this.decodeValue(params.id) : '';
    const name = params.name ? this.decodeValue(params.name) : '';

    // 1) 有 name 参数则立刻覆盖兜底店名（严禁把店名写死在 WXML 里）
    if (name) {
      this.setData({
        'shopInfo.name': name
      });
    }

    // 2) 按 id 命中模拟详情库，未命中（如直接访问本页）才使用兜底数据
    const detail = (id && mockDetailData[id]) ? mockDetailData[id] : DEFAULT_DETAIL;

    const shopInfo = Object.assign({}, detail, {
      id: id || detail.id || '',
      name: name || detail.name,
      arrivalText: this.buildArrivalText(detail.arrivalList)
    });

    // 3) 读取本地缓存，判断当前店铺是否已收藏
    const isFav = this.readFavorites().some(item => item.id === shopInfo.id);

    this.setData({
      shopInfo,
      isFav
    });
  },

  /* ---------------- 本地缓存（收藏） ---------------- */

  readFavorites() {
    try {
      const list = wx.getStorageSync(FAVORITES_KEY);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  },

  // 收藏 / 取消收藏：写入 myFavorites，防止重复添加
  toggleFavoriteCache() {
    const shopInfo = this.data.shopInfo;
    const list = this.readFavorites();
    const index = list.findIndex(item => item.id === shopInfo.id);

    if (index > -1) {
      list.splice(index, 1);
    } else {
      list.push({
        id: shopInfo.id,
        name: shopInfo.name,
        type: shopInfo.type,
        distanceToMidpoint: shopInfo.distance
      });
    }

    wx.setStorageSync(FAVORITES_KEY, list);
  },

  // 兼容未编码 / 已编码两种传参形式
  decodeValue(value) {
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return decodeURIComponent(value);
    } catch (err) {
      return value;
    }
  },

  // 每人到达时间文案：由 arrivalList 动态拼装
  buildArrivalText(list) {
    return (list || [])
      .map(item => item.name + ' ' + item.minutes + '分')
      .join('，');
  },

  // 复制地址
  onCopyAddress() {
    const address = this.data.shopInfo.address;

    if (!address) {
      return;
    }

    wx.setClipboardData({
      data: address,
      success: () => {
        wx.showToast({
          title: '地址已复制',
          icon: 'none'
        });
      }
    });
  },

  // 拨打电话
  onCallPhone() {
    const phoneNumber = this.data.shopInfo.phone;

    if (!phoneNumber) {
      return;
    }

    wx.makePhoneCall({
      phoneNumber,
      fail: () => {
        wx.showToast({
          title: '已取消拨打',
          icon: 'none'
        });
      }
    });
  },

  // 收藏：本地状态 + 写入本地缓存，实现跨页面持久化
  onToggleFav() {
    const isFav = !this.data.isFav;

    this.setData({ isFav });
    this.toggleFavoriteCache();

    wx.showToast({
      title: isFav ? '已收藏' : '已取消收藏',
      icon: 'none'
    });
  },

  onNavigate() {
    wx.showToast({
      title: '模拟导航',
      icon: 'none'
    });
  },

  // 去大众点评：两级降级（点评店铺页 → 点评首页 → 复制店名兜底）
  onGoDianping() {
    wx.navigateToMiniProgram({
      appId: DIANPING_APPID,
      path: DIANPING_HOME_PATH,
      fail: () => {
        wx.navigateToMiniProgram({
          appId: DIANPING_APPID,
          path: DIANPING_HOME_PATH,
          fail: () => {
            wx.setClipboardData({
              data: this.data.shopInfo.name,
              success: () => {
                wx.showToast({
                  title: '跳转失败，已复制店名，请前往大众点评搜索',
                  icon: 'none'
                });
              }
            });
          }
        });
      }
    });
  }
});

Page({
  data: {
    // 参与人：name 为序号标签，location 为出发地，transport 为每人单选出行方式
    personList: [
      { id: 1, name: '我', location: '双流机场', transport: '地铁' },
      { id: 2, name: '2', location: '武侯祠', transport: '地铁' }
    ],

    // 出行方式选项（每人只能选一种）
    transportOptions: ['步行', '开车', '地铁', '公交'],

    // 六大类场所类型
    categoryList: [
      { title: '吃吃喝喝', items: ['中餐', '西餐', '快餐', '咖啡厅', '奶茶', '甜品'] },
      { title: '逛逛商场', items: ['商场', '超市'] },
      { title: 'High 玩', items: ['酒吧', 'KTV', '棋牌游戏', '网吧', '游乐场', '洗浴推拿'] },
      { title: '运动健身', items: ['网球', '篮球', '足球', '溜冰', '游泳', '乒乓球', '台球', '羽毛球', '滑雪', '跆拳道', '保龄球', '健身房'] },
      { title: '文娱活动', items: ['电影院', '音乐厅', '剧场'] },
      { title: 'City Walk', items: ['公园广场', '景区', '博物馆', '美术馆', '图书馆'] }
    ],

    // 已选场所（键为场所名，值为 true），供 WXML 用 selectedMap[场所名] 判断高亮
    selectedMap: {
      '咖啡厅': true
    }
  },

  onLoad(options) {
    const params = options || {};

    // ===== 参数占位 =====
    // 未来首页把出发地、出行方式、场所偏好传进来后，只需要替换下面两个数据来源，
    // WXML 与交互逻辑完全不需要改动。
    let personList = this.data.personList;
    let selectedMap = this.data.selectedMap;

    if (params.personList) {
      try {
        personList = JSON.parse(params.personList);
      } catch (err) {
        personList = this.data.personList;
      }
    }

    if (params.preferences) {
      try {
        selectedMap = this.buildSelectedMap(JSON.parse(params.preferences));
      } catch (err) {
        selectedMap = this.data.selectedMap;
      }
    }
    // ===== 参数占位结束 =====

    this.setData({
      personList,
      selectedMap
    });
  },

  buildSelectedMap(list) {
    const map = {};

    (list || []).forEach(name => {
      map[name] = true;
    });

    return map;
  },

  getSelectedPlaces() {
    return Object.keys(this.data.selectedMap || {});
  },

  // 修改参与人：返回首页
  onModify() {
    wx.showToast({
      title: '返回首页修改',
      icon: 'none'
    });
  },

  // 出行方式单选：每人互斥，只改当前这个人的选项
  onSelectTransport(e) {
    const dataset = e.currentTarget.dataset;
    const personIndex = dataset.personIndex;
    const transport = dataset.transport;
    const personList = this.data.personList;

    if (!personList[personIndex] || personList[personIndex].transport === transport) {
      return;
    }

    const key = 'personList[' + personIndex + '].transport';

    this.setData({
      [key]: transport
    });
  },

  // 场所多选
  onTogglePlace(e) {
    const place = e.currentTarget.dataset.place;
    const selectedMap = Object.assign({}, this.data.selectedMap);

    if (selectedMap[place]) {
      delete selectedMap[place];
    } else {
      selectedMap[place] = true;
    }

    this.setData({
      selectedMap
    });
  },

  // 开始推荐：前端校验，通过后仅打印数据（本轮不跳转）
  onStartRecommend() {
    const personList = this.data.personList || [];
    const noTransport = personList.some(item => !item.transport);

    if (personList.length === 0) {
      wx.showToast({
        title: '还没有参与人，请返回首页添加',
        icon: 'none'
      });
      return;
    }

    if (noTransport) {
      wx.showToast({
        title: '请为所有人都选择出行方式',
        icon: 'none'
      });
      return;
    }

    const preferences = this.getSelectedPlaces();

    if (preferences.length === 0) {
      wx.showToast({
        title: '请至少选择一个想去的地方',
        icon: 'none'
      });
      return;
    }

    const payload = {
      departures: personList.map(item => ({
        name: item.name,
        location: item.location,
        transport: item.transport
      })),
      preferences
    };

    //console.log('开始推荐，收集到的数据：', payload);
    // 本轮不进行页面跳转，避免报找不到 result 页面
    wx.navigateTo({
      url:'/pages/result/result'
    });
  }
});

const api = require('../../utils/api');

Page({
  data: {
    personList: [],
    transportOptions: api.transportOptions,
    categoryList: api.placeCategories,
    selectedMap: {},
    submitting: false
  },

  onLoad() {
    const draft = getApp().globalData.pendingDraft;
    if (!draft || !Array.isArray(draft.participants) || !draft.participants.length) {
      wx.showToast({ title: '出发信息已失效，请重新填写', icon: 'none' });
      setTimeout(() => wx.navigateBack({}), 500);
      return;
    }
    this.setData({
      personList: draft.participants.map(item => Object.assign({}, item)),
      selectedMap: this.buildSelectedMap(draft.preferences || [])
    });
  },

  buildSelectedMap(list) {
    const result = {};
    (list || []).forEach(item => { result[item] = true; });
    return result;
  },

  getSelectedPlaces() { return Object.keys(this.data.selectedMap || {}); },
  onModify() { wx.navigateBack({}); },

  onSelectTransport(e) {
    const index = Number(e.currentTarget.dataset.personIndex);
    const value = e.currentTarget.dataset.transport;
    if (!this.data.personList[index] || this.data.personList[index].transportMode === value) return;
    this.setData({ ['personList[' + index + '].transportMode']: value });
  },

  onTogglePlace(e) {
    const place = e.currentTarget.dataset.place;
    const selectedMap = Object.assign({}, this.data.selectedMap);
    if (selectedMap[place]) delete selectedMap[place]; else selectedMap[place] = true;
    this.setData({ selectedMap });
  },

  onStartRecommend() {
    if (this.data.submitting) return;
    const departures = this.data.personList.map(item => ({
      participantId: item.participantId,
      label: item.label,
      poiId: item.poiId,
      name: item.name,
      lat: item.lat,
      lng: item.lng,
      transportMode: item.transportMode
    }));
    if (departures.some(item => !item.transportMode)) {
      wx.showToast({ title: '请为所有人选择出行方式', icon: 'none' });
      return;
    }
    const preferences = this.getSelectedPlaces();
    if (!preferences.length) {
      wx.showToast({ title: '请至少选择一个想去的地方', icon: 'none' });
      return;
    }
    const allSubway = departures.every(item => item.transportMode === 'subway');
    getApp().globalData.pendingSearchContext = {
      departures,
      preferences,
      strategy: allSubway ? 'least_transfer' : null,
      midpointMode: 'auto',
      fromHistory: false
    };
    this.setData({ submitting: true });
    wx.navigateTo({
      url: '/pages/result/result',
      complete: () => this.setData({ submitting: false })
    });
  }
});

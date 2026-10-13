const api = require('../../utils/api');

Page({
  data: {
    loading: true,
    errorMessage: '',
    shopInfo: {},
    selfDistanceMeters: null,
    favoriteBusy: false
  },

  onLoad(options) {
    this.destroyed = false;
    this.placeId = options && options.id ? decodeURIComponent(options.id) : '';
    this.loadDetail();
  },
  onUnload() { this.destroyed = true; },

  // 契约 5.1：participantMetrics / distanceToMidpointMeters 依赖本次搜索上下文，
  // departures / midpoint 为可选参数。仅当上下文与当前地点一致时透传。
  buildDetailParams() {
    const params = { placeId: this.placeId };
    const ctx = getApp().globalData.detailContext;
    if (ctx && ctx.placeId === this.placeId) {
      if (Array.isArray(ctx.departures) && ctx.departures.length) params.departures = ctx.departures;
      if (ctx.midpoint && typeof ctx.midpoint.lat === 'number' && typeof ctx.midpoint.lng === 'number') params.midpoint = ctx.midpoint;
    }
    return params;
  },

  async loadDetail() {
    if (!this.placeId) {
      this.setData({ loading: false, errorMessage: '地点信息已失效' });
      return;
    }
    this.setData({ loading: true, errorMessage: '' });
    try {
      const detail = await api.getPlaceDetail(this.buildDetailParams());
      if (this.destroyed) return;
      const selfMetric = (detail.participantMetrics || []).find(item => item.participantId === 'self');
      this.setData({ loading: false, shopInfo: detail, selfDistanceMeters: selfMetric ? selfMetric.distanceMeters : null });
    } catch (err) {
      if (!this.destroyed) this.setData({ loading: false, errorMessage: err.message || '详情加载失败' });
    }
  },

  onCopyAddress() {
    if (!this.data.shopInfo.address) return;
    wx.setClipboardData({ data: this.data.shopInfo.address });
  },

  onCallPhone() {
    if (!this.data.shopInfo.phone) return;
    wx.makePhoneCall({ phoneNumber: this.data.shopInfo.phone });
  },

  async onToggleFav() {
    if (this.data.favoriteBusy) return;
    this.setData({ favoriteBusy: true });
    try {
      const result = await api.toggleFavorite({
        placeId: this.placeId,
        action: this.data.shopInfo.isFavorite ? 'remove' : 'add'
      });
      if (this.destroyed) return;
      this.setData({ 'shopInfo.isFavorite': result.isFavorite });
      wx.showToast({ title: result.isFavorite ? '已收藏' : '已取消收藏', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' });
    } finally {
      if (!this.destroyed) this.setData({ favoriteBusy: false });
    }
  },

  onNavigate() {
    const item = this.data.shopInfo;
    if (typeof item.lat !== 'number' || typeof item.lng !== 'number') return;
    wx.openLocation({ latitude: item.lat, longitude: item.lng, name: item.name, address: item.address || '', scale: 16 });
  },

  onGoDianping() {
    const item = this.data.shopInfo;
    const target = item.dianpingFallbackUrl || item.dianpingUrl;
    if (!target) {
      wx.showToast({ title: '暂无法打开点评页面', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: target,
      success: () => wx.showToast({ title: '点评地址已复制，请在浏览器打开', icon: 'none' }),
      fail: () => wx.showToast({ title: '暂无法打开点评页面', icon: 'none' })
    });
  }
});

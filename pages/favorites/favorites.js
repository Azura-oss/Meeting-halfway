const api = require('../../utils/api');

Page({
  data: { favoriteList: [], total: 0, loading: false, errorMessage: '', removingId: '' },
  onShow() { this.destroyed = false; this.loadFavorites(); },
  onUnload() { this.destroyed = true; },

  async loadFavorites() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const data = await api.getFavorites({ page: 1, pageSize: 50 });
      if (!this.destroyed) this.setData({ loading: false, favoriteList: data.items || [], total: data.total || 0 });
    } catch (err) {
      if (!this.destroyed) this.setData({ loading: false, errorMessage: err.message || '收藏加载失败' });
    }
  },

  onTapItem(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    // 收藏页没有本次搜索上下文，显式清空，避免复用上一次结果页遗留的 detailContext。
    getApp().globalData.detailContext = { placeId: id, departures: [], midpoint: null };
    wx.navigateTo({ url: '/pages/shop-detail/shop-detail?id=' + encodeURIComponent(id) });
  },

  onRemoveItem(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || this.data.removingId) return;
    wx.showModal({
      title: '确认取消收藏？',
      content: '取消后该店铺会从收藏列表移除',
      success: async res => {
        if (!res.confirm) return;
        this.setData({ removingId: id });
        try {
          await api.toggleFavorite({ placeId: id, action: 'remove' });
          if (!this.destroyed) await this.loadFavorites();
        } catch (err) {
          wx.showToast({ title: err.message, icon: 'none' });
        } finally {
          if (!this.destroyed) this.setData({ removingId: '' });
        }
      }
    });
  },
  onGoIndex() { wx.switchTab({ url: '/pages/index/index' }); }
});

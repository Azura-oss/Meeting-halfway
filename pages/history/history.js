const api = require('../../utils/api');
const TRANSPORT_LABELS = { walking: '步行', driving: '开车', subway: '地铁', bus: '公交' };

Page({
  data: { historyList: [], total: 0, loading: false, errorMessage: '', clearing: false },
  onShow() { this.destroyed = false; this.loadHistory(); },
  onUnload() { this.destroyed = true; },

  async loadHistory() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const data = await api.getHistory({ page: 1, pageSize: 20 });
      if (this.destroyed) return;
      this.setData({ loading: false, total: data.total || 0, historyList: (data.items || []).map(item => this.decorate(item)) });
    } catch (err) {
      if (!this.destroyed) this.setData({ loading: false, errorMessage: err.message || '历史记录加载失败' });
    }
  },

  decorate(item) {
    return Object.assign({}, item, {
      departureText: (item.departureNames || []).join(' → '),
      preferenceText: (item.preferences || []).length ? item.preferences.join('、') : '不限',
      transportText: (item.transportModes || []).map(value => TRANSPORT_LABELS[value] || value).join('、'),
      midpointName: item.midpoint && item.midpoint.name ? item.midpoint.name : '待重新计算'
    });
  },

  onTapHistory(e) {
    const record = this.data.historyList.find(item => item.id === e.currentTarget.dataset.id);
    if (!record) return;
    if (!Array.isArray(record.departures) || !record.departures.length) {
      wx.showModal({ title: '数据已变化', content: '这条记录缺少有效地点，请重新搜索', showCancel: false });
      return;
    }
    getApp().globalData.pendingSearchContext = {
      departures: record.departures,
      preferences: record.preferences || [],
      strategy: record.strategy || null,
      midpointMode: record.midpointMode || 'auto',
      fromHistory: true,
      searchedAt: record.searchedAt,
      midpoint: record.midpoint,
      searchRadiusMeters: record.searchRadiusMeters,
      distanceExpanded: record.distanceExpanded,
      resultSnapshot: record.resultSnapshot,
      pinnedIds: record.pinnedIds || [],
      favoritedIds: record.favoritedIds || []
    };
    wx.navigateTo({ url: '/pages/result/result' });
  },

  onClearHistory() {
    if (this.data.clearing) return;
    if (!this.data.historyList.length) {
      wx.showToast({ title: '暂无可清空的历史', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认清空全部历史记录？',
      content: '清空后无法恢复，收藏不会受到影响',
      confirmText: '清空',
      success: async res => {
        if (!res.confirm) return;
        this.setData({ clearing: true });
        try {
          const result = await api.clearHistory({ confirm: true });
          if (this.destroyed) return;
          this.setData({ historyList: [], total: 0 });
          wx.showToast({ title: result.deletedCount ? '历史记录已清空' : '暂无可清空的历史', icon: 'none' });
        } catch (err) {
          wx.showToast({ title: err.message, icon: 'none' });
        } finally {
          if (!this.destroyed) this.setData({ clearing: false });
        }
      }
    });
  },
  onGoIndex() { wx.switchTab({ url: '/pages/index/index' }); }
});

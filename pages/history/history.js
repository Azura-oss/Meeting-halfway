// 本地缓存 key（模拟数据库）
const HISTORY_KEY = 'myHistory';

Page({
  data: {
    historyList: []
  },

  // 每次显示都从本地缓存读取，保证刚搜索的记录能立刻出现
  onShow() {
    this.setData({
      historyList: this.readHistory().map(item => this.decorate(item))
    });
  },

  readHistory() {
    try {
      const list = wx.getStorageSync(HISTORY_KEY);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  },

  // 列表展示所需的文案，统一由数据拼装（WXML 中不写死）
  decorate(item) {
    const preferences = item.preferences || [];

    return Object.assign({}, item, {
      departureText: (item.departureNames || []).join(' → '),
      preferenceText: preferences.length > 0 ? preferences.join('、') : '不限',
      favoriteCount: item.favoriteCount || (item.favoritedIds || []).length
    });
  },

  // 点击历史记录：回到当时的结果页，并带上置顶 / 收藏状态
  onTapHistory(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.historyList.filter(item => item.id === id)[0];

    if (!record) {
      return;
    }

    const pinnedIds = encodeURIComponent(JSON.stringify(record.pinnedIds || []));
    const favoritedIds = encodeURIComponent(JSON.stringify(record.favoritedIds || []));

    wx.navigateTo({
      url: '/pages/result/result?from=history'
        + '&pinnedIds=' + pinnedIds
        + '&favoritedIds=' + favoritedIds,
      fail: () => {
        wx.showToast({
          title: '结果页跳转失败',
          icon: 'none'
        });
      }
    });
  },

  // 清空全部历史记录（二次确认 + 清除本地缓存）
  onClearHistory() {
    if (this.data.historyList.length === 0) {
      return;
    }

    wx.showModal({
      title: '确认清空全部历史记录？',
      content: '清空后无法恢复，确定要清空吗？',
      confirmText: '清空',
      success: res => {
        if (!res.confirm) {
          return;
        }

        wx.removeStorageSync(HISTORY_KEY);

        this.setData({ historyList: [] });

        wx.showToast({
          title: '已清空',
          icon: 'none'
        });
      }
    });
  },

  // 空态引导：回到首页
  onGoIndex() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  }
});

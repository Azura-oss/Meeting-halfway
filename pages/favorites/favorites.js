// 本地缓存 key（模拟数据库）
const FAVORITES_KEY = 'myFavorites';

Page({
  data: {
    favoriteList: []
  },

  // 每次显示都从本地缓存读取，保证刚收藏的店铺能立刻出现
  onShow() {
    this.setData({
      favoriteList: this.readFavorites()
    });
  },

  readFavorites() {
    try {
      const list = wx.getStorageSync(FAVORITES_KEY);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  },

  // 点击店铺进入详情页
  onTapItem(e) {
    const dataset = e.currentTarget.dataset;

    if (!dataset.id) {
      return;
    }

    wx.navigateTo({
      url: '/pages/shop-detail/shop-detail?id=' + dataset.id
        + '&name=' + encodeURIComponent(dataset.name || ''),
      fail: () => {
        wx.showToast({
          title: '详情页跳转失败',
          icon: 'none'
        });
      }
    });
  },

  // 取消收藏：同步更新本地缓存
  onRemoveItem(e) {
    const id = e.currentTarget.dataset.id;

    wx.showModal({
      title: '确认取消收藏？',
      content: '取消后该店铺会从收藏列表移除',
      success: res => {
        if (!res.confirm) {
          return;
        }

        const favoriteList = this.readFavorites().filter(item => item.id !== id);

        wx.setStorageSync(FAVORITES_KEY, favoriteList);

        this.setData({ favoriteList });

        wx.showToast({
          title: '已取消收藏',
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

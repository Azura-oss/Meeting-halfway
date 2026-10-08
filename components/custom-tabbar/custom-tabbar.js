// 自定义底部导航栏：首页 / 收藏 / 历史
// 说明：
// 1. app.json 中的原生 tabBar 已删除，导航完全由本组件承担；
// 2. 统一使用 wx.navigateTo（严禁 switchTab / reLaunch），保留页面栈，结果页数据不丢失；
// 3. 页面栈中存在结果页时，点「首页」优先 navigateBack 回到结果页；
// 4. 200ms 节流锁，防止狂点堆叠页面栈。
const TAB_LIST = [
  { key: 'index', text: '首页', path: '/pages/index/index' },
  { key: 'favorites', text: '收藏', path: '/pages/favorites/favorites' },
  { key: 'history', text: '历史', path: '/pages/history/history' }
];

const RESULT_ROUTE = 'pages/result/result';
const TAP_INTERVAL = 200;

Component({
  properties: {
    // 当前高亮项：支持文字（首页 / 收藏 / 历史）或 key（index / favorites / history）
    current: {
      type: String,
      value: ''
    },
    // 兼容旧用法：active="index|favorites|history|none"
    active: {
      type: String,
      value: ''
    },
    // 兼容旧属性（原生 tabBar 已移除，仅保留声明，不再执行隐藏逻辑）
    isTabPage: {
      type: Boolean,
      value: true
    }
  },

  data: {
    list: TAB_LIST,
    activeKey: ''
  },

  observers: {
    'current, active': function () {
      this.setData({
        activeKey: this.resolveActiveKey()
      });
    }
  },

  lifetimes: {
    attached() {
      this.locked = false;
      this.setData({
        activeKey: this.resolveActiveKey()
      });
    }
  },

  methods: {
    // 计算当前应高亮的 tab
    resolveActiveKey() {
      const current = this.data.current || '';
      const active = this.data.active || '';

      const byText = TAB_LIST.filter(item => item.text === current)[0];

      if (byText) {
        return byText.key;
      }

      if (TAB_LIST.some(item => item.key === current)) {
        return current;
      }

      if (TAB_LIST.some(item => item.key === active)) {
        return active;
      }

      // current="" / active="none" 时不显示高亮（如结果页、偏好页）
      return '';
    },

    onTap(e) {
      const key = e.currentTarget.dataset.key;

      if (!key || key === this.data.activeKey) {
        return;
      }

      // 200ms 节流锁：防止狂点造成页面栈疯狂堆叠
      if (this.locked) {
        return;
      }

      this.locked = true;
      setTimeout(() => {
        this.locked = false;
      }, TAP_INTERVAL);

      const item = TAB_LIST.filter(target => target.key === key)[0];

      if (!item) {
        return;
      }

      // 点「首页」且页面栈里已有结果页时，先退回结果页，避免搜索结果丢失
      if (key === 'index' && this.backToResultIfNeeded()) {
        return;
      }

      wx.navigateTo({
        url: item.path,
        fail: () => {
          wx.showToast({
            title: '跳转失败，请稍后重试',
            icon: 'none'
          });
        }
      });
    },

    // 页面栈中存在结果页时，navigateBack 回到该结果页
    backToResultIfNeeded() {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];

      if (!pages || pages.length === 0) {
        return false;
      }

      const currentPage = pages[pages.length - 1] || {};

      // 当前已在结果页：无法再“返回结果页”，走正常跳转
      if (currentPage.route === RESULT_ROUTE) {
        return false;
      }

      let targetIndex = -1;

      for (let i = 0; i < pages.length; i++) {
        if (pages[i] && pages[i].route === RESULT_ROUTE) {
          targetIndex = i;
        }
      }

      if (targetIndex === -1) {
        return false;
      }

      const delta = pages.length - 1 - targetIndex;

      if (delta <= 0) {
        return false;
      }

      wx.navigateBack({
        delta,
        fail: () => {
          wx.navigateTo({
            url: '/pages/index/index'
          });
        }
      });

      return true;
    }
  }
});

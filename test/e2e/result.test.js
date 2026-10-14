const {
  api, app, assert, calls, departures, event, loadPage, waitFor
} = require('./helpers');

function searchContext(overrides) {
  return Object.assign({
    departures: JSON.parse(JSON.stringify(departures)),
    preferences: ['咖啡厅'],
    strategy: 'least_transfer',
    midpointMode: 'auto',
    fromHistory: false
  }, overrides || {});
}

async function loadResult(overrides) {
  app.globalData.pendingSearchContext = searchContext(overrides);
  const page = loadPage('pages/result/result.js');
  page.onLoad();
  await waitFor(() => !page.data.loading, '推荐页加载超时');
  return page;
}

module.exports = {
  name: '结果与路线页',
  cases: [
    {
      name: '混合交通隐藏策略且后端 strategy 为 null',
      async run() {
        const mixed = JSON.parse(JSON.stringify(departures));
        mixed[1].transportMode = 'bus';
        const page = await loadResult({ departures: mixed, strategy: 'least_transfer' });
        assert.strictEqual(page.data.showStrategy, false);
        assert.strictEqual(page.data.strategy, null);
        assert(page.data.places.length > 0);
        page.onUnload();
      }
    },
    {
      name: '路线超时保留推荐列表，复位后可重试',
      async run() {
        const page = await loadResult();
        const idsBefore = page.data.places.map(item => item.id);
        api.setMockScenario('getRoutes:timeout');
        await page.onSelectPlace(event({ id: 'p1' }));
        assert(page.data.routeError.includes('超时'));
        assert.deepStrictEqual(page.data.places.map(item => item.id), idsBefore);
        assert.strictEqual(page.data.selectedPlaceId, 'p1');
        api.resetMock();
        await page.onSelectPlace(event({ id: 'p1' }));
        assert.strictEqual(page.data.routeError, '');
        assert.strictEqual(page.data.polylines.length, 2);
        page.onUnload();
      }
    },
    {
      name: '全员地铁时路线请求携带当前策略，混合交通不携带策略',
      async run() {
        const originalGetRoutes = api.getRoutes;
        const requests = [];
        api.getRoutes = params => {
          requests.push(params);
          return originalGetRoutes(params);
        };
        try {
          const subwayPage = await loadResult();
          await subwayPage.onSelectPlace(event({ id: 'p1' }));
          assert.strictEqual(requests[0].strategy, 'least_transfer');
          subwayPage.onSwitchStrategy(event({ key: 'least_stops' }));
          await waitFor(() => !subwayPage.data.loading, '策略切换推荐超时');
          await subwayPage.onSelectPlace(event({ id: 'p1' }));
          assert.strictEqual(requests[1].strategy, 'least_stops');
          subwayPage.onUnload();

          const mixed = JSON.parse(JSON.stringify(departures));
          mixed[1].transportMode = 'bus';
          const mixedPage = await loadResult({ departures: mixed, strategy: 'least_transfer' });
          await mixedPage.onSelectPlace(event({ id: 'p1' }));
          assert.strictEqual(requests[2].strategy, null);
          mixedPage.onUnload();
        } finally {
          api.getRoutes = originalGetRoutes;
        }
      }
    },
    {
      name: '收藏请求中阻止快速重复点击',
      async run() {
        api.config.mockDelay = 30;
        const page = await loadResult();
        const originalToggle = api.toggleFavorite;
        let toggleRequests = 0;
        api.toggleFavorite = params => { toggleRequests += 1; return originalToggle(params); };
        try {
          await Promise.all([page.onToggleFav(event({ id: 'p1' })), page.onToggleFav(event({ id: 'p1' }))]);
          assert.strictEqual(toggleRequests, 1, '连续收藏只允许一次请求');
          const favoritesPage = loadPage('pages/favorites/favorites.js');
          favoritesPage.onShow();
          await waitFor(() => !favoritesPage.data.loading, '收藏页刷新超时');
          assert.strictEqual(favoritesPage.data.total, 1);
          assert.strictEqual(favoritesPage.data.favoriteList[0].id, 'p1');
          favoritesPage.onUnload();
          assert.strictEqual(page.data.places.find(item => item.id === 'p1').isFavorite, true);
          await Promise.all([page.onToggleFav(event({ id: 'p1' })), page.onToggleFav(event({ id: 'p1' }))]);
          assert.strictEqual(toggleRequests, 2, '连续取消只允许一次请求');
          assert.strictEqual((await api.getFavorites({ page: 1, pageSize: 50 })).total, 0);
          assert.strictEqual(page.data.places.find(item => item.id === 'p1').isFavorite, false);
          assert.strictEqual(page.data.favoriteBusyId, '');
        } finally {
          api.toggleFavorite = originalToggle;
          page.onUnload();
        }
      }
    },
    {
      name: '详情页收藏后返回结果页立即同步收藏状态',
      async run() {
        const page = await loadResult();
        page.goToDetail(event({ id: 'p1' }));
        const detail = loadPage('pages/shop-detail/shop-detail.js');
        detail.onLoad({ id: 'p1' });
        await waitFor(() => !detail.data.loading, '详情页加载超时');

        await detail.onToggleFav();
        detail.onUnload();
        page.onShow();

        assert.strictEqual(page.data.places.find(item => item.id === 'p1').isFavorite, true);
        assert(page.data.favoritedIds.includes('p1'));
        page.onUnload();
      }
    },
    {
      name: '推荐失败保留搜索条件并可重试',
      async run() {
        api.setMockScenario('getRecommendations:error');
        app.globalData.pendingSearchContext = searchContext();
        const page = loadPage('pages/result/result.js');
        page.onLoad();
        await waitFor(() => !page.data.loading, '推荐错误状态超时');
        assert(page.data.errorMessage);
        assert.deepStrictEqual(page.data.departures, departures);
        assert.deepStrictEqual(page.data.preferences, ['咖啡厅']);
        api.resetMock();
        await page.loadRecommendations(false);
        assert.strictEqual(page.data.errorMessage, '');
        assert(page.data.places.length > 0);
        page.onUnload();
      }
    },
    {
      name: '统一 request:error 场景下推荐收藏历史均失败，复位后原条件可恢复',
      async run() {
        const seeded = await api.getRecommendations(searchContext());
        await api.toggleFavorite({ placeId: 'p1', action: 'add' });
        await api.saveHistory(Object.assign(searchContext(), {
          searchedAt: new Date().toISOString(), midpoint: seeded.midpoint,
          resultSnapshot: { placeIds: seeded.places.map(item => item.id), places: seeded.places }
        }));
        api.setMockScenario('request:error');
        const result = await loadResult();
        const favorites = loadPage('pages/favorites/favorites.js');
        const history = loadPage('pages/history/history.js');
        favorites.onShow();
        history.onShow();
        await waitFor(() => !favorites.data.loading && !history.data.loading, '统一错误场景未结束');
        for (const page of [result, favorites, history]) assert(page.data.errorMessage.includes('网络开小差'));
        assert.deepStrictEqual(result.data.departures, departures);
        assert.deepStrictEqual(result.data.preferences, ['咖啡厅']);
        api.resetMock();
        result.retryRecommendations();
        await Promise.all([favorites.loadFavorites(), history.loadHistory()]);
        await waitFor(() => !result.data.loading, '推荐重试未结束');
        for (const page of [result, favorites, history]) assert.strictEqual(page.data.errorMessage, '');
        assert(result.data.places.length > 0);
        assert.strictEqual(favorites.data.favoriteList.filter(item => item.id === 'p1').length, 1);
        assert(history.data.historyList.length > 0);
        assert.deepStrictEqual(result.data.departures, departures);
        [result, favorites, history].forEach(page => page.onUnload());
      }
    },
    {
      name: '排序始终为置顶、收藏、后端原顺序',
      async run() {
        const page = await loadResult();
        page.onTogglePin(event({ id: 'p3' }));
        await page.onToggleFav(event({ id: 'p2' }));
        assert.deepStrictEqual(page.data.places.map(item => item.id), ['p3', 'p2', 'p1', 'p4']);
        page.onUnload();
      }
    },
    {
      name: '无效搜索上下文显示可恢复错误而不白屏',
      async run() {
        app.globalData.pendingSearchContext = null;
        const page = loadPage('pages/result/result.js');
        page.onLoad();
        assert.strictEqual(page.data.loading, false);
        assert(page.data.errorMessage.includes('失效'));
        assert.deepStrictEqual(calls.navigateTo, []);
        page.onUnload();
      }
    }
  ]
};

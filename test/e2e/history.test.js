const {
  api, app, assert, calls, departures, event, loadPage,
  setModalConfirm, waitFor
} = require('./helpers');

async function recommendation() {
  return api.getRecommendations({
    departures,
    preferences: ['咖啡厅'],
    strategy: 'least_transfer',
    midpointMode: 'auto'
  });
}

async function saveRecord(overrides) {
  const result = await recommendation();
  const payload = Object.assign({
    departures,
    preferences: ['咖啡厅'],
    strategy: 'least_transfer',
    midpointMode: 'auto',
    searchedAt: '2026-10-10T10:00:00+08:00',
    midpoint: result.midpoint,
    searchRadiusMeters: result.searchRadiusMeters,
    distanceExpanded: result.distanceExpanded,
    resultSnapshot: { placeIds: result.places.map(item => item.id), places: result.places },
    pinnedIds: ['p3'],
    favoritedIds: ['p2']
  }, overrides || {});
  return api.saveHistory(payload);
}

async function loadHistoryPage() {
  const page = loadPage('pages/history/history.js');
  page.onShow();
  await waitFor(() => !page.data.loading, '历史页加载超时');
  return page;
}

module.exports = {
  name: '历史页与快照恢复',
  cases: [
    {
      name: '历史展示完整摘要并传递快照上下文',
      async run() {
        await saveRecord();
        const page = await loadHistoryPage();
        assert.strictEqual(page.data.total, 1);
        const record = page.data.historyList[0];
        assert(record.departureText.includes('双流机场'));
        assert(record.transportText.includes('地铁'));
        assert.strictEqual(record.preferenceText, '咖啡厅');
        assert(record.midpointName);
        page.onTapHistory(event({ id: record.id }));
        assert.strictEqual(app.globalData.pendingSearchContext.fromHistory, true);
        assert.deepStrictEqual(app.globalData.pendingSearchContext.pinnedIds, ['p3']);
        assert.deepStrictEqual(app.globalData.pendingSearchContext.favoritedIds, ['p2']);
        assert.deepStrictEqual(calls.navigateTo, ['/pages/result/result']);
        page.onUnload();
      }
    },
    {
      name: '非空快照直接恢复并按置顶、收藏、原顺序排列',
      async run() {
        await saveRecord();
        const historyPage = await loadHistoryPage();
        historyPage.onTapHistory(event({ id: historyPage.data.historyList[0].id }));
        historyPage.onUnload();
        // 非空快照不应依赖重新推荐；即使推荐接口失败也能恢复。
        api.setMockScenario('getRecommendations:error');
        const resultPage = loadPage('pages/result/result.js');
        resultPage.onLoad();
        assert.strictEqual(resultPage.data.loading, false);
        assert.deepStrictEqual(resultPage.data.places.map(item => item.id), ['p3', 'p2', 'p1', 'p4']);
        assert.strictEqual(resultPage.data.places[0].isPinned, true);
        assert.strictEqual(resultPage.data.places[1].isFavorite, true);
        assert.deepStrictEqual(resultPage.data.departures, departures);
        assert.deepStrictEqual(resultPage.data.preferences, ['咖啡厅']);
        assert.strictEqual(resultPage.data.strategy, 'least_transfer');
        resultPage.onUnload();
      }
    },
    {
      name: '空快照使用原条件重新推荐',
      async run() {
        await saveRecord({ resultSnapshot: { placeIds: [], places: [] }, pinnedIds: [], favoritedIds: [] });
        const historyPage = await loadHistoryPage();
        historyPage.onTapHistory(event({ id: historyPage.data.historyList[0].id }));
        historyPage.onUnload();

        const originalRecommend = api.getRecommendations;
        const requests = [];
        api.getRecommendations = params => { requests.push(JSON.parse(JSON.stringify(params))); return originalRecommend(params); };
        const resultPage = loadPage('pages/result/result.js');
        try {
          resultPage.onLoad();
          await waitFor(() => !resultPage.data.loading, '历史重算超时');
          assert.strictEqual(resultPage.data.errorMessage, '');
          assert(resultPage.data.places.length > 0);
          assert.deepStrictEqual(resultPage.data.departures, departures);
          assert.deepStrictEqual(requests, [{ departures, preferences: ['咖啡厅'], strategy: 'least_transfer', midpointMode: 'auto' }]);
        } finally {
          api.getRecommendations = originalRecommend;
          resultPage.onUnload();
        }
      }
    },
    {
      name: '失效历史地点给出“数据已变化”提示',
      async run() {
        await saveRecord();
        const page = await loadHistoryPage();
        const invalid = Object.assign({}, page.data.historyList[0], { id: 'invalid', departures: [] });
        page.setData({ historyList: [invalid] });
        page.onTapHistory(event({ id: 'invalid' }));
        assert(calls.modals.some(item => item.title === '数据已变化'));
        assert.strictEqual(calls.navigateTo.length, 0);
        page.onUnload();
      }
    },
    {
      name: '清空取消不调用接口，确认后不影响收藏',
      async run() {
        await api.toggleFavorite({ placeId: 'p1', action: 'add' });
        await saveRecord();
        const page = await loadHistoryPage();

        setModalConfirm(false);
        page.onClearHistory();
        assert.strictEqual((await api.getHistory({ page: 1, pageSize: 20 })).total, 1);

        setModalConfirm(true);
        page.onClearHistory();
        await waitFor(() => !page.data.clearing, '清空历史超时');
        assert.strictEqual(page.data.total, 0);
        assert.strictEqual((await api.getHistory({ page: 1, pageSize: 20 })).total, 0);
        assert.strictEqual((await api.getFavorites({ page: 1, pageSize: 50 })).total, 1);
        assert(calls.toasts.some(item => item.title === '历史记录已清空'));
        page.onClearHistory();
        assert(calls.toasts.some(item => item.title === '暂无可清空的历史'));
        page.onUnload();
      }
    },
    {
      name: '历史列表失败后可重试',
      async run() {
        api.setMockScenario('getHistory:error');
        const page = await loadHistoryPage();
        assert(page.data.errorMessage);
        api.resetMock();
        await saveRecord();
        await page.loadHistory();
        assert.strictEqual(page.data.errorMessage, '');
        assert.strictEqual(page.data.total, 1);
        page.onUnload();
      }
    }
  ]
};

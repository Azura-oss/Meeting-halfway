const {
  api, assert, calls, event, loadPage, setModalConfirm, waitFor
} = require('./helpers');

async function loadFavoritesPage() {
  const page = loadPage('pages/favorites/favorites.js');
  page.onShow();
  await waitFor(() => !page.data.loading, '收藏页加载超时');
  return page;
}

module.exports = {
  name: '收藏页',
  cases: [
    {
      name: '列表从 API 加载并可进入详情',
      async run() {
        await api.toggleFavorite({ placeId: 'p1', action: 'add' });
        const page = await loadFavoritesPage();
        assert.strictEqual(page.data.total, 1);
        assert.strictEqual(page.data.favoriteList[0].id, 'p1');
        page.onTapItem(event({ id: 'p1' }));
        assert.deepStrictEqual(calls.navigateTo, ['/pages/shop-detail/shop-detail?id=p1']);
        page.onUnload();
      }
    },
    {
      name: '取消确认时移除并刷新，取消弹窗时保留',
      async run() {
        await api.toggleFavorite({ placeId: 'p1', action: 'add' });
        const page = await loadFavoritesPage();
        setModalConfirm(false);
        page.onRemoveItem(event({ id: 'p1' }));
        assert.strictEqual((await api.getFavorites({ page: 1, pageSize: 50 })).total, 1);
        assert.strictEqual(page.data.favoriteList.length, 1);

        setModalConfirm(true);
        page.onRemoveItem(event({ id: 'p1' }));
        await waitFor(() => !page.data.removingId && !page.data.loading, '取消收藏超时');
        assert.strictEqual(page.data.total, 0);
        assert.deepStrictEqual(page.data.favoriteList, []);
        page.onUnload();
      }
    },
    {
      name: '列表请求失败后可重试且不伪造数据',
      async run() {
        api.setMockScenario('getFavorites:error');
        const page = await loadFavoritesPage();
        assert(page.data.errorMessage);
        assert.deepStrictEqual(page.data.favoriteList, []);
        api.resetMock();
        await api.toggleFavorite({ placeId: 'p2', action: 'add' });
        await page.loadFavorites();
        assert.strictEqual(page.data.errorMessage, '');
        assert.strictEqual(page.data.favoriteList[0].id, 'p2');
        page.onUnload();
      }
    },
    {
      name: '空收藏显示空数据并可返回首页',
      async run() {
        const page = await loadFavoritesPage();
        assert.strictEqual(page.data.total, 0);
        assert.deepStrictEqual(page.data.favoriteList, []);
        page.onGoIndex();
        assert.deepStrictEqual(calls.switchTab, ['/pages/index/index']);
        page.onUnload();
      }
    }
  ]
};

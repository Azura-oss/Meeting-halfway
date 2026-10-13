const {
  api, app, assert, calls, departures, loadPage, waitFor
} = require('./helpers');

async function seedRecommendation() {
  return api.getRecommendations({
    departures,
    preferences: ['咖啡厅'],
    strategy: 'least_transfer',
    midpointMode: 'auto'
  });
}

async function loadDetail(id) {
  const page = loadPage('pages/shop-detail/shop-detail.js');
  page.onLoad({ id: typeof id === 'undefined' ? 'p1' : id });
  await waitFor(() => !page.data.loading, '详情页加载超时');
  return page;
}

module.exports = {
  name: '地点详情页',
  cases: [
    {
      name: '详情字段、参与人指标与空值正常映射',
      async run() {
        await seedRecommendation();
        const page = await loadDetail('p3');
        assert.strictEqual(page.data.shopInfo.name, '成都远洋太古里');
        assert.strictEqual(page.data.shopInfo.phone, null);
        assert(Array.isArray(page.data.shopInfo.photos));
        assert.strictEqual(page.data.shopInfo.participantMetrics.length, 2);
        assert.strictEqual(typeof page.data.selfDistanceMeters, 'number');
        assert.strictEqual(page.data.errorMessage, '');
        page.onUnload();
      }
    },
    {
      name: '复制地址、拨号、导航和点评地址兜底可用',
      async run() {
        await seedRecommendation();
        const page = await loadDetail('p1');
        page.onCopyAddress();
        page.onCallPhone();
        page.onNavigate();
        page.onGoDianping();
        assert.strictEqual(calls.clipboard[0], page.data.shopInfo.address);
        assert.strictEqual(calls.phone[0], page.data.shopInfo.phone);
        assert.strictEqual(calls.locations[0].name, page.data.shopInfo.name);
        assert.strictEqual(calls.clipboard[1], page.data.shopInfo.dianpingFallbackUrl);
        assert(calls.toasts.some(item => item.title.includes('点评地址已复制')));

        page.setData({ 'shopInfo.dianpingFallbackUrl': null, 'shopInfo.dianpingUrl': null });
        page.onGoDianping();
        assert(calls.toasts.some(item => item.title === '暂无法打开点评页面'));
        page.onUnload();
      }
    },
    {
      name: '点评剪贴板写入失败给出不可打开提示且不伪报成功',
      async run() {
        await seedRecommendation();
        const page = await loadDetail('p1');
        const originalClipboard = wx.setClipboardData;
        try {
          wx.setClipboardData = options => options.fail({ errMsg: 'setClipboardData:fail' });
          page.onGoDianping();
          assert(calls.toasts.some(item => item.title === '暂无法打开点评页面'));
          assert(!calls.toasts.some(item => item.title.includes('点评地址已复制')));
        } finally {
          wx.setClipboardData = originalClipboard;
          page.onUnload();
        }
      }
    },
    {
      name: '详情页收藏防重复并以接口最终状态为准',
      async run() {
        api.config.mockDelay = 30;
        await seedRecommendation();
        const page = await loadDetail('p1');
        const first = page.onToggleFav();
        const second = page.onToggleFav();
        await Promise.all([first, second]);
        assert.strictEqual(page.data.shopInfo.isFavorite, true);
        assert.strictEqual(page.data.favoriteBusy, false);
        assert.strictEqual((await api.getFavorites({ page: 1, pageSize: 50 })).total, 1);
        page.onUnload();
      }
    },
    {
      name: '详情请求失败后可重试',
      async run() {
        api.setMockScenario('getPlaceDetail:error');
        const page = await loadDetail('p1');
        assert(page.data.errorMessage);
        api.resetMock();
        await page.loadDetail();
        assert.strictEqual(page.data.errorMessage, '');
        assert.strictEqual(page.data.shopInfo.id, 'p1');
        page.onUnload();
      }
    },
    {
      name: '无效 placeId 显示可恢复错误而不白屏',
      async run() {
        const missing = await loadDetail('invalid');
        assert(missing.data.errorMessage.includes('不存在'));
        missing.onUnload();

        const absent = await loadDetail('');
        assert(absent.data.errorMessage.includes('失效'));
        absent.onUnload();
      }
    },
    {
      name: '详情按 placeId 匹配透传搜索上下文，缺失或过期时只传 placeId',
      async run() {
        // 1) 无上下文：只传 placeId（真实模式返回空指标，不猜数据）
        const noContext = await loadDetail('p1');
        assert.deepStrictEqual(Object.keys(noContext.buildDetailParams()), ['placeId']);
        noContext.onUnload();

        // 2) 上下文匹配：透传 departures + midpoint
        app.globalData.detailContext = { placeId: 'p1', departures, midpoint: { lat: 30.6578, lng: 104.081 } };
        const matched = await loadDetail('p1');
        const matchedParams = matched.buildDetailParams();
        assert.strictEqual(matchedParams.departures.length, 2);
        assert.strictEqual(matchedParams.midpoint.lng, 104.081);
        matched.onUnload();

        // 3) 上下文过期（来自另一地点）：不得串用
        const stale = await loadDetail('p3');
        assert.strictEqual(stale.buildDetailParams().departures, undefined);
        assert.strictEqual(stale.buildDetailParams().midpoint, undefined);
        stale.onUnload();
      }
    }
  ]
};

const {
  api, app, assert, calls, event, loadPage, recorder,
  setAuthorizeAllowed, setModalConfirm, waitFor
} = require('./helpers');

function visibleSuggestionIndices(page) {
  const fs = require('fs');
  const path = require('path');
  const template = fs.readFileSync(path.join(__dirname, '../../pages/index/index.wxml'), 'utf8');
  const condition = template.match(/class="poi-suggestions e2e-poi-suggestions"[^>]*wx:if="\{\{([^]*?)\}\}"/)[1];
  return page.data.departureList.flatMap((item, index) =>
    Function('item', 'index', 'activeDepartureIndex', 'return (' + condition + ')')(
      item, index, page.data.activeDepartureIndex
    ) ? [index] : []);
}

async function withAmbiguousVoice(run) {
  const originals = { parseIntent: api.parseIntent, searchPOI: api.searchPOI };
  const origins = ['西南民族大学', '武侯祠', '人民公园'];
  api.parseIntent = async () => ({
    partySize: 3, origins, transportModes: ['subway'],
    placePreferences: ['咖啡厅'], missingFields: [], confidence: 0.95
  });
  api.searchPOI = async ({ keyword }) => [1, 2, 3, 4, 5].map(i => ({
    id: keyword + '-' + i, title: keyword + '（入口' + i + '）',
    address: '成都市测试地址', lat: 30.6, lng: 104.0
  }));
  const page = loadPage('pages/index/index.js');
  page.onLoad();
  try { await run(page, origins); }
  finally { page.onUnload(); Object.assign(api, originals); }
}

module.exports = {
  name: '首页与偏好页',
  cases: [
    {
      name: '语音多地点歧义只展开一人，选完按顺序确认且保留其余候选',
      async run() {
        await withAmbiguousVoice(async page => {
          await page.applyIntent('三个人从三个有歧义的地点出发');
          assert.deepStrictEqual(visibleSuggestionIndices(page), [0]);
          assert.strictEqual(page.data.canNext, false);
          page.onSelectPOI(event({ index: 0, poiIndex: 1 }));
          assert.deepStrictEqual(visibleSuggestionIndices(page), [1]);
          assert.strictEqual(page.data.departureList[0].poi.id, '西南民族大学-2');
          assert.strictEqual(page.data.departureList[2].suggestions.length, 5);
          page.onSelectPOI(event({ index: 1, poiIndex: 0 }));
          assert.deepStrictEqual(visibleSuggestionIndices(page), [2]);
          page.onSelectPOI(event({ index: 2, poiIndex: 2 }));
          assert.deepStrictEqual(visibleSuggestionIndices(page), []);
          assert.strictEqual(page.data.canNext, true);
          assert.strictEqual(page.data.voiceComplete, true);
          page.onNext();
          assert.deepStrictEqual(app.globalData.pendingDraft.participants.map(p => p.poiId),
            ['西南民族大学-2', '武侯祠-1', '人民公园-3']);
        });
      }
    },
    {
      name: '语音地点可点选其他人切换，自动确认跳过已唯一匹配者',
      async run() {
        await withAmbiguousVoice(async (page, origins) => {
          const search = api.searchPOI;
          api.searchPOI = async params => params.keyword === origins[1]
            ? [{ id: 'exact', title: origins[1], lat: 30.6, lng: 104.0 }]
            : search(params);
          await page.applyIntent('跳过唯一匹配');
          assert(page.data.departureList[1].poi);
          assert.deepStrictEqual(visibleSuggestionIndices(page), [0]);
          page.onDepartureFocus(event({ index: 2 }));
          assert.deepStrictEqual(visibleSuggestionIndices(page), [2]);
          page.onDepartureFocus(event({ index: 0 }));
          page.onSelectPOI(event({ index: 0, poiIndex: 0 }));
          assert.deepStrictEqual(visibleSuggestionIndices(page), [2]);
        });
      }
    },
    {
      name: '语音无结果或失败不猜地点，修改后可重搜并继续下一人',
      async run() {
        await withAmbiguousVoice(async (page, origins) => {
          const search = api.searchPOI;
          api.searchPOI = async params => {
            if (params.keyword === origins[0]) return [];
            if (params.keyword === origins[1]) throw new Error('搜索失败，请重试');
            return search(params);
          };
          await page.applyIntent('含无结果和搜索失败');
          assert.strictEqual(page.data.canNext, false);
          assert.strictEqual(page.data.departureList[0].poi, null);
          assert(page.data.departureList[0].searchMessage.includes('没有找到'));
          assert(page.data.departureList[1].searchMessage.includes('搜索失败'));
          assert.deepStrictEqual(visibleSuggestionIndices(page), []);
          page.onDepartureInput(event({ index: 0 }, '新地点'));
          await waitFor(() => page.data.departureList[0].suggestions.length, '修改后重搜未完成');
          assert.deepStrictEqual(visibleSuggestionIndices(page), [0]);
          page.onSelectPOI(event({ index: 0, poiIndex: 0 }));
          assert.strictEqual(page.data.activeDepartureIndex, 1);
          assert.strictEqual(page.data.canNext, false);
        });
      }
    },
    {
      name: '晚到的搜索不抢当前确认对象，清空后不恢复旧候选',
      async run() {
        await withAmbiguousVoice(async page => {
          await page.applyIntent('三个地点');
          let resolveSearch;
          api.searchPOI = () => new Promise(resolve => { resolveSearch = resolve; });
          page.onDepartureInput(event({ index: 0 }, '重新搜索'));
          const pending = page.loadSuggestions(0, '重新搜索');
          page.onDepartureFocus(event({ index: 2 }));
          resolveSearch([{ id: 'late', title: '晚到的候选' }]);
          await pending;
          assert.deepStrictEqual(visibleSuggestionIndices(page), [2]);
          const cleared = page.loadSuggestions(0, '重新搜索');
          page.onClearInput(event({ index: 0 }));
          resolveSearch([{ id: 'stale', title: '应丢弃' }]);
          await cleared;
          assert.strictEqual(page.data.departureList[0].value, '');
          assert.deepStrictEqual(page.data.departureList[0].suggestions, []);
          assert.strictEqual(page.data.departureList[0].searching, false);
        });
      }
    },
    {
      name: '删除当前确认者或切换模式后，旧请求不能回填新行',
      async run() {
        await withAmbiguousVoice(async page => {
          await page.applyIntent('三个地点');
          page.onDepartureFocus(event({ index: 1 }));
          let rejectSearch;
          api.searchPOI = () => new Promise((resolve, reject) => { rejectSearch = reject; });
          const pending = page.loadSuggestions(1, '武侯祠');
          page.onDeleteDeparture(event({ index: 1 }));
          rejectSearch(new Error('旧请求失败'));
          await pending;
          assert.strictEqual(page.data.departureList.length, 2);
          assert.strictEqual(page.data.departureList[1].value, '人民公园');
          assert(!page.data.departureList[1].searchMessage.includes('旧请求'));
          assert.strictEqual(visibleSuggestionIndices(page).length, 1);
          let resolveSearch;
          api.searchPOI = () => new Promise(resolve => { resolveSearch = resolve; });
          const resetting = page.loadSuggestions(0, '西南民族大学');
          page.resetAll();
          resolveSearch([{ id: 'old', title: '旧语音地点' }]);
          await resetting;
          assert.deepStrictEqual(visibleSuggestionIndices(page), []);
          assert(page.data.departureList.every(row => !row.searching && !row.searchMessage));
        });
      }
    },
    {
      name: '切换模式与新语音识别后，旧的意图或地点查询不能恢复候选',
      async run() {
        await withAmbiguousVoice(async page => {
          const intent = await api.parseIntent();
          let resolveIntent;
          api.parseIntent = () => new Promise(resolve => { resolveIntent = resolve; });
          const old = page.applyIntent('旧语音');
          page.resetAll();
          resolveIntent(intent);
          await old;
          assert.strictEqual(page.data.hasVoiceData, false);
          assert.deepStrictEqual(visibleSuggestionIndices(page), []);
          assert(page.data.departureList.every(row => row.value === ''));

          api.parseIntent = async ({ text }) => ({ ...intent, origins: [text, '武侯祠', '人民公园'] });
          const search = api.searchPOI;
          let resolveOldPOI;
          api.searchPOI = params => params.keyword === '旧地点'
            ? new Promise(resolve => { resolveOldPOI = resolve; }) : search(params);
          const pending = page.applyIntent('旧地点');
          await waitFor(() => !!resolveOldPOI, '旧地点查询未开始');
          await page.applyIntent('新地点');
          resolveOldPOI([{ id: 'old', title: '旧地点' }]);
          await pending;
          assert.strictEqual(page.data.departureList[0].value, '新地点');
          assert.deepStrictEqual(visibleSuggestionIndices(page), [0]);
        });
      }
    },
    {
      name: '手动多行搜索只展开当前对象，切换后候选仍可选择',
      async run() {
        await withAmbiguousVoice(async page => {
          for (const [index, name] of ['手动地点甲', '手动地点乙'].entries()) {
            page.onDepartureInput(event({ index }, name));
            await page.loadSuggestions(index, name);
          }
          assert.deepStrictEqual(visibleSuggestionIndices(page), [1]);
          page.onDepartureFocus(event({ index: 0 }));
          assert.deepStrictEqual(visibleSuggestionIndices(page), [0]);
          page.onSelectPOI(event({ index: 0, poiIndex: 0 }));
          assert.deepStrictEqual(visibleSuggestionIndices(page), []);
          page.onDepartureFocus(event({ index: 1 }));
          assert.deepStrictEqual(visibleSuggestionIndices(page), [1]);
        });
      }
    },
    {
      name: '删除其他参与人后，保留行的未完成搜索会重新返回候选',
      async run() {
        await withAmbiguousVoice(async page => {
          page.onAddDeparture();
          const pendingSearches = [];
          api.searchPOI = () => new Promise(resolve => { pendingSearches.push(resolve); });
          page.onDepartureInput(event({ index: 0 }, '手动地点'));
          await waitFor(() => pendingSearches.length === 1, '第一人搜索未发出');
          page.onDeleteDeparture(event({ index: 2 }));
          const candidates = [{ id: 'kept', title: '手动地点入口' }];
          pendingSearches.forEach(resolve => resolve(candidates));
          await waitFor(() => page.data.departureList[0].suggestions.length > 0, '删除其他人使第一人的搜索丢失');
          assert.deepStrictEqual(visibleSuggestionIndices(page), [0]);
          page.onSelectPOI(event({ index: 0, poiIndex: 0 }));
          assert.strictEqual(page.data.departureList[0].poi.id, 'kept');
        });
      }
    },
    {
      name: '语音地点批量查询期间清空并删除参与人，晚到结果不得恢复旧表单',
      async run() {
        await withAmbiguousVoice(async (page, origins) => {
          await page.applyIntent('已识别三个地点');
          const pendingSearches = [];
          api.searchPOI = () => new Promise(resolve => { pendingSearches.push(resolve); });
          const parsing = page.applyIntent('重新解析同一段语音');
          await waitFor(() => pendingSearches.length === 3, '批量查询尚未发出');
          page.onClearInput(event({ index: 0 }));
          page.onDeleteDeparture(event({ index: 1 }));
          pendingSearches.forEach((resolve, i) => resolve([{ id: 'old-' + i, title: origins[i] }]));
          await parsing;
          assert.strictEqual(page.data.departureList.length, 2);
          assert.strictEqual(page.data.departureList[0].value, '');
          assert.strictEqual(page.data.departureList[1].value, origins[2]);
          assert.strictEqual(page.data.canNext, false);
        });
      }
    },
    {
      name: '最多 6 人且删除中间参与人后重新连续编号',
      async run() {
        const page = loadPage('pages/index/index.js');
        page.onLoad();
        for (let i = 0; i < 5; i += 1) page.onAddDeparture();
        assert.strictEqual(page.data.departureList.length, 6);
        assert.strictEqual(page.data.canAdd, false);
        page.onDeleteDeparture(event({ index: 2 }));
        assert.strictEqual(page.data.departureList.length, 5);
        assert.deepStrictEqual(page.data.departureList.map(item => item.label), ['我', '2', '3', '4', '5']);
        assert.deepStrictEqual(page.data.departureList.map(item => item.participantId), ['self', 'p1', 'p2', 'p3', 'p4']);
        page.onUnload();
      }
    },
    {
      name: '手动与语音切换取消时保留、确认时清空',
      async run() {
        const page = loadPage('pages/index/index.js');
        page.onLoad();
        page.onDepartureInput(event({ index: 0 }, '天府广场'));
        page.onVoiceTouchStart(event({}, undefined, [{ clientY: 200 }]));
        assert.strictEqual(page.data.showDialog, true);
        page.onDialogCancel();
        assert.strictEqual(page.data.departureList[0].value, '天府广场');
        page.onVoiceTouchStart(event({}, undefined, [{ clientY: 200 }]));
        page.onDialogConfirm();
        assert.strictEqual(page.data.departureList[0].value, '');
        assert(calls.toasts.some(item => item.title === '请按住说话'));

        page.voiceIntent = { missingFields: [], confidence: 0.95 };
        page.setData({ hasVoiceData: true, voiceComplete: true, voiceText: '测试语音' });
        page.onDepartureFocus();
        page.onDialogCancel();
        assert.strictEqual(page.data.voiceText, '测试语音');
        page.onDepartureFocus();
        page.onDialogConfirm();
        assert.strictEqual(page.data.voiceText, '');
        page.onUnload();
      }
    },
    {
      name: '3 人 2 地点语音生成第三个待补参与人',
      async run() {
        const page = loadPage('pages/index/index.js');
        page.onLoad();
        await page.recognizeRecording('/tmp/mock.mp3', 3200);
        assert.strictEqual(page.data.departureList.length, 3);
        assert(page.data.departureList[0].poi);
        assert(page.data.departureList[1].poi);
        assert.strictEqual(page.data.departureList[2].poi, null);
        assert.strictEqual(page.data.canNext, false);
        assert(page.data.voiceMissingTip.includes('出发地'));
        page.onDepartureInput(event({ index: 2 }, '天府广场'));
        await waitFor(() => page.data.departureList[2].suggestions.length > 0, '第三人地点联想未返回');
        page.onSelectPOI(event({ index: 2, poiIndex: 0 }));
        assert.strictEqual(page.data.canNext, true);
        assert.strictEqual(page.data.voiceComplete, true);
        page.onNext();
        assert.strictEqual(app.globalData.pendingDraft.participants.length, 3);
        assert.strictEqual(app.globalData.pendingDraft.participants[2].name, '天府广场');
        page.onUnload();
      }
    },
    {
      name: '缺项语音和低置信度不会自动进入下一步',
      async run() {
        api.setMockScenario('asrRecognize:missing');
        const page = loadPage('pages/index/index.js');
        page.onLoad();
        await page.recognizeRecording('/tmp/mock.mp3', 1200);
        assert.strictEqual(page.data.voiceComplete, false);
        assert.strictEqual(page.data.canNext, false);
        assert(page.data.voiceMissingTip.includes('人数'));
        assert(page.data.voiceMissingTip.includes('出发地'));
        assert(page.data.voiceMissingTip.includes('出行方式'));
        assert(page.data.voiceMissingTip.includes('请确认识别结果'));
        page.onUnload();
      }
    },
    {
      name: '“随便”解析为全部场所偏好',
      async run() {
        const page = loadPage('pages/index/index.js');
        page.onLoad();
        await page.applyIntent('我们俩从双流机场和武侯祠出发，坐地铁，吃什么都行');
        assert(page.voiceIntent.placePreferences.length > 20);
        assert.strictEqual(page.data.canNext, true);
        page.onNext();
        assert(app.globalData.pendingDraft.preferences.length > 20);
        page.onUnload();
      }
    },
    {
      name: 'ASR 超时与无语音恢复为空闲并允许重试',
      async run() {
        const page = loadPage('pages/index/index.js');
        page.onLoad();
        api.setMockScenario('asrRecognize:timeout');
        await page.recognizeRecording('/tmp/mock.mp3', 1000);
        assert.strictEqual(page.data.voiceStatus, 'idle');
        assert(calls.toasts.some(item => item.title.includes('超时')));
        api.setMockScenario('asrRecognize:no-speech');
        await page.recognizeRecording('/tmp/mock.mp3', 1000);
        assert(calls.toasts.some(item => item.title.includes('没有听清')));
        api.resetMock();
        page.onVoiceTouchStart(event({}, undefined, [{ clientY: 200 }]));
        assert.strictEqual(page.data.voiceStatus, 'recording');
        page.onVoiceTouchEnd();
        assert.strictEqual(page.data.voiceStatus, 'recognizing');
        recorder.stopHandler({ tempFilePath: '/tmp/retry.mp3', duration: 2000 });
        await waitFor(() => page.data.voiceStatus === 'result' && page.data.departureList[0].poi, '异常恢复后录音识别未成功');
        assert(page.data.voiceText.includes('双流机场'));
        page.onUnload();
      }
    },
    {
      name: '录音权限拒绝显示设置入口',
      async run() {
        setAuthorizeAllowed(false);
        setModalConfirm(true);
        const page = loadPage('pages/index/index.js');
        page.onLoad();
        page.requestRecordPermission();
        assert(calls.modals.some(item => item.title === '需要录音权限'));
        assert.strictEqual(calls.openSetting, 1);
        assert.strictEqual(recorder.startCalls.length, 0);
        page.onUnload();
      }
    },
    {
      name: '拒绝录音权限并取消设置后仍可手动输入、切换交通、选择偏好并推荐',
      async run() {
        setAuthorizeAllowed(false);
        setModalConfirm(false);
        const page = loadPage('pages/index/index.js');
        page.onLoad();
        page.onVoiceTouchStart(event({}, undefined, [{ clientY: 200 }]));
        assert.strictEqual(page.voicePressActive, false);
        assert.strictEqual(page.data.voiceStatus, 'idle');
        assert.strictEqual(calls.openSetting, 0);
        for (const [index, name] of ['双流机场', '武侯祠'].entries()) {
          page.onDepartureInput(event({ index }, name));
          await waitFor(() => page.data.departureList[index].suggestions.length > 0, '拒绝权限后地点搜索失败');
          page.onSelectPOI(event({ index, poiIndex: 0 }));
        }
        assert.strictEqual(page.data.canNext, true);
        page.onNext();
        assert.deepStrictEqual(calls.navigateTo, ['/pages/preference/preference']);
        const preference = loadPage('pages/preference/preference.js');
        preference.onLoad();
        preference.onSelectTransport(event({ personIndex: 0, transport: 'bus' }));
        assert.strictEqual(preference.data.personList[0].transportMode, 'bus');
        preference.onTogglePlace(event({ place: '咖啡厅' }));
        preference.onStartRecommend();
        assert.strictEqual(preference.data.submitting, false);
        assert.strictEqual(calls.navigateTo[calls.navigateTo.length - 1], '/pages/result/result');
        assert.strictEqual(app.globalData.pendingSearchContext.strategy, null);
        const result = loadPage('pages/result/result.js');
        result.onLoad();
        await waitFor(() => !result.data.loading, '拒绝录音权限后的推荐未结束');
        assert.strictEqual(result.data.errorMessage, '');
        assert(result.data.places.length > 0);
        assert.strictEqual(result.data.departures[0].transportMode, 'bus');
        assert.deepStrictEqual(result.data.preferences, ['咖啡厅']);
        result.onUnload();
        page.onUnload();
      }
    },
    {
      name: '录音授权回调晚于松手时不得启动录音',
      async run() {
        let pendingAuthorize;
        const originalAuthorize = global.wx.authorize;
        global.wx.authorize = options => { pendingAuthorize = options; };
        try {
          const page = loadPage('pages/index/index.js');
          page.onLoad();
          page.onVoiceTouchStart(event({}, undefined, [{ clientY: 200 }]));
          page.onVoiceTouchEnd();
          pendingAuthorize.success();
          assert.strictEqual(page.data.voiceStatus, 'idle');
          assert.strictEqual(recorder.startCalls.length, 0);
          assert.strictEqual(recorder.stopCalls, 0);
          page.onUnload();
        } finally {
          global.wx.authorize = originalAuthorize;
        }
      }
    },
    {
      name: '持续按住至授权成功后可在松手时停止录音',
      async run() {
        let pendingAuthorize;
        const originalAuthorize = global.wx.authorize;
        global.wx.authorize = options => { pendingAuthorize = options; };
        try {
          const page = loadPage('pages/index/index.js');
          page.onLoad();
          page.onVoiceTouchStart(event({}, undefined, [{ clientY: 200 }]));
          pendingAuthorize.success();
          assert.strictEqual(page.data.voiceStatus, 'recording');
          assert.strictEqual(recorder.startCalls.length, 1);
          assert.strictEqual(recorder.startCalls[0].duration, 45000);
          page.onVoiceTouchEnd();
          assert.strictEqual(page.data.voiceStatus, 'recognizing');
          assert.strictEqual(recorder.stopCalls, 1);
          page.onUnload();
        } finally {
          global.wx.authorize = originalAuthorize;
        }
      }
    },
    {
      name: '录音期间保留提示或识别结果布局且不替换按压文字节点',
      async run() {
        const fs = require('fs');
        const path = require('path');
        const template = fs.readFileSync(path.join(__dirname, '../../pages/index/index.wxml'), 'utf8');
        function visible(className, voiceStatus, hasVoiceData) {
          const match = template.match(new RegExp('class="' + className + '" wx:if="\\{\\{([^]*?)\\}\\}"'));
          assert(match, '必须找到语音区域显示条件');
          return Function('voiceStatus', 'hasVoiceData', 'return (' + match[1] + ')')(voiceStatus, hasVoiceData);
        }
        assert(visible('voice-tip', 'idle', false));
        assert(visible('voice-tip', 'recording', false), '首次录音不能移除提示导致按钮上移');
        assert(visible('voice-result', 'result', true));
        assert(visible('voice-result', 'recording', true), '重录不能移除识别结果导致按钮上移');
        const button = template.match(/class="voice-btn[^]*?<\/text>/)[0];
        assert.strictEqual((button.match(/<text/g) || []).length, 1);
        assert(!/<text[^>]*wx:(if|elif|else)/.test(button), '按压中的文字节点必须保留');
      }
    },
    {
      name: '混合交通提交 strategy 为 null',
      async run() {
        app.globalData.pendingDraft = {
          participants: [
            { participantId: 'self', label: '我', poiId: 'poi_1', name: '双流机场', lat: 30.57, lng: 103.94, transportMode: 'subway' },
            { participantId: 'p1', label: '2', poiId: 'poi_2', name: '武侯祠', lat: 30.64, lng: 104.04, transportMode: 'subway' }
          ],
          preferences: ['咖啡厅']
        };
        const page = loadPage('pages/preference/preference.js');
        page.onLoad();
        page.onSelectTransport(event({ personIndex: 1, transport: 'bus' }));
        page.onStartRecommend();
        assert.strictEqual(app.globalData.pendingSearchContext.strategy, null);
        assert.strictEqual(app.globalData.pendingSearchContext.departures[1].transportMode, 'bus');
        assert.deepStrictEqual(calls.navigateTo, ['/pages/result/result']);
      }
    }
  ]
};

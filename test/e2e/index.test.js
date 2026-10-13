const {
  api, app, assert, calls, event, loadPage, recorder,
  setAuthorizeAllowed, setModalConfirm, waitFor
} = require('./helpers');

module.exports = {
  name: '首页与偏好页',
  cases: [
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

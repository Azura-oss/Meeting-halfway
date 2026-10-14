const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('本地私有配置可只让 ASR 走真实通道，其余接口保持 Mock', async t => {
  const originalWx = global.wx;
  const originalLoad = Module._load;
  const apiPath = require.resolve('../utils/api');
  const calls = { init: 0, upload: 0, cloudFunctions: [], deleted: [] };
  const audioId = 'cloud://test-bucket/voice-temp/selective.mp3';

  global.wx = {
    getAccountInfoSync() { return { miniProgram: { appId: 'test' } }; },
    getStorageSync() {},
    setStorageSync() {},
    removeStorageSync() {},
    cloud: {
      init() { calls.init += 1; },
      async uploadFile() { calls.upload += 1; return { fileID: audioId }; },
      callFunction({ name, success }) {
        calls.cloudFunctions.push(name);
        success({ result: { ok: true, text: '真实语音文字', audioDurationMs: 1600, requestId: 'real-asr' } });
      },
      async deleteFile({ fileList }) { calls.deleted.push(...fileList); }
    }
  };
  Module._load = function load(request, parent, isMain) {
    if (request === './config.local' && parent && parent.filename === apiPath) {
      return { cloudEnv: 'test-env', realFunctions: ['asrRecognize'] };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[apiPath];
  const api = require('../utils/api');
  Module._load = originalLoad;
  api.config.mockDelay = 0;
  t.after(() => {
    api.setUseMock(true);
    delete require.cache[apiPath];
    global.wx = originalWx;
    Module._load = originalLoad;
  });

  const asr = await api.asrRecognize({ tempFilePath: '/tmp/selective.mp3' });
  assert.deepStrictEqual(asr, { text: '真实语音文字', audioDurationMs: 1600, requestId: 'real-asr' });
  assert.deepStrictEqual(calls, {
    init: 1,
    upload: 1,
    cloudFunctions: ['asrRecognize'],
    deleted: [audioId]
  });

  const intent = await api.parseIntent({ text: '我们俩从双流机场和武侯祠出发，坐地铁，想找咖啡厅' });
  assert.strictEqual(intent.requestId, 'mock_intent');
  assert.deepStrictEqual(calls.cloudFunctions, ['asrRecognize']);
});

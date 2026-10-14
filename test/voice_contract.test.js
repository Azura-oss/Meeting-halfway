const test = require('node:test');
const assert = require('node:assert/strict');
const { createAsrHandler } = require('../cloudfunctions/asrRecognize/lib/handler');
const { createParseIntentHandler } = require('../cloudfunctions/parseIntent/lib/handler');

test('正式 API 层与迁入的 ASR/意图处理器契约兼容（无真实网络）', async t => {
  const originalWx = global.wx;
  const audioId = 'cloud://test-bucket/voice-temp/contract.mp3';
  const deleted = [];
  const uploads = [];
  const requests = [];
  const quietLogger = { info() {}, warn() {}, error() {} };
  const recognizedText = '我们俩从天府广场、武侯祠出发，坐公交，想找咖啡厅';
  const modelIntent = {
    partySize: 2, origins: ['天府广场', '武侯祠'], transportModes: ['公交'],
    placePreferences: ['咖啡厅'], missingFields: [], confidence: 0.95
  };
  const normalizedIntent = { ...modelIntent, transportModes: ['bus'] };
  const asrHandler = createAsrHandler({
    cloud: {
      async downloadFile({ fileID }) {
        assert.strictEqual(fileID, audioId);
        return { fileContent: Buffer.from('fake-audio-for-contract-test') };
      },
      async deleteFile({ fileList }) { deleted.push(...fileList); }
    },
    createAsrClient: () => ({ async SentenceRecognition(params) {
      assert.strictEqual(params.VoiceFormat, 'mp3');
      return { Result: recognizedText, AudioDuration: 2000, RequestId: 'asr-contract' };
    } }),
    logger: quietLogger
  });
  const intentHandler = createParseIntentHandler({
    async callModel({ userText }) {
      assert.strictEqual(userText, recognizedText);
      return { output: modelIntent, requestId: 'intent-contract' };
    },
    logger: quietLogger
  });
  global.wx = { cloud: {
    init() {},
    async uploadFile(params) { uploads.push(params); return { fileID: audioId }; },
    async deleteFile({ fileList }) { deleted.push(...fileList); },
    callFunction({ name, data, success, fail }) {
      requests.push({ name, data });
      const handler = name === 'asrRecognize' ? asrHandler : intentHandler;
      handler(data).then(result => success({ result }), fail);
    }
  } };
  const api = require('../utils/api');
  api.setUseMock(false);
  t.after(() => { api.setUseMock(true); global.wx = originalWx; });

  const asr = await api.asrRecognize({ tempFilePath: '/tmp/contract.mp3' });
  assert.strictEqual(asr.text, recognizedText);
  assert.strictEqual(asr.requestId, 'asr-contract');
  assert.deepStrictEqual(requests[0].data, { fileID: audioId, format: 'mp3' });
  assert(uploads[0].cloudPath.startsWith('voice-temp/'));
  assert.deepStrictEqual(deleted, [audioId, audioId]);

  const parsed = await api.parseIntent({ text: asr.text });
  assert.deepStrictEqual(parsed, { ...normalizedIntent, requestId: 'intent-contract' });
  assert.deepStrictEqual(requests[1].data, { text: recognizedText });
});

test('语音上传后识别失败仍清理临时文件，且清理失败不覆盖主错误', async t => {
  const originalWx = global.wx;
  const originalWarn = console.warn;
  const audioId = 'cloud://test-bucket/voice-temp/failure.mp3';
  const deleted = [];
  const warnings = [];
  global.wx = { cloud: {
    init() {},
    async uploadFile() { return { fileID: audioId }; },
    callFunction({ success }) {
      success({ result: { ok: false, code: 'ASR_TIMEOUT', message: '语音识别超时', retryable: true, requestId: 'asr-timeout' } });
    },
    async deleteFile({ fileList }) {
      deleted.push(...fileList);
      const error = new Error('cleanup failed');
      error.code = 'STORAGE_ERROR';
      throw error;
    }
  } };
  console.warn = (...args) => warnings.push(args);
  const api = require('../utils/api');
  api.setUseMock(false);
  t.after(() => {
    api.setUseMock(true);
    global.wx = originalWx;
    console.warn = originalWarn;
  });

  await assert.rejects(
    api.asrRecognize({ tempFilePath: '/tmp/failure.mp3' }),
    error => error.code === 'ASR_TIMEOUT' && error.requestId === 'asr-timeout'
  );
  assert.deepStrictEqual(deleted, [audioId]);
  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(warnings[0][0], '[api][voice_cleanup_failed]');
});

test('客户端清理失败不覆盖成功的识别结果', async t => {
  const originalWx = global.wx;
  const originalWarn = console.warn;
  const audioId = 'cloud://test-bucket/voice-temp/success.mp3';
  const warnings = [];
  global.wx = { cloud: {
    init() {},
    async uploadFile() { return { fileID: audioId }; },
    callFunction({ success }) {
      success({ result: { ok: true, text: '识别成功', audioDurationMs: 1200, requestId: 'asr-success' } });
    },
    async deleteFile() {
      const error = new Error('cleanup failed');
      error.code = 'STORAGE_ERROR';
      throw error;
    }
  } };
  console.warn = (...args) => warnings.push(args);
  const api = require('../utils/api');
  api.setUseMock(false);
  t.after(() => {
    api.setUseMock(true);
    global.wx = originalWx;
    console.warn = originalWarn;
  });

  const result = await api.asrRecognize({ tempFilePath: '/tmp/success.mp3' });
  assert.deepStrictEqual(result, { text: '识别成功', audioDurationMs: 1200, requestId: 'asr-success' });
  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(warnings[0][0], '[api][voice_cleanup_failed]');
});

test('语音上传失败时没有 fileID，不尝试删除', async t => {
  const originalWx = global.wx;
  let deleteCalls = 0;
  global.wx = { cloud: {
    init() {},
    async uploadFile() {
      const error = new Error('上传失败');
      error.code = 'UPLOAD_FAILED';
      throw error;
    },
    async deleteFile() { deleteCalls += 1; }
  } };
  const api = require('../utils/api');
  api.setUseMock(false);
  t.after(() => { api.setUseMock(true); global.wx = originalWx; });

  await assert.rejects(
    api.asrRecognize({ tempFilePath: '/tmp/upload-failure.mp3' }),
    error => error.code === 'UPLOAD_FAILED'
  );
  assert.strictEqual(deleteCalls, 0);
});

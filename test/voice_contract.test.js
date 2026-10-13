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
  const intent = {
    partySize: 2, origins: ['天府广场', '武侯祠'], transportModes: ['公交'],
    placePreferences: ['咖啡厅'], missingFields: [], confidence: 0.95
  };
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
      return { output: intent, requestId: 'intent-contract' };
    },
    logger: quietLogger
  });
  global.wx = { cloud: {
    init() {},
    async uploadFile(params) { uploads.push(params); return { fileID: audioId }; },
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
  assert.deepStrictEqual(deleted, [audioId]);

  const parsed = await api.parseIntent({ text: asr.text });
  assert.deepStrictEqual(parsed, { ...intent, requestId: 'intent-contract' });
  assert.deepStrictEqual(requests[1].data, { text: recognizedText });
});

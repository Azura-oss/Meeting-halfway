const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_AUDIO_BYTES,
  createAsrHandler
} = require('../lib/handler');

const VALID_FILE_ID = 'cloud://test-env.bucket/voice-temp/20260921/sample.mp3';

function createHarness(overrides = {}) {
  const calls = {
    download: [],
    delete: [],
    recognize: [],
    logs: []
  };
  const cloud = {
    async downloadFile(payload) {
      calls.download.push(payload);
      if (overrides.downloadError) {
        throw overrides.downloadError;
      }
      return { fileContent: overrides.audio || Buffer.from('fake-mp3-audio') };
    },
    async deleteFile(payload) {
      calls.delete.push(payload);
      if (overrides.deleteError) {
        throw overrides.deleteError;
      }
      return {};
    }
  };
  const client = {
    async SentenceRecognition(payload) {
      calls.recognize.push(payload);
      if (overrides.recognizePromise) {
        return overrides.recognizePromise;
      }
      if (overrides.recognizeError) {
        throw overrides.recognizeError;
      }
      return overrides.response || {
        Result: '我们仨从双流机场和武侯祠出发，坐地铁，想找咖啡厅。',
        AudioDuration: 8200,
        RequestId: 'request-123'
      };
    }
  };
  const logger = {
    info(event, data) { calls.logs.push({ level: 'info', event, data }); },
    warn(event, data) { calls.logs.push({ level: 'warn', event, data }); },
    error(event, data) { calls.logs.push({ level: 'error', event, data }); }
  };
  const handler = createAsrHandler({
    cloud,
    createAsrClient: overrides.createAsrClient || (() => client),
    timeoutMs: overrides.timeoutMs || 1000,
    logger
  });
  return { calls, handler };
}

test('returns recognized text and deletes the temporary audio', async () => {
  const { calls, handler } = createHarness();
  const result = await handler({ fileID: VALID_FILE_ID, format: 'mp3' });

  assert.deepEqual(result, {
    ok: true,
    text: '我们仨从双流机场和武侯祠出发，坐地铁，想找咖啡厅。',
    audioDurationMs: 8200,
    requestId: 'request-123'
  });
  assert.equal(calls.download.length, 1);
  assert.equal(calls.recognize.length, 1);
  assert.equal(calls.delete.length, 1);
  assert.equal(calls.recognize[0].SourceType, 1);
  assert.equal(calls.recognize[0].EngSerViceType, '16k_zh');
  assert.equal(calls.recognize[0].DataLen, Buffer.byteLength('fake-mp3-audio'));
});

test('rejects a missing fileID without trying to delete an unknown file', async () => {
  const { calls, handler } = createHarness();
  const result = await handler({ format: 'mp3' });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_INPUT');
  assert.equal(calls.download.length, 0);
  assert.equal(calls.delete.length, 0);
});

test('rejects files outside the temporary voice directory', async () => {
  const { calls, handler } = createHarness();
  const result = await handler({
    fileID: 'cloud://test-env.bucket/private/other.mp3',
    format: 'mp3'
  });

  assert.equal(result.code, 'INVALID_INPUT');
  assert.equal(calls.download.length, 0);
  assert.equal(calls.delete.length, 0);
});

test('rejects unsupported audio formats', async () => {
  const { calls, handler } = createHarness();
  const result = await handler({ fileID: VALID_FILE_ID, format: 'wav' });

  assert.equal(result.code, 'UNSUPPORTED_FORMAT');
  assert.equal(calls.download.length, 0);
  assert.equal(calls.delete.length, 0);
});

test('rejects oversized audio and still deletes it', async () => {
  const { calls, handler } = createHarness({
    audio: Buffer.alloc(MAX_AUDIO_BYTES + 1)
  });
  const result = await handler({ fileID: VALID_FILE_ID, format: 'mp3' });

  assert.equal(result.code, 'AUDIO_TOO_LARGE');
  assert.equal(calls.recognize.length, 0);
  assert.equal(calls.delete.length, 1);
});

test('maps an empty recognition result to NO_SPEECH and deletes audio', async () => {
  const { calls, handler } = createHarness({
    response: { Result: '  ', AudioDuration: 1000, RequestId: 'empty-request' }
  });
  const result = await handler({ fileID: VALID_FILE_ID, format: 'mp3' });

  assert.equal(result.code, 'NO_SPEECH');
  assert.equal(result.retryable, true);
  assert.equal(calls.delete.length, 1);
});

test('maps service-not-open errors and deletes audio', async () => {
  const error = new Error('service is not open');
  error.code = 'FailedOperation.UserNotRegistered';
  error.requestId = 'not-open-request';
  const { calls, handler } = createHarness({ recognizeError: error });
  const result = await handler({ fileID: VALID_FILE_ID, format: 'mp3' });

  assert.equal(result.code, 'ASR_NOT_OPEN');
  assert.equal(result.retryable, false);
  assert.equal(result.requestId, 'not-open-request');
  assert.equal(calls.delete.length, 1);
});

test('maps exhausted quota errors and deletes audio', async () => {
  const error = new Error('quota exhausted');
  error.code = 'FailedOperation.UserHasNoFreeAmount';
  const { calls, handler } = createHarness({ recognizeError: error });
  const result = await handler({ fileID: VALID_FILE_ID, format: 'mp3' });

  assert.equal(result.code, 'ASR_QUOTA_EXHAUSTED');
  assert.equal(calls.delete.length, 1);
});

test('maps recognition timeouts and deletes audio', async () => {
  const neverResolves = new Promise(() => {});
  const { calls, handler } = createHarness({
    recognizePromise: neverResolves,
    timeoutMs: 1000
  });
  const result = await handler({ fileID: VALID_FILE_ID, format: 'mp3' });

  assert.equal(result.code, 'ASR_TIMEOUT');
  assert.equal(result.retryable, true);
  assert.equal(calls.delete.length, 1);
});

test('maps network timeout messages even when the SDK omits an error code', async () => {
  const error = new Error('socket timed out while calling upstream');
  const { calls, handler } = createHarness({ recognizeError: error });
  const result = await handler({ fileID: VALID_FILE_ID, format: 'mp3' });

  assert.equal(result.code, 'ASR_TIMEOUT');
  assert.equal(result.retryable, true);
  assert.equal(calls.delete.length, 1);
});

test('deletes temporary audio when cloud download fails', async () => {
  const error = new Error('temporary storage read failed');
  error.code = 'STORAGE_READ_FAILED';
  const { calls, handler } = createHarness({ downloadError: error });
  const result = await handler({ fileID: VALID_FILE_ID, format: 'mp3' });

  assert.equal(result.code, 'INTERNAL_ERROR');
  assert.equal(calls.recognize.length, 0);
  assert.equal(calls.delete.length, 1);
});

test('maps missing runtime credentials to a safe internal error', async () => {
  const credentialError = new Error('secret must never be shown');
  credentialError.code = 'CREDENTIALS_MISSING';
  const { calls, handler } = createHarness({
    createAsrClient: () => { throw credentialError; }
  });
  const result = await handler({ fileID: VALID_FILE_ID, format: 'mp3' });

  assert.equal(result.code, 'INTERNAL_ERROR');
  assert.equal(result.message.includes('secret'), false);
  assert.equal(calls.delete.length, 1);
});

test('logs only metadata and never logs audio data or recognized text', async () => {
  const { calls, handler } = createHarness();
  await handler({ fileID: VALID_FILE_ID, format: 'mp3' });

  const serializedLogs = JSON.stringify(calls.logs);
  assert.equal(serializedLogs.includes('fake-mp3-audio'), false);
  assert.equal(serializedLogs.includes('双流机场'), false);
  assert.equal(serializedLogs.includes('Data'), false);
});

test('cleanup failure does not replace a successful recognition response', async () => {
  const cleanupError = new Error('temporary storage unavailable');
  cleanupError.code = 'STORAGE_UNAVAILABLE';
  const { calls, handler } = createHarness({ deleteError: cleanupError });
  const result = await handler({ fileID: VALID_FILE_ID, format: 'mp3' });

  assert.equal(result.ok, true);
  assert.equal(calls.delete.length, 1);
  assert.equal(calls.logs.some((entry) => entry.event === 'asr_audio_cleanup_failed'), true);
});

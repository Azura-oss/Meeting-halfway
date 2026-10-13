const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(['mp3']);
const DEFAULT_TIMEOUT_MS = 8000;

const ERROR_RESPONSES = Object.freeze({
  INVALID_INPUT: { message: '录音参数无效，请重新录制', retryable: false },
  UNSUPPORTED_FORMAT: { message: '暂不支持该录音格式，请使用 MP3', retryable: false },
  AUDIO_TOO_LARGE: { message: '录音文件过大或时间过长，请缩短后重试', retryable: false },
  NO_SPEECH: { message: '没有识别到有效语音，请重新说一遍', retryable: true },
  ASR_NOT_OPEN: { message: '语音识别服务尚未开通', retryable: false },
  ASR_QUOTA_EXHAUSTED: { message: '语音识别额度不足，请联系管理员', retryable: false },
  ASR_TIMEOUT: { message: '语音识别超时，请检查网络后重试', retryable: true },
  ASR_FAILED: { message: '语音识别失败，请重新说一遍', retryable: true },
  INTERNAL_ERROR: { message: '服务配置异常，请稍后重试', retryable: false }
});

function createCodedError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateInput(event) {
  if (!event || typeof event.fileID !== 'string' || !event.fileID.startsWith('cloud://')) {
    throw createCodedError('INVALID_INPUT');
  }
  if (!event.fileID.includes('/voice-temp/')) {
    throw createCodedError('INVALID_INPUT');
  }
  if (typeof event.format !== 'string' || !ALLOWED_FORMATS.has(event.format.toLowerCase())) {
    throw createCodedError('UNSUPPORTED_FORMAT');
  }
  return {
    fileID: event.fileID,
    format: event.format.toLowerCase()
  };
}

function extractRequestId(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value.RequestId || value.requestId || null;
}

function mapError(error) {
  const sourceCode = error && error.code ? String(error.code) : '';
  const sourceMessage = error && error.message ? String(error.message) : '';
  const directCodes = new Set(Object.keys(ERROR_RESPONSES));
  if (directCodes.has(sourceCode)) {
    return { code: sourceCode, requestId: extractRequestId(error) };
  }

  if (sourceCode === 'FailedOperation.UserNotRegistered') {
    return { code: 'ASR_NOT_OPEN', requestId: extractRequestId(error) };
  }
  if ([
    'FailedOperation.ServiceIsolate',
    'FailedOperation.UserHasNoAmount',
    'FailedOperation.UserHasNoFreeAmount'
  ].includes(sourceCode)) {
    return { code: 'ASR_QUOTA_EXHAUSTED', requestId: extractRequestId(error) };
  }
  if ([
    'InvalidParameter.ErrorContentlength',
    'InvalidParameterValue.ErrorVoicedataTooLong'
  ].includes(sourceCode)) {
    return { code: 'AUDIO_TOO_LARGE', requestId: extractRequestId(error) };
  }
  if (
    sourceCode === 'ASR_CLIENT_TIMEOUT' ||
    /timeout|timed out|econnreset|etimedout/i.test(`${sourceCode} ${sourceMessage}`)
  ) {
    return { code: 'ASR_TIMEOUT', requestId: extractRequestId(error) };
  }
  if (sourceCode === 'CREDENTIALS_MISSING' || sourceCode.startsWith('AuthFailure')) {
    return { code: 'INTERNAL_ERROR', requestId: extractRequestId(error) };
  }
  if (
    sourceCode.startsWith('FailedOperation') ||
    sourceCode.startsWith('InvalidParameter') ||
    sourceCode.startsWith('InternalError') ||
    sourceCode.startsWith('RequestLimitExceeded')
  ) {
    return { code: 'ASR_FAILED', requestId: extractRequestId(error) };
  }
  return { code: 'INTERNAL_ERROR', requestId: extractRequestId(error) };
}

function failureResponse(mapped) {
  const config = ERROR_RESPONSES[mapped.code] || ERROR_RESPONSES.INTERNAL_ERROR;
  return {
    ok: false,
    code: mapped.code in ERROR_RESPONSES ? mapped.code : 'INTERNAL_ERROR',
    message: config.message,
    retryable: config.retryable,
    requestId: mapped.requestId || null
  };
}

async function withTimeout(promise, timeoutMs) {
  let timeoutHandle;
  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(createCodedError('ASR_CLIENT_TIMEOUT')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function deleteTemporaryAudio(cloud, fileID, logger) {
  try {
    await cloud.deleteFile({ fileList: [fileID] });
    return true;
  } catch (error) {
    logger.warn('asr_audio_cleanup_failed', {
      errorCode: error && error.code ? String(error.code) : 'UNKNOWN'
    });
    return false;
  }
}

function createAsrHandler(options) {
  const {
    cloud,
    createAsrClient,
    engine = '16k_zh',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    logger = console
  } = options;

  if (!cloud || typeof cloud.downloadFile !== 'function' || typeof cloud.deleteFile !== 'function') {
    throw new TypeError('cloud adapter is required');
  }
  if (typeof createAsrClient !== 'function') {
    throw new TypeError('createAsrClient is required');
  }

  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? Math.min(timeoutMs, 15000) : DEFAULT_TIMEOUT_MS;

  return async function asrHandler(event) {
    const startedAt = Date.now();
    let validated;
    let requestId = null;

    try {
      validated = validateInput(event);
      const download = await cloud.downloadFile({ fileID: validated.fileID });
      const audio = download && download.fileContent;

      if (!Buffer.isBuffer(audio) || audio.length === 0) {
        throw createCodedError('NO_SPEECH');
      }
      if (audio.length > MAX_AUDIO_BYTES) {
        throw createCodedError('AUDIO_TOO_LARGE');
      }

      const client = createAsrClient();
      const response = await withTimeout(client.SentenceRecognition({
        EngSerViceType: engine,
        SourceType: 1,
        VoiceFormat: validated.format,
        Data: audio.toString('base64'),
        DataLen: audio.length,
        WordInfo: 0,
        FilterDirty: 0,
        FilterModal: 0,
        FilterPunc: 0,
        ConvertNumMode: 1
      }), effectiveTimeout);

      requestId = extractRequestId(response);
      const text = response && typeof response.Result === 'string' ? response.Result.trim() : '';
      if (!text) {
        throw createCodedError('NO_SPEECH');
      }

      logger.info('asr_request_succeeded', {
        requestId,
        elapsedMs: Date.now() - startedAt,
        audioDurationMs: Number(response.AudioDuration) || 0,
        audioBytes: audio.length,
        engine
      });

      return {
        ok: true,
        text,
        audioDurationMs: Number(response.AudioDuration) || 0,
        requestId
      };
    } catch (error) {
      const mapped = mapError(error);
      requestId = mapped.requestId || requestId;
      logger.error('asr_request_failed', {
        code: mapped.code,
        requestId,
        elapsedMs: Date.now() - startedAt
      });
      return failureResponse({ ...mapped, requestId });
    } finally {
      if (validated && validated.fileID) {
        await deleteTemporaryAudio(cloud, validated.fileID, logger);
      }
    }
  };
}

module.exports = {
  ALLOWED_FORMATS,
  ERROR_RESPONSES,
  MAX_AUDIO_BYTES,
  createAsrHandler,
  mapError,
  validateInput
};

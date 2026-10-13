const assert = require('node:assert/strict');
const test = require('node:test');

const { createParseIntentHandler } = require('../lib/handler');

const VALID_INTENT = {
  partySize: 3,
  origins: ['双流机场', '武侯祠'],
  transportModes: ['地铁'],
  placePreferences: ['咖啡厅'],
  missingFields: [],
  confidence: 0.95
};

function createHarness(overrides = {}) {
  const calls = [];
  const logs = [];
  const callModel = async (payload) => {
    calls.push(payload);
    if (overrides.promise) {
      return overrides.promise;
    }
    if (overrides.error) {
      throw overrides.error;
    }
    return overrides.response || {
      output: JSON.stringify(VALID_INTENT),
      requestId: 'llm-request-123'
    };
  };
  const logger = {
    info(event, data) { logs.push({ level: 'info', event, data }); },
    error(event, data) { logs.push({ level: 'error', event, data }); }
  };
  return {
    calls,
    logs,
    handler: createParseIntentHandler({
      callModel,
      logger,
      timeoutMs: overrides.timeoutMs || 1000
    })
  };
}

test('returns a validated structured intent', async () => {
  const { calls, handler } = createHarness();
  const result = await handler({
    text: '我们仨从双流机场、武侯祠出发，坐地铁，想找咖啡厅。'
  });

  assert.deepEqual(result, {
    ok: true,
    intent: VALID_INTENT,
    requestId: 'llm-request-123'
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].jsonSchema.additionalProperties, false);
});

test('accepts fenced JSON but returns only normalized data', async () => {
  const intent = {
    ...VALID_INTENT,
    origins: [' 双流机场 ', '双流机场', '武侯祠']
  };
  const { handler } = createHarness({
    response: { content: `\`\`\`json\n${JSON.stringify(intent)}\n\`\`\`` }
  });
  const result = await handler({ text: '测试语句' });

  assert.equal(result.ok, true);
  assert.deepEqual(result.intent.origins, ['双流机场', '武侯祠']);
});

test('rejects empty input before calling the model', async () => {
  const { calls, handler } = createHarness();
  const result = await handler({ text: '   ' });

  assert.equal(result.code, 'INVALID_INPUT');
  assert.equal(result.retryable, false);
  assert.equal(calls.length, 0);
});

test('rejects an invalid party size from the model', async () => {
  const { handler } = createHarness({
    response: { output: JSON.stringify({ ...VALID_INTENT, partySize: 0 }) }
  });
  const result = await handler({ text: '我们去吃饭' });

  assert.equal(result.code, 'LLM_BAD_RESPONSE');
  assert.equal(result.retryable, true);
});

test('requires missingFields to agree with empty values', async () => {
  const { handler } = createHarness({
    response: {
      output: JSON.stringify({
        ...VALID_INTENT,
        partySize: null,
        missingFields: []
      })
    }
  });
  const result = await handler({ text: '想找咖啡厅' });

  assert.equal(result.code, 'LLM_BAD_RESPONSE');
});

test('maps a model timeout to a retryable error', async () => {
  const { handler } = createHarness({
    promise: new Promise(() => {}),
    timeoutMs: 1000
  });
  const result = await handler({ text: '我们三个人坐地铁去吃饭' });

  assert.equal(result.code, 'LLM_TIMEOUT');
  assert.equal(result.retryable, true);
});

test('does not expose upstream error details', async () => {
  const error = new Error('provider secret and raw response must stay private');
  error.code = 'UPSTREAM_FAILURE';
  const { handler } = createHarness({ error });
  const result = await handler({ text: '我们三个人坐地铁去吃饭' });

  assert.equal(result.code, 'LLM_FAILED');
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('logs metadata without logging the recognized text', async () => {
  const sensitiveText = '我从双流机场出发';
  const { logs, handler } = createHarness();
  await handler({ text: sensitiveText });

  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes(sensitiveText), false);
  assert.equal(serializedLogs.includes('双流机场'), false);
  assert.equal(serializedLogs.includes('inputChars'), true);
});

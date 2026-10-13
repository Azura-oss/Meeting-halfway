const assert = require('node:assert/strict');
const test = require('node:test');

const { INTENT_JSON_SCHEMA } = require('../lib/contract');
const {
  DEFAULT_ENDPOINT,
  buildRequestBody,
  createTokenHubClient,
  validateEndpoint
} = require('../lib/tokenhub');

test('builds a strict Hy3 structured-output request', () => {
  const body = buildRequestBody({
    systemPrompt: '只返回 JSON',
    userText: '我们三个人坐地铁去咖啡厅',
    jsonSchema: INTENT_JSON_SCHEMA,
    model: 'hy3'
  });

  assert.equal(body.model, 'hy3');
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 0);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
  assert.equal(body.messages[1].content, '我们三个人坐地铁去咖啡厅');
});

test('allows only official mainland TokenHub HTTPS endpoints', () => {
  assert.equal(validateEndpoint(DEFAULT_ENDPOINT), DEFAULT_ENDPOINT);
  assert.throws(
    () => validateEndpoint('https://example.com/v1/chat/completions'),
    (error) => error.code === 'LLM_NOT_CONFIGURED'
  );
  assert.throws(
    () => validateEndpoint('http://tokenhub.tencentmaas.com/v1/chat/completions'),
    (error) => error.code === 'LLM_NOT_CONFIGURED'
  );
});

test('refuses to call TokenHub without a server-side API key', async () => {
  const callModel = createTokenHubClient({
    apiKey: '',
    transport: async () => {
      throw new Error('transport should not run');
    }
  });

  await assert.rejects(
    callModel({ systemPrompt: 'x', userText: 'y', jsonSchema: INTENT_JSON_SCHEMA }),
    (error) => error.code === 'LLM_NOT_CONFIGURED'
  );
});

test('extracts structured content without exposing the API key', async () => {
  const calls = [];
  const callModel = createTokenHubClient({
    apiKey: 'server-only-test-key',
    transport: async (request) => {
      calls.push(request);
      return {
        requestId: 'tokenhub-request-1',
        body: {
          choices: [{
            message: {
              content: JSON.stringify({
                partySize: 3,
                origins: [],
                transportModes: ['地铁'],
                placePreferences: ['咖啡厅'],
                missingFields: ['origins'],
                confidence: 0.9
              })
            }
          }]
        }
      };
    }
  });

  const result = await callModel({
    systemPrompt: '只返回 JSON',
    userText: '我们三个人坐地铁去咖啡厅',
    jsonSchema: INTENT_JSON_SCHEMA
  });

  assert.equal(result.requestId, 'tokenhub-request-1');
  assert.equal(typeof result.output, 'string');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].apiKey, 'server-only-test-key');
  assert.equal(JSON.stringify(result).includes('server-only-test-key'), false);
});

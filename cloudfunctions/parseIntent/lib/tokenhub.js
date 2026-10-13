const https = require('node:https');

const DEFAULT_ENDPOINT = 'https://tokenhub.tencentmaas.com/v1/chat/completions';
const DEFAULT_MODEL = 'hy3';
const MAX_RESPONSE_BYTES = 1024 * 1024;
const ALLOWED_HOSTNAMES = new Set([
  'tokenhub.tencentmaas.com',
  'tokenhub.tencentmaas.cn'
]);

function createCodedError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateEndpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(value || DEFAULT_ENDPOINT);
  } catch (error) {
    throw createCodedError('LLM_NOT_CONFIGURED', 'invalid TokenHub endpoint');
  }
  if (endpoint.protocol !== 'https:' || !ALLOWED_HOSTNAMES.has(endpoint.hostname)) {
    throw createCodedError('LLM_NOT_CONFIGURED', 'untrusted TokenHub endpoint');
  }
  return endpoint.toString();
}

function buildRequestBody({ systemPrompt, userText, jsonSchema, model = DEFAULT_MODEL }) {
  return {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'najian_meeting_intent',
        strict: true,
        schema: jsonSchema
      }
    },
    stream: false,
    temperature: 0,
    max_tokens: 400
  };
}

function postJson({ endpoint, apiKey, body, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = https.request(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (response) => {
      const chunks = [];
      let totalBytes = 0;

      response.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          request.destroy(createCodedError('LLM_FAILED', 'TokenHub response too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch (error) {
          reject(createCodedError('LLM_BAD_RESPONSE', 'TokenHub returned invalid JSON'));
          return;
        }

        if (response.statusCode === 401 || response.statusCode === 403) {
          reject(createCodedError('TOKENHUB_AUTH_FAILED', 'TokenHub authentication failed'));
          return;
        }
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          const upstreamError = createCodedError('LLM_FAILED', `TokenHub HTTP ${response.statusCode || 0}`);
          upstreamError.requestId = response.headers['x-request-id'] || null;
          reject(upstreamError);
          return;
        }

        resolve({
          body: parsed,
          requestId: response.headers['x-request-id'] || parsed.id || null
        });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(createCodedError('LLM_TIMEOUT', 'TokenHub request timed out'));
    });
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

function createTokenHubClient(options = {}) {
  const {
    apiKey,
    model = DEFAULT_MODEL,
    endpoint = DEFAULT_ENDPOINT,
    transport = postJson,
    requestTimeoutMs = 15000
  } = options;
  const validatedEndpoint = validateEndpoint(endpoint);

  return async function callTokenHub(payload) {
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      throw createCodedError('LLM_NOT_CONFIGURED', 'TokenHub API key is missing');
    }
    const response = await transport({
      endpoint: validatedEndpoint,
      apiKey: apiKey.trim(),
      timeoutMs: requestTimeoutMs,
      body: buildRequestBody({ ...payload, model })
    });
    const body = response && response.body ? response.body : response;
    const choice = body && Array.isArray(body.choices) ? body.choices[0] : null;
    const content = choice && choice.message ? choice.message.content : null;
    if (typeof content !== 'string' && (!content || typeof content !== 'object')) {
      throw createCodedError('LLM_BAD_RESPONSE', 'TokenHub response has no message content');
    }
    return {
      output: content,
      requestId: (response && response.requestId) || (body && body.id) || null
    };
  };
}

module.exports = {
  ALLOWED_HOSTNAMES,
  DEFAULT_ENDPOINT,
  DEFAULT_MODEL,
  buildRequestBody,
  createTokenHubClient,
  validateEndpoint
};

const { createParseIntentHandler } = require('./lib/handler');
const { createTokenHubClient } = require('./lib/tokenhub');

const callModel = createTokenHubClient({
  apiKey: process.env.TOKENHUB_API_KEY,
  model: process.env.TOKENHUB_MODEL || 'hy3',
  endpoint: process.env.TOKENHUB_ENDPOINT || undefined,
  requestTimeoutMs: Number(process.env.TOKENHUB_TIMEOUT_MS) || 15000
});

exports.main = createParseIntentHandler({
  callModel,
  timeoutMs: Number(process.env.TOKENHUB_TIMEOUT_MS) || 15000,
  logger: console
});

const INTENT_FIELDS = Object.freeze([
  'partySize',
  'origins',
  'transportModes',
  'placePreferences'
]);

const MAX_INPUT_TEXT_LENGTH = 500;
const MAX_LIST_ITEMS = 8;
const MAX_ITEM_LENGTH = 80;

const INTENT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'partySize',
    'origins',
    'transportModes',
    'placePreferences',
    'missingFields',
    'confidence'
  ],
  properties: {
    partySize: {
      anyOf: [
        { type: 'integer', minimum: 1, maximum: 100 },
        { type: 'null' }
      ]
    },
    origins: {
      type: 'array',
      maxItems: MAX_LIST_ITEMS,
      items: { type: 'string', minLength: 1, maxLength: MAX_ITEM_LENGTH }
    },
    transportModes: {
      type: 'array',
      maxItems: MAX_LIST_ITEMS,
      items: { type: 'string', minLength: 1, maxLength: MAX_ITEM_LENGTH }
    },
    placePreferences: {
      type: 'array',
      maxItems: MAX_LIST_ITEMS,
      items: { type: 'string', minLength: 1, maxLength: MAX_ITEM_LENGTH }
    },
    missingFields: {
      type: 'array',
      uniqueItems: true,
      items: { enum: INTENT_FIELDS }
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  }
});

function createContractError(message) {
  const error = new Error(message);
  error.code = 'LLM_BAD_RESPONSE';
  return error;
}

function normalizeStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) {
    throw createContractError(`${fieldName} must be a bounded array`);
  }

  const result = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string') {
      throw createContractError(`${fieldName} contains a non-string value`);
    }
    const normalized = item.trim();
    if (!normalized || normalized.length > MAX_ITEM_LENGTH) {
      throw createContractError(`${fieldName} contains an invalid value`);
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function validateMissingFields(intent) {
  if (!Array.isArray(intent.missingFields)) {
    throw createContractError('missingFields must be an array');
  }

  const missingFields = [];
  const seen = new Set();
  for (const field of intent.missingFields) {
    if (!INTENT_FIELDS.includes(field) || seen.has(field)) {
      throw createContractError('missingFields contains an invalid value');
    }
    seen.add(field);
    missingFields.push(field);
  }

  const emptyState = {
    partySize: intent.partySize === null,
    origins: intent.origins.length === 0,
    transportModes: intent.transportModes.length === 0,
    placePreferences: intent.placePreferences.length === 0
  };

  for (const field of INTENT_FIELDS) {
    if (emptyState[field] !== seen.has(field)) {
      throw createContractError(`missingFields is inconsistent for ${field}`);
    }
  }
  return missingFields;
}

function validateAndNormalizeIntent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createContractError('intent must be an object');
  }

  const allowedKeys = new Set([
    'partySize',
    'origins',
    'transportModes',
    'placePreferences',
    'missingFields',
    'confidence'
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw createContractError('intent contains an unexpected property');
  }

  const partySize = value.partySize;
  if (partySize !== null && (!Number.isInteger(partySize) || partySize < 1 || partySize > 100)) {
    throw createContractError('partySize must be null or an integer from 1 to 100');
  }
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    throw createContractError('confidence must be a number from 0 to 1');
  }

  const intent = {
    partySize,
    origins: normalizeStringArray(value.origins, 'origins'),
    transportModes: normalizeStringArray(value.transportModes, 'transportModes'),
    placePreferences: normalizeStringArray(value.placePreferences, 'placePreferences'),
    missingFields: [],
    confidence: value.confidence
  };
  intent.missingFields = validateMissingFields({
    ...intent,
    missingFields: value.missingFields
  });
  return intent;
}

function parseModelOutput(rawOutput) {
  if (rawOutput && typeof rawOutput === 'object' && !Array.isArray(rawOutput)) {
    return validateAndNormalizeIntent(rawOutput);
  }
  if (typeof rawOutput !== 'string') {
    throw createContractError('model output must be JSON text or an object');
  }

  const cleaned = rawOutput
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw createContractError('model output is not valid JSON');
  }
  return validateAndNormalizeIntent(parsed);
}

module.exports = {
  INTENT_FIELDS,
  INTENT_JSON_SCHEMA,
  MAX_INPUT_TEXT_LENGTH,
  parseModelOutput,
  validateAndNormalizeIntent
};

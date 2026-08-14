/** Strict structured-output schema for OpenAI mapping suggestions (DDA-005/043). */

export const OPENAI_MAPPING_SCHEMA_NAME = 'dda_mapping_suggestion_v1';
export const OPENAI_MAPPING_SCHEMA_VERSION = 'dda-mapping-suggestion.v1';

export const ALLOWED_MAPPING_TRANSFORM_KINDS = Object.freeze([
  'SELECT_COLUMNS',
  'RENAME_COLUMNS',
  'TRIM_TEXT',
  'NORMALIZE_TEXT',
  'PARSE_DATE',
  'PARSE_TIME',
  'PARSE_NUMBER',
  'PARSE_CURRENCY',
  'CAST_TYPE',
  'REPLACE_NULL',
] as const);

export const OPENAI_MAPPING_OUTPUT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'label',
          'summary',
          'sourceField',
          'targetField',
          'transformKind',
          'alternatives',
          'rationale',
          'uncertainty',
        ],
        properties: {
          label: { type: 'string', maxLength: 128 },
          summary: { type: 'string', maxLength: 512 },
          sourceField: { type: 'string', maxLength: 128 },
          targetField: { type: 'string', maxLength: 128 },
          transformKind: { type: 'string', enum: [...ALLOWED_MAPPING_TRANSFORM_KINDS] },
          alternatives: {
            type: 'array',
            maxItems: 5,
            items: { type: 'string', maxLength: 128 },
          },
          rationale: { type: 'string', maxLength: 512 },
          uncertainty: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
        },
      },
    },
  },
});

export function openaiMappingTextFormatV1() {
  return Object.freeze({
    format: Object.freeze({
      type: 'json_schema' as const,
      name: OPENAI_MAPPING_SCHEMA_NAME,
      strict: true as const,
      schema: OPENAI_MAPPING_OUTPUT_JSON_SCHEMA,
    }),
  });
}

/** Strict structured-output schema for OpenAI typed analysis proposals (DDA-015/043). */

export const OPENAI_ANALYSIS_SCHEMA_NAME = 'dda_analysis_proposal_v1';
export const OPENAI_ANALYSIS_SCHEMA_VERSION = 'dda-analysis-proposal.v1';

export const OPENAI_ANALYSIS_OUTPUT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'dimensions',
    'filters',
    'timeGrain',
    'joins',
    'output',
    'assumptions',
    'ambiguityAlternatives',
    'rationale',
  ],
  properties: {
    dimensions: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', maxLength: 128 },
    },
    filters: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'operator', 'value'],
        properties: {
          field: { type: 'string', maxLength: 128 },
          operator: { type: 'string', enum: ['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE', 'IN'] },
          value: { type: 'string', maxLength: 256 },
        },
      },
    },
    timeGrain: { type: 'string', enum: ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'] },
    joins: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['joinId'],
        properties: {
          joinId: { type: 'string', maxLength: 128 },
        },
      },
    },
    output: {
      type: 'object',
      additionalProperties: false,
      required: ['form', 'maxRows'],
      properties: {
        form: { type: 'string', enum: ['TABLE', 'KPI', 'CHART'] },
        maxRows: { type: 'integer', minimum: 1, maximum: 10000 },
      },
    },
    assumptions: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string', maxLength: 512 },
    },
    ambiguityAlternatives: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description'],
        properties: {
          name: { type: 'string', maxLength: 128 },
          description: { type: 'string', maxLength: 512 },
        },
      },
    },
    rationale: { type: 'string', maxLength: 1024 },
  },
});

export function openaiAnalysisTextFormatV1() {
  return Object.freeze({
    format: Object.freeze({
      type: 'json_schema' as const,
      name: OPENAI_ANALYSIS_SCHEMA_NAME,
      strict: true as const,
      schema: OPENAI_ANALYSIS_OUTPUT_JSON_SCHEMA,
    }),
  });
}

export const OPENAI_TABLE_OUTPUT_SCHEMA_V1 = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['profileVersion', 'pageCount', 'columns', 'cells'],
  properties: Object.freeze({
    profileVersion: Object.freeze({ const: 'TABLE_V1' }),
    pageCount: Object.freeze({ type: 'integer', minimum: 1, maximum: 20 }),
    columns: Object.freeze({
      type: 'array',
      maxItems: 100,
      items: Object.freeze({ type: 'string', minLength: 1, maxLength: 128 }),
    }),
    cells: Object.freeze({
      type: 'array',
      maxItems: 10_000,
      items: Object.freeze({
        type: 'object',
        additionalProperties: false,
        required: ['row', 'column', 'text', 'confidence', 'evidence'],
        properties: Object.freeze({
          row: Object.freeze({ type: 'integer', minimum: 0 }),
          column: Object.freeze({ type: 'integer', minimum: 0 }),
          text: Object.freeze({ type: 'string', minLength: 1, maxLength: 500 }),
          confidence: Object.freeze({ type: 'number', minimum: 0, maximum: 1 }),
          evidence: Object.freeze({
            type: 'object',
            additionalProperties: false,
            required: ['page', 'x', 'y', 'width', 'height'],
            properties: Object.freeze({
              page: Object.freeze({ type: 'integer', minimum: 1 }),
              x: Object.freeze({ type: 'number' }),
              y: Object.freeze({ type: 'number' }),
              width: Object.freeze({ type: 'number' }),
              height: Object.freeze({ type: 'number' }),
            }),
          }),
        }),
      }),
    }),
  }),
});

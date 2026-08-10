/** Strict structured-output schema for OpenAI receipt extraction (ADR-0005). */

export const OPENAI_RECEIPT_SCHEMA_NAME = 'dda_receipt_candidate_v1';
export const OPENAI_RECEIPT_SCHEMA_VERSION = 'dda-receipt-candidate.v1';

const coordinateSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['page', 'x', 'y', 'width', 'height'],
  properties: {
    page: { type: 'integer', minimum: 1 },
    x: { type: 'number', minimum: 0, maximum: 1 },
    y: { type: 'number', minimum: 0, maximum: 1 },
    width: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
    height: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
  },
});

const fieldSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'sourceValue',
    'normalizedValue',
    'confidence',
    'confidenceBasis',
    'evidenceCoordinates',
  ],
  properties: {
    sourceValue: { type: 'string', maxLength: 256 },
    normalizedValue: { type: ['string', 'null'], maxLength: 256 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    confidenceBasis: {
      type: 'string',
      enum: ['model_token_logprob_proxy', 'model_self_reported', 'unknown'],
    },
    evidenceCoordinates: coordinateSchema,
  },
});

const lineItemSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['description', 'amountSource', 'amountNormalized', 'evidenceCoordinates'],
  properties: {
    description: { type: 'string', maxLength: 256 },
    amountSource: { type: 'string', maxLength: 64 },
    amountNormalized: { type: ['string', 'null'], maxLength: 64 },
    evidenceCoordinates: coordinateSchema,
  },
});

export const OPENAI_RECEIPT_OUTPUT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'merchant',
    'transactionDate',
    'transactionTime',
    'currency',
    'subtotal',
    'tax',
    'total',
    'paymentMethod',
    'paymentReference',
    'lineItems',
  ],
  properties: {
    merchant: fieldSchema,
    transactionDate: fieldSchema,
    transactionTime: {
      anyOf: [fieldSchema, { type: 'null' }],
    },
    currency: fieldSchema,
    subtotal: fieldSchema,
    tax: fieldSchema,
    total: fieldSchema,
    paymentMethod: {
      anyOf: [fieldSchema, { type: 'null' }],
    },
    paymentReference: {
      anyOf: [fieldSchema, { type: 'null' }],
    },
    lineItems: {
      type: 'array',
      maxItems: 40,
      items: lineItemSchema,
    },
  },
});

export interface OpenAiReceiptCoordinateV1 {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface OpenAiReceiptFieldV1 {
  readonly sourceValue: string;
  readonly normalizedValue: string | null;
  readonly confidence: number;
  readonly confidenceBasis: 'model_token_logprob_proxy' | 'model_self_reported' | 'unknown';
  readonly evidenceCoordinates: OpenAiReceiptCoordinateV1;
}

export interface OpenAiReceiptLineItemV1 {
  readonly description: string;
  readonly amountSource: string;
  readonly amountNormalized: string | null;
  readonly evidenceCoordinates: OpenAiReceiptCoordinateV1;
}

export interface OpenAiReceiptStructuredOutputV1 {
  readonly merchant: OpenAiReceiptFieldV1;
  readonly transactionDate: OpenAiReceiptFieldV1;
  readonly transactionTime: OpenAiReceiptFieldV1 | null;
  readonly currency: OpenAiReceiptFieldV1;
  readonly subtotal: OpenAiReceiptFieldV1;
  readonly tax: OpenAiReceiptFieldV1;
  readonly total: OpenAiReceiptFieldV1;
  readonly paymentMethod: OpenAiReceiptFieldV1 | null;
  readonly paymentReference: OpenAiReceiptFieldV1 | null;
  readonly lineItems: readonly OpenAiReceiptLineItemV1[];
}

export function openaiReceiptTextFormatV1(): {
  readonly format: {
    readonly type: 'json_schema';
    readonly name: string;
    readonly strict: true;
    readonly schema: typeof OPENAI_RECEIPT_OUTPUT_JSON_SCHEMA;
  };
} {
  return Object.freeze({
    format: Object.freeze({
      type: 'json_schema' as const,
      name: OPENAI_RECEIPT_SCHEMA_NAME,
      strict: true as const,
      schema: OPENAI_RECEIPT_OUTPUT_JSON_SCHEMA,
    }),
  });
}

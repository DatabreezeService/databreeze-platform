/** Re-export canonical OpenAI receipt structured-output schema (shared with evaluators). */

export {
  OPENAI_RECEIPT_OUTPUT_JSON_SCHEMA,
  OPENAI_RECEIPT_SCHEMA_NAME,
  OPENAI_RECEIPT_SCHEMA_VERSION,
  openaiReceiptTextFormatV1,
  type OpenAiReceiptCoordinateV1,
  type OpenAiReceiptFieldV1,
  type OpenAiReceiptLineItemV1,
  type OpenAiReceiptStructuredOutputV1,
} from '@databreeze/domain/dda-receipt-openai/v1';

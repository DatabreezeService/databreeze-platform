import {
  createOfficialOpenAiResponsesTransport,
  OpenAiProviderError,
  OpenAiResponsesClient,
  type OpenAiResponsesTransport,
  type OpenAiResponsesTransportResult,
} from '../../ai/adapter/openai-responses.client.js';
import type {
  ReceiptOcrField,
  ReceiptOcrPort,
  ReceiptOcrRequest,
  ReceiptOcrResult,
} from '../application/receipt-ocr.port.js';
import {
  loadOpenAiReceiptOcrConfig,
  type OpenAiReceiptOcrConfig,
} from './openai-receipt-ocr.config.js';
import {
  openaiReceiptTextFormatV1,
  type OpenAiReceiptFieldV1,
  type OpenAiReceiptStructuredOutputV1,
} from './openai-receipt-output.schema.js';
import { buildOpenAiReceiptPromptV1 } from './openai-receipt-prompt.js';
import {
  preprocessReceiptImageV1,
  toReceiptImageDataUrlV1,
} from './receipt-image-preprocessing.js';

export {
  loadOpenAiReceiptOcrConfig,
  type OpenAiReceiptOcrConfig,
  OPENAI_RECEIPT_PINNED_MODEL,
} from './openai-receipt-ocr.config.js';

export interface OpenAiReceiptOcrAdapterOptions {
  readonly transport?: OpenAiResponsesTransport;
  readonly client?: OpenAiResponsesClient;
  readonly nowMs?: () => number;
  readonly correlationId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coordinateValid(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const page = value['page'];
  const x = value['x'];
  const y = value['y'];
  const width = value['width'];
  const height = value['height'];
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) return false;
  if (typeof x !== 'number' || typeof y !== 'number') return false;
  if (typeof width !== 'number' || typeof height !== 'number') return false;
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return false;
  if (x + width > 1.0000001 || y + height > 1.0000001) return false;
  return true;
}

function fieldValid(value: unknown): value is OpenAiReceiptFieldV1 {
  if (!isRecord(value)) return false;
  if (typeof value['sourceValue'] !== 'string') return false;
  if (value['normalizedValue'] !== null && typeof value['normalizedValue'] !== 'string') {
    return false;
  }
  if (typeof value['confidence'] !== 'number') return false;
  if (value['confidence'] < 0 || value['confidence'] > 1) return false;
  const basis = value['confidenceBasis'];
  if (
    basis !== 'model_token_logprob_proxy' &&
    basis !== 'model_self_reported' &&
    basis !== 'unknown'
  ) {
    return false;
  }
  return coordinateValid(value['evidenceCoordinates']);
}

function parseStructuredOutput(raw: unknown): OpenAiReceiptStructuredOutputV1 {
  if (!isRecord(raw)) throw new OpenAiProviderError('OPENAI_SCHEMA');
  const required = [
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
  ] as const;
  for (const key of required) {
    if (!(key in raw)) throw new OpenAiProviderError('OPENAI_SCHEMA');
  }
  for (const key of Object.keys(raw)) {
    if (!(required as readonly string[]).includes(key)) {
      throw new OpenAiProviderError('OPENAI_SCHEMA');
    }
  }
  for (const key of [
    'merchant',
    'transactionDate',
    'currency',
    'subtotal',
    'tax',
    'total',
  ] as const) {
    if (!fieldValid(raw[key])) throw new OpenAiProviderError('OPENAI_SCHEMA');
  }
  if (raw['transactionTime'] !== null && !fieldValid(raw['transactionTime'])) {
    throw new OpenAiProviderError('OPENAI_SCHEMA');
  }
  if (raw['paymentMethod'] !== null && !fieldValid(raw['paymentMethod'])) {
    throw new OpenAiProviderError('OPENAI_SCHEMA');
  }
  if (raw['paymentReference'] !== null && !fieldValid(raw['paymentReference'])) {
    throw new OpenAiProviderError('OPENAI_SCHEMA');
  }
  if (!Array.isArray(raw['lineItems']) || raw['lineItems'].length > 40) {
    throw new OpenAiProviderError('OPENAI_SCHEMA');
  }
  for (const item of raw['lineItems']) {
    if (!isRecord(item)) throw new OpenAiProviderError('OPENAI_SCHEMA');
    if (typeof item['description'] !== 'string') throw new OpenAiProviderError('OPENAI_SCHEMA');
    if (typeof item['amountSource'] !== 'string') throw new OpenAiProviderError('OPENAI_SCHEMA');
    if (item['amountNormalized'] !== null && typeof item['amountNormalized'] !== 'string') {
      throw new OpenAiProviderError('OPENAI_SCHEMA');
    }
    if (!coordinateValid(item['evidenceCoordinates'])) {
      throw new OpenAiProviderError('OPENAI_SCHEMA');
    }
  }
  return raw as unknown as OpenAiReceiptStructuredOutputV1;
}

function extractOutputText(response: OpenAiResponsesTransportResult): string {
  if (response.status === 'incomplete') throw new OpenAiProviderError('OPENAI_INCOMPLETE');
  const output = response.output;
  if (!Array.isArray(output) || output.length === 0) {
    throw new OpenAiProviderError('OPENAI_SCHEMA');
  }
  for (const item of output) {
    if (!isRecord(item)) throw new OpenAiProviderError('OPENAI_SCHEMA');
    const type = item['type'];
    if (type === 'refusal') throw new OpenAiProviderError('OPENAI_REFUSAL');
    if (type === 'function_call' || type === 'tool_call' || type === 'web_search_call') {
      throw new OpenAiProviderError('OPENAI_UNSAFE_CONFIGURATION');
    }
    if (type !== 'message') throw new OpenAiProviderError('OPENAI_SCHEMA');
    const content = item['content'];
    if (!Array.isArray(content)) throw new OpenAiProviderError('OPENAI_SCHEMA');
    for (const part of content) {
      if (!isRecord(part)) throw new OpenAiProviderError('OPENAI_SCHEMA');
      if (part['type'] === 'refusal') throw new OpenAiProviderError('OPENAI_REFUSAL');
      if (part['type'] === 'output_text' && typeof part['text'] === 'string') {
        return part['text'];
      }
    }
  }
  throw new OpenAiProviderError('OPENAI_SCHEMA');
}

function toDomainFields(parsed: OpenAiReceiptStructuredOutputV1): readonly ReceiptOcrField[] {
  const fields: ReceiptOcrField[] = [];
  const push = (field: string, value: OpenAiReceiptFieldV1 | null, preferNormalized = true) => {
    if (!value) return;
    const text = preferNormalized
      ? (value.normalizedValue ?? value.sourceValue)
      : value.sourceValue;
    fields.push(
      Object.freeze({
        field,
        value: text,
        confidence: Math.round(value.confidence * 100),
        evidenceCoordinates: Object.freeze({ ...value.evidenceCoordinates }),
      }),
    );
  };
  push('merchant', parsed.merchant, false);
  const dateValue = parsed.transactionDate.normalizedValue ?? parsed.transactionDate.sourceValue;
  const timeValue = parsed.transactionTime
    ? (parsed.transactionTime.normalizedValue ?? parsed.transactionTime.sourceValue)
    : undefined;
  fields.push(
    Object.freeze({
      field: 'transactionDateTime',
      value: timeValue ? `${dateValue}T${timeValue}` : dateValue,
      confidence: Math.round(parsed.transactionDate.confidence * 100),
      evidenceCoordinates: Object.freeze({ ...parsed.transactionDate.evidenceCoordinates }),
    }),
  );
  push('currency', parsed.currency);
  push('subtotal', parsed.subtotal);
  push('tax', parsed.tax);
  push('total', parsed.total);
  push('paymentMethod', parsed.paymentMethod, false);
  push('paymentReference', parsed.paymentReference, false);
  parsed.lineItems.forEach((item, index) => {
    fields.push(
      Object.freeze({
        field: `lineItem.${index}.description`,
        value: item.description,
        confidence: 0,
        evidenceCoordinates: Object.freeze({ ...item.evidenceCoordinates }),
      }),
    );
    fields.push(
      Object.freeze({
        field: `lineItem.${index}.amount`,
        value: item.amountNormalized ?? item.amountSource,
        confidence: 0,
        evidenceCoordinates: Object.freeze({ ...item.evidenceCoordinates }),
      }),
    );
  });
  return Object.freeze(fields);
}

/**
 * Server-side OpenAI Responses adapter behind the provider-neutral OCR port.
 * Fails closed without credentials or when the kill switch is off (ADR-0005).
 */
export class OpenAiReceiptOcrAdapter implements ReceiptOcrPort {
  public readonly requiresCloudEgress = true as const;
  readonly #config: OpenAiReceiptOcrConfig;
  readonly #client: OpenAiResponsesClient | undefined;
  readonly #correlationId: string;

  public constructor(
    config: OpenAiReceiptOcrConfig = loadOpenAiReceiptOcrConfig(),
    options: OpenAiReceiptOcrAdapterOptions = {},
  ) {
    this.#config = config;
    this.#correlationId = options.correlationId ?? 'receipt-ocr';
    if (options.client) {
      this.#client = options.client;
    } else if (config.apiKey !== undefined && config.enabled) {
      const transport =
        options.transport ??
        createOfficialOpenAiResponsesTransport({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
        });
      this.#client = new OpenAiResponsesClient({
        apiKey: config.apiKey,
        model: config.modelSnapshot,
        baseUrl: config.baseUrl,
        transport,
        ...(options.nowMs ? { nowMs: options.nowMs } : {}),
      });
    } else {
      this.#client = undefined;
    }
  }

  /** Test/inspection helper: build the request payload without network I/O. */
  public buildRequest(request: ReceiptOcrRequest): {
    readonly model: string;
    readonly store: false;
    readonly tools: readonly unknown[];
    readonly maxOutputTokens: number;
    readonly text: ReturnType<typeof openaiReceiptTextFormatV1>;
    readonly input: readonly unknown[];
    readonly preprocessingVersion: string;
    readonly promptVersion: string;
    readonly schemaVersion: string;
    readonly detail: string;
  } {
    if (this.#config.store !== false || this.#config.toolsEnabled !== false) {
      throw new OpenAiProviderError('OPENAI_UNSAFE_CONFIGURATION');
    }
    const processed = preprocessReceiptImageV1({
      bytes: request.imageBytes,
      mediaType: request.mediaType,
      detail: this.#config.imageDetail,
      modelSnapshot: this.#config.modelSnapshot,
    });
    const prompt = buildOpenAiReceiptPromptV1({
      coordinateSpace: processed.coordinateSpace,
      preprocessingVersion: processed.preprocessingVersion,
    });
    const dataUrl = toReceiptImageDataUrlV1({
      mediaType: processed.mediaType,
      bytes: processed.bytes,
    });
    return Object.freeze({
      model: this.#config.modelSnapshot,
      store: false as const,
      tools: Object.freeze([]),
      maxOutputTokens: this.#config.maxOutputTokens,
      text: openaiReceiptTextFormatV1(),
      preprocessingVersion: processed.preprocessingVersion,
      promptVersion: prompt.promptVersion,
      schemaVersion: this.#config.schemaVersion,
      detail: processed.detail,
      input: Object.freeze([
        Object.freeze({
          role: 'system',
          content: Object.freeze([Object.freeze({ type: 'input_text', text: prompt.systemText })]),
        }),
        Object.freeze({
          role: 'user',
          content: Object.freeze([
            Object.freeze({ type: 'input_text', text: prompt.userText }),
            Object.freeze({
              type: 'input_image',
              image_url: dataUrl,
              detail: processed.detail,
            }),
          ]),
        }),
      ]),
    });
  }

  public async extract(request: ReceiptOcrRequest): Promise<ReceiptOcrResult> {
    if (!this.#config.enabled || this.#config.apiKey === undefined || !this.#client) {
      throw new OpenAiProviderError('OPENAI_CREDENTIAL');
    }
    const built = this.buildRequest(request);
    const created = await this.#client.createResponse({
      correlationId: this.#correlationId,
      timeoutMs: this.#config.timeoutMs,
      store: false,
      tools: [],
      input: built.input,
      text: built.text,
      maxOutputTokens: built.maxOutputTokens,
      adapterVersion: this.#config.adapterVersion,
      promptVersion: built.promptVersion,
      schemaVersion: built.schemaVersion,
      preprocessingVersion: built.preprocessingVersion,
    });
    if (!created.response.model || created.response.model.trim() === '') {
      throw new OpenAiProviderError('OPENAI_SCHEMA');
    }
    const text = extractOutputText(created.response);
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      throw new OpenAiProviderError('OPENAI_SCHEMA');
    }
    const parsed = parseStructuredOutput(json);
    return Object.freeze({
      adapterVersion: this.#config.adapterVersion,
      modelVersion: created.response.model,
      promptVersion: built.promptVersion,
      schemaVersion: built.schemaVersion,
      preprocessingVersion: built.preprocessingVersion,
      fields: toDomainFields(parsed),
    });
  }
}

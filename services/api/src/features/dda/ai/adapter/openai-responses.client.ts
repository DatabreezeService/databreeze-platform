import OpenAI from 'openai';

import { OpenAiProviderError, type OpenAiProviderErrorCode } from './openai-provider.error.js';
import { latencyBucket, type OpenAiContentSafeMetadataV1 } from './openai-provider-metadata.js';

export { OpenAiProviderError } from './openai-provider.error.js';
export type { OpenAiContentSafeMetadataV1 } from './openai-provider-metadata.js';

const ALLOWED_BASE_URLS = new Set(['https://api.openai.com/v1']);

export interface OpenAiResponsesTransportResult {
  readonly id?: string;
  readonly model?: string;
  readonly status?: string;
  readonly output?: readonly unknown[];
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
  };
  readonly error?: { readonly message?: string; readonly code?: string };
}

export interface OpenAiResponsesTransport {
  create(input: {
    readonly model: string;
    readonly store: false;
    readonly tools: readonly unknown[];
    readonly input: readonly unknown[];
    readonly background?: false;
    readonly text?: unknown;
    readonly max_output_tokens?: number;
    readonly signal?: AbortSignal;
  }): Promise<OpenAiResponsesTransportResult>;
}

export interface OpenAiResponsesClientOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly transport: OpenAiResponsesTransport;
  readonly nowMs?: () => number;
}

export interface OpenAiCreateResponseInput {
  readonly correlationId: string;
  readonly timeoutMs: number;
  readonly store: boolean;
  readonly tools: readonly unknown[];
  readonly input: readonly unknown[];
  readonly background?: boolean;
  readonly text?: unknown;
  readonly maxOutputTokens?: number;
  readonly adapterVersion?: string;
  readonly promptVersion?: string;
  readonly schemaVersion?: string;
  readonly preprocessingVersion?: string;
}

export interface OpenAiCreateResponseResult {
  readonly response: OpenAiResponsesTransportResult;
  readonly metadata: OpenAiContentSafeMetadataV1;
}

function normalizeProviderFailure(error: unknown): OpenAiProviderError {
  if (error instanceof OpenAiProviderError) return error;
  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : undefined;
  const name =
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as { name?: unknown }).name === 'string'
      ? (error as { name: string }).name
      : undefined;
  if (status === 401 || status === 403) {
    return new OpenAiProviderError(status === 401 ? 'OPENAI_CREDENTIAL' : 'OPENAI_AUTHORIZATION');
  }
  if (status === 429) return new OpenAiProviderError('OPENAI_RATE_LIMIT');
  if (status === 402) return new OpenAiProviderError('OPENAI_BUDGET');
  if (name === 'AbortError' || status === 408) return new OpenAiProviderError('OPENAI_TIMEOUT');
  if (status !== undefined && status >= 500) return new OpenAiProviderError('OPENAI_TRANSIENT');
  return new OpenAiProviderError('OPENAI_TRANSIENT');
}

export class OpenAiResponsesClient {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #transport: OpenAiResponsesTransport;
  readonly #nowMs: () => number;

  public constructor(options: OpenAiResponsesClientOptions) {
    const apiKey = options.apiKey.trim();
    if (apiKey === '') {
      throw new OpenAiProviderError('OPENAI_CREDENTIAL');
    }
    const model = options.model.trim();
    if (model === '') {
      throw new OpenAiProviderError('OPENAI_UNSAFE_CONFIGURATION');
    }
    const baseUrl = options.baseUrl.trim().replace(/\/$/u, '');
    if (!ALLOWED_BASE_URLS.has(baseUrl)) {
      throw new OpenAiProviderError('OPENAI_UNSAFE_CONFIGURATION');
    }
    this.#apiKey = apiKey;
    this.#model = model;
    this.#transport = options.transport;
    this.#nowMs = options.nowMs ?? Date.now;
    void this.#apiKey;
  }

  public async createResponse(
    input: OpenAiCreateResponseInput,
  ): Promise<OpenAiCreateResponseResult> {
    if (input.store !== false || input.background === true || input.tools.length > 0) {
      throw new OpenAiProviderError('OPENAI_UNSAFE_CONFIGURATION');
    }
    if (input.correlationId.trim() === '' || !(input.timeoutMs > 0)) {
      throw new OpenAiProviderError('OPENAI_UNSAFE_CONFIGURATION');
    }

    const started = this.#nowMs();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await this.#transport.create({
        model: this.#model,
        store: false,
        tools: [],
        input: input.input,
        background: false,
        ...(input.text === undefined ? {} : { text: input.text }),
        ...(input.maxOutputTokens === undefined
          ? {}
          : { max_output_tokens: input.maxOutputTokens }),
        signal: controller.signal,
      });
      if (response.status === 'failed' || response.error) {
        throw new OpenAiProviderError('OPENAI_TRANSIENT');
      }
      if (response.status === 'incomplete') {
        throw new OpenAiProviderError('OPENAI_INCOMPLETE');
      }
      const elapsed = Math.max(0, this.#nowMs() - started);
      return Object.freeze({
        response,
        metadata: Object.freeze({
          providerRequestId: response.id,
          returnedModelId: response.model,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
          latencyBucket: latencyBucket(elapsed),
          retryCount: 0,
          adapterVersion: input.adapterVersion,
          promptVersion: input.promptVersion,
          schemaVersion: input.schemaVersion,
          preprocessingVersion: input.preprocessingVersion,
          outcomeCode: 'SUCCEEDED',
        }),
      });
    } catch (error) {
      throw normalizeProviderFailure(error);
    } finally {
      clearTimeout(timer);
    }
  }
}

export type { OpenAiProviderErrorCode };

/** Server-only factory: wires the official OpenAI SDK Responses API behind the injectible transport. */
export function createOfficialOpenAiResponsesTransport(input: {
  readonly apiKey: string;
  readonly baseUrl: string;
}): OpenAiResponsesTransport {
  const client = new OpenAI({
    apiKey: input.apiKey,
    baseURL: input.baseUrl,
  });
  return {
    async create(request) {
      const response = await client.responses.create(
        {
          model: request.model,
          store: false,
          tools: [],
          input: request.input as never,
          ...(request.text === undefined ? {} : { text: request.text as never }),
          ...(request.max_output_tokens === undefined
            ? {}
            : { max_output_tokens: request.max_output_tokens }),
        },
        request.signal === undefined ? undefined : { signal: request.signal },
      );
      return response as OpenAiResponsesTransportResult;
    },
  };
}

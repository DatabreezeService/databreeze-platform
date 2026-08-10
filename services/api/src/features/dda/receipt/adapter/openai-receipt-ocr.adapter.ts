import type {
  ReceiptOcrPort,
  ReceiptOcrRequest,
  ReceiptOcrResult,
} from '../application/receipt-ocr.port.js';
import {
  loadOpenAiReceiptOcrConfig,
  type OpenAiReceiptOcrConfig,
} from './openai-receipt-ocr.config.js';

export {
  loadOpenAiReceiptOcrConfig,
  type OpenAiReceiptOcrConfig,
} from './openai-receipt-ocr.config.js';

export type OpenAiFetch = (
  input: string,
  init: {
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly body: string;
    readonly signal?: AbortSignal;
  },
) => Promise<Response>;

export interface OpenAiReceiptOcrAdapterOptions {
  readonly fetchImpl?: OpenAiFetch;
  readonly nowMs?: () => number;
}

/**
 * Server-side OpenAI Responses adapter behind the provider-neutral OCR port.
 * Fails closed without credentials or when the kill switch is off (ADR-0005).
 */
export class OpenAiReceiptOcrAdapter implements ReceiptOcrPort {
  public readonly requiresCloudEgress = true as const;
  readonly #config: OpenAiReceiptOcrConfig;
  readonly #fetchImpl: OpenAiFetch;
  readonly #nowMs: () => number;

  public constructor(
    config: OpenAiReceiptOcrConfig = loadOpenAiReceiptOcrConfig(),
    options: OpenAiReceiptOcrAdapterOptions = {},
  ) {
    this.#config = config;
    this.#fetchImpl = options.fetchImpl ?? (globalThis.fetch as OpenAiFetch);
    this.#nowMs = options.nowMs ?? Date.now;
  }

  public async extract(request: ReceiptOcrRequest): Promise<ReceiptOcrResult> {
    if (!this.#config.enabled || this.#config.apiKey === undefined) {
      throw new Error('OPENAI_CREDENTIAL_UNAVAILABLE');
    }
    if (this.#config.store !== false || this.#config.toolsEnabled !== false) {
      throw new Error('OPENAI_UNSAFE_CONFIGURATION');
    }
    if (!(request.imageBytes instanceof Uint8Array) || request.imageBytes.byteLength === 0) {
      throw new Error('OPENAI_UNSAFE_CONFIGURATION');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#config.timeoutMs);
    const started = this.#nowMs();
    try {
      const response = await this.#fetchImpl(`${this.#config.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.#config.modelSnapshot,
          store: false,
          tools: [],
          // Task 3 replaces identifier-only construction with strict image + schema input.
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: [
                    'Extract receipt fields as strict structured output.',
                    `artifactVersionId=${request.artifactVersionId}`,
                    `profileVersionId=${request.profileVersionId}`,
                    `contentSha256=${request.contentSha256}`,
                    `mediaType=${request.mediaType}`,
                    `imageBytes=${request.imageBytes.byteLength}`,
                    `preprocessingVersion=${request.preprocessingVersion}`,
                    `coordinateSpace=${request.coordinateSpace}`,
                    `schemaVersion=${this.#config.schemaVersion}`,
                    `promptVersion=${this.#config.promptVersion}`,
                  ].join('\n'),
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      if (response.status === 429) throw new Error('OPENAI_RATE_LIMITED');
      if (response.status === 401 || response.status === 403) {
        throw new Error('OPENAI_AUTH_FAILED');
      }
      if (!response.ok) throw new Error('OPENAI_PROVIDER_UNAVAILABLE');

      const payload = (await response.json()) as {
        readonly model?: string;
        readonly output_text?: string;
        readonly output?: readonly { readonly content?: readonly { readonly text?: string }[] }[];
      };
      void started;
      void payload;
      // Live structured-output mapping is gated on owner-approved eval corpus + model pin.
      // Without an evaluated mapping, refuse rather than invent fields.
      throw new Error('OPENAI_EVALUATION_REQUIRED');
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') throw new Error('OPENAI_TIMEOUT');
        throw error;
      }
      throw new Error('OPENAI_PROVIDER_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }
}

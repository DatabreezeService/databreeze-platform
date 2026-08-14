import { OpenAiProviderError } from '../../ai/adapter/openai-provider.error.js';

export type ReceiptImageDetailV1 = 'high' | 'low' | 'original';

export interface ReceiptImagePreprocessingResultV1 {
  readonly preprocessingVersion: string;
  readonly coordinateSpace: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly detail: ReceiptImageDetailV1;
  readonly width?: number;
  readonly height?: number;
}

const ALLOWED_MEDIA = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 3_000_000;

/** Models that do not support detail=original must fail closed rather than silently downgrade. */
const ORIGINAL_DETAIL_UNSUPPORTED_MODELS = new Set(['gpt-4o-mini-2024-07-18']);

export function preprocessReceiptImageV1(input: {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly detail: ReceiptImageDetailV1;
  readonly modelSnapshot: string;
  readonly width?: number;
  readonly height?: number;
}): ReceiptImagePreprocessingResultV1 {
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    throw new OpenAiProviderError('OPENAI_UNSAFE_CONFIGURATION');
  }
  if (!ALLOWED_MEDIA.has(input.mediaType)) {
    throw new OpenAiProviderError('OPENAI_UNSAFE_CONFIGURATION');
  }
  if (input.bytes.byteLength > MAX_BYTES) {
    throw new OpenAiProviderError('OPENAI_UNSAFE_CONFIGURATION');
  }
  if (input.detail === 'original' && ORIGINAL_DETAIL_UNSUPPORTED_MODELS.has(input.modelSnapshot)) {
    throw new OpenAiProviderError('OPENAI_UNSAFE_CONFIGURATION');
  }

  // V1 passthrough: no resize/rotation. Versioned so coordinate remapping can evolve.
  return Object.freeze({
    preprocessingVersion: 'receipt-image-passthrough-v1',
    coordinateSpace: 'normalized-unit-square-v1',
    mediaType: input.mediaType,
    bytes: input.bytes,
    detail: input.detail,
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
  });
}

export function toReceiptImageDataUrlV1(input: {
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}): string {
  return `data:${input.mediaType};base64,${Buffer.from(input.bytes).toString('base64')}`;
}

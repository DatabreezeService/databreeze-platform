import type { OpenAiProviderErrorCode } from './openai-provider.error.js';

export type OpenAiOutcomeCode = 'SUCCEEDED' | OpenAiProviderErrorCode;

export interface OpenAiContentSafeMetadataV1 {
  readonly providerRequestId: string | undefined;
  readonly returnedModelId: string | undefined;
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
  readonly latencyBucket: 'lt_250ms' | 'lt_1s' | 'lt_5s' | 'gte_5s';
  readonly retryCount: number;
  readonly adapterVersion: string | undefined;
  readonly promptVersion: string | undefined;
  readonly schemaVersion: string | undefined;
  readonly preprocessingVersion: string | undefined;
  readonly outcomeCode: OpenAiOutcomeCode;
}

export function latencyBucket(elapsedMs: number): OpenAiContentSafeMetadataV1['latencyBucket'] {
  if (elapsedMs < 250) return 'lt_250ms';
  if (elapsedMs < 1_000) return 'lt_1s';
  if (elapsedMs < 5_000) return 'lt_5s';
  return 'gte_5s';
}

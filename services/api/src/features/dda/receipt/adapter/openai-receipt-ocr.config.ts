/** Content-safe OpenAI receipt OCR configuration (ADR-0005). Never log apiKey. */

import type { ReceiptImageDetailV1 } from './receipt-image-preprocessing.js';
import { OPENAI_RECEIPT_PROMPT_VERSION } from './openai-receipt-prompt.js';
import { OPENAI_RECEIPT_SCHEMA_VERSION } from './openai-receipt-output.schema.js';

export interface OpenAiReceiptOcrConfig {
  readonly enabled: boolean;
  readonly apiKeyPresent: boolean;
  readonly apiKey: string | undefined;
  readonly modelSnapshot: string;
  readonly imageDetail: ReceiptImageDetailV1;
  readonly adapterVersion: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly store: false;
  readonly toolsEnabled: false;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
  readonly secretName: string;
}

export type OpenAiReceiptOcrEnv = Readonly<Record<string, string | undefined>>;

/** Pinned cheap development/evaluation baseline (plan 403). */
export const OPENAI_RECEIPT_PINNED_MODEL = 'gpt-4o-mini-2024-07-18';
const DEFAULT_MODEL = OPENAI_RECEIPT_PINNED_MODEL;
const DEFAULT_DETAIL: ReceiptImageDetailV1 = 'high';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const SECRET_NAME = 'databreeze/{env}/openai/api-key';

function parseDetail(raw: string | undefined): ReceiptImageDetailV1 {
  if (raw === 'low' || raw === 'original' || raw === 'high') return raw;
  return DEFAULT_DETAIL;
}

export function loadOpenAiReceiptOcrConfig(
  env: OpenAiReceiptOcrEnv = process.env,
): OpenAiReceiptOcrConfig {
  const rawKey = env['OPENAI_API_KEY'];
  const apiKey = typeof rawKey === 'string' && rawKey.trim() !== '' ? rawKey.trim() : undefined;
  const killSwitchOff = env['DATABREEZE_OPENAI_RECEIPT_ENABLED'] === 'false';
  const rawModel = env['DATABREEZE_OPENAI_RECEIPT_MODEL'];
  const modelSnapshot =
    typeof rawModel === 'string' && rawModel.trim() !== '' ? rawModel.trim() : DEFAULT_MODEL;
  const imageDetail = parseDetail(env['DATABREEZE_OPENAI_IMAGE_DETAIL']);
  const rawBase = env['DATABREEZE_OPENAI_BASE_URL'];
  const baseUrl =
    typeof rawBase === 'string' && rawBase.trim() !== ''
      ? rawBase.trim().replace(/\/$/u, '')
      : DEFAULT_BASE_URL;
  const timeoutRaw = Number.parseInt(env['DATABREEZE_OPENAI_TIMEOUT_MS'] ?? '30000', 10);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 30_000;
  const maxOutRaw = Number.parseInt(env['DATABREEZE_OPENAI_MAX_OUTPUT_TOKENS'] ?? '2048', 10);
  const maxOutputTokens = Number.isFinite(maxOutRaw) && maxOutRaw > 0 ? maxOutRaw : 2048;

  return Object.freeze({
    enabled: apiKey !== undefined && !killSwitchOff,
    apiKeyPresent: apiKey !== undefined,
    apiKey,
    modelSnapshot,
    imageDetail,
    adapterVersion: 'openai-receipt-ocr-2',
    promptVersion: OPENAI_RECEIPT_PROMPT_VERSION,
    schemaVersion: OPENAI_RECEIPT_SCHEMA_VERSION,
    store: false,
    toolsEnabled: false,
    baseUrl,
    timeoutMs,
    maxOutputTokens,
    secretName: SECRET_NAME,
  });
}

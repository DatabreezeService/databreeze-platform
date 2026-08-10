/** Content-safe OpenAI receipt OCR configuration (ADR-0005). Never log apiKey. */

export interface OpenAiReceiptOcrConfig {
  readonly enabled: boolean;
  readonly apiKeyPresent: boolean;
  readonly apiKey: string | undefined;
  readonly modelSnapshot: string;
  readonly adapterVersion: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly store: false;
  readonly toolsEnabled: false;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly secretName: string;
}

export type OpenAiReceiptOcrEnv = Readonly<Record<string, string | undefined>>;

const DEFAULT_MODEL = 'gpt-4.1-mini-2025-04-14';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const SECRET_NAME = 'databreeze/{env}/openai/receipt-ocr';

export function loadOpenAiReceiptOcrConfig(
  env: OpenAiReceiptOcrEnv = process.env,
): OpenAiReceiptOcrConfig {
  const rawKey = env['OPENAI_API_KEY'];
  const apiKey = typeof rawKey === 'string' && rawKey.trim() !== '' ? rawKey.trim() : undefined;
  const killSwitchOff = env['DATABREEZE_OPENAI_RECEIPT_ENABLED'] === 'false';
  const rawModel = env['DATABREEZE_OPENAI_RECEIPT_MODEL'];
  const modelSnapshot =
    typeof rawModel === 'string' && rawModel.trim() !== '' ? rawModel.trim() : DEFAULT_MODEL;
  const rawBase = env['DATABREEZE_OPENAI_BASE_URL'];
  const baseUrl =
    typeof rawBase === 'string' && rawBase.trim() !== ''
      ? rawBase.trim().replace(/\/$/u, '')
      : DEFAULT_BASE_URL;
  const timeoutRaw = Number.parseInt(env['DATABREEZE_OPENAI_TIMEOUT_MS'] ?? '30000', 10);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 30_000;

  return Object.freeze({
    enabled: apiKey !== undefined && !killSwitchOff,
    apiKeyPresent: apiKey !== undefined,
    apiKey,
    modelSnapshot,
    adapterVersion: 'openai-receipt-ocr-1',
    promptVersion: 'receipt-vi-en-v1',
    schemaVersion: 'dda-receipt-candidate.v1',
    store: false,
    toolsEnabled: false,
    baseUrl,
    timeoutMs,
    secretName: SECRET_NAME,
  });
}

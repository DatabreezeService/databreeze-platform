import { parseV4Contract, type BuaEntitlementSummary } from '@databreeze/contracts/v4';

import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

export type EntitlementSummaryV1 = BuaEntitlementSummary;

export interface EntitlementApiOptions {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
}

const ENTITLEMENT_SUMMARY_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/bua-entitlement-summary' as const;

function configuredBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseSummary(value: unknown): EntitlementSummaryV1 {
  const parsed = parseV4Contract<EntitlementSummaryV1>(ENTITLEMENT_SUMMARY_SCHEMA, value);
  if (!parsed.accepted) throw new Error('USAGE_SUMMARY_INVALID');
  const summary = parsed.value;
  if (!isRecord(summary.snapshot) || !isRecord(summary.aiCredits))
    throw new Error('USAGE_SUMMARY_INVALID');
  const { snapshot, aiCredits } = summary;
  if (
    typeof snapshot.planCode !== 'string' ||
    typeof snapshot.status !== 'string' ||
    !isSafeNonNegativeInteger(snapshot.revision) ||
    !Array.isArray(snapshot.quotas) ||
    aiCredits['metric'] !== 'job_count' ||
    !isSafeNonNegativeInteger(aiCredits['limit']) ||
    !isSafeNonNegativeInteger(aiCredits['used']) ||
    !isSafeNonNegativeInteger(aiCredits['reserved']) ||
    !isSafeNonNegativeInteger(aiCredits['remaining']) ||
    aiCredits['remaining'] > aiCredits['limit']
  ) {
    throw new Error('USAGE_SUMMARY_INVALID');
  }
  for (const quota of snapshot.quotas) {
    if (
      !isRecord(quota) ||
      typeof quota['metric'] !== 'string' ||
      !isSafeNonNegativeInteger(quota['limit'])
    )
      throw new Error('USAGE_SUMMARY_INVALID');
  }
  return summary;
}

export async function fetchEntitlementSummary(
  options: EntitlementApiOptions = {},
  signal?: AbortSignal,
): Promise<EntitlementSummaryV1> {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  const fetcher = createSessionAwareFetchV1({
    apiBaseUrl: baseUrl,
    fetcher: options.fetcher ?? globalThis.fetch.bind(globalThis),
  });
  const response = await fetcher(`${baseUrl}/v1/entitlements/summary`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw new Error(`ENTITLEMENT_REQUEST_${response.status}`);
  return parseSummary(await response.json().catch(() => undefined));
}

import type { AnalysisPlanPreviewV1 } from './analysis-plan-review.tsx';
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

export interface AnalysisLiveConfigurationV1 {
  readonly baseUrl: string;
}

export interface AnalysisProposalResultV1 {
  readonly planVersionId: string;
  readonly planPreview: AnalysisPlanPreviewV1;
}

type AnalysisEnvironment = Readonly<Record<string, unknown>>;

function configuredString(environment: AnalysisEnvironment, key: string): string | undefined {
  const value = environment[key];
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim();
}

/**
 * DDA-015: propose live analysis plans through the same-origin API by default.
 *
 * Local HMR and the production gateway intentionally proxy `/v1` from the Web
 * origin, so an absent `VITE_DATABREEZE_API_BASE_URL` is not a missing API. The
 * explicit demo flag is the only mode that disables the live transport.
 */
export function analysisLiveConfiguration(
  environment: AnalysisEnvironment = import.meta.env,
): AnalysisLiveConfigurationV1 | undefined {
  if (environment['VITE_DATABREEZE_DEMO_MODE'] === 'true') return undefined;
  const apiBaseUrl = configuredString(environment, 'VITE_DATABREEZE_API_BASE_URL');
  return Object.freeze({ baseUrl: (apiBaseUrl ?? '').replace(/\/$/u, '') });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlanPreview(value: unknown): value is AnalysisPlanPreviewV1 {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value['datasets']) &&
    typeof value['semanticVersionId'] === 'string' &&
    typeof value['metricVersionId'] === 'string' &&
    Array.isArray(value['dimensions']) &&
    Array.isArray(value['filters']) &&
    isRecord(value['timeRange']) &&
    typeof value['timeGrain'] === 'string' &&
    Array.isArray(value['joins']) &&
    isRecord(value['units']) &&
    Array.isArray(value['assumptions']) &&
    isRecord(value['output']) &&
    isRecord(value['estimate'])
  );
}

export async function proposeAnalysisPlan(input: {
  readonly baseUrl: string;
  readonly question: string;
  readonly signal?: AbortSignal;
}): Promise<AnalysisProposalResultV1> {
  const fetcher = createSessionAwareFetchV1({
    apiBaseUrl: input.baseUrl,
    fetcher: globalThis.fetch.bind(globalThis),
  });
  const init: RequestInit = {
    method: 'POST',
    headers: { Accept: 'application/json', 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      request: { question: input.question },
    }),
  };
  if (input.signal !== undefined) init.signal = input.signal;
  const response = await fetcher(`${input.baseUrl}/v1/dda/analysis/propose`, init);
  if (response.status === 401 || response.status === 403) {
    throw new Error('ANALYSIS_PROPOSAL_UNAUTHORIZED');
  }
  if (!response.ok) throw new Error('ANALYSIS_PROPOSAL_UNAVAILABLE');
  const payload: unknown = await response.json();
  if (
    !isRecord(payload) ||
    payload['accepted'] !== true ||
    !isRecord(payload['value']) ||
    !isRecord(payload['value']['plan']) ||
    typeof payload['value']['plan']['planVersionId'] !== 'string'
  ) {
    throw new Error('ANALYSIS_PROPOSAL_INVALID');
  }
  if (!isPlanPreview(payload['value']['preview'])) throw new Error('ANALYSIS_PROPOSAL_INVALID');
  return Object.freeze({
    planVersionId: payload['value']['plan']['planVersionId'],
    planPreview: Object.freeze(payload['value']['preview']),
  });
}

import type { EtlReviewPageProps } from './etl-review-page.tsx';

export interface EtlLiveConfigurationV1 {
  readonly baseUrl: string;
  readonly proposalId: string;
}

export type EtlProposalReviewV1 = Omit<EtlReviewPageProps, 'locale' | 'beforeSample' | 'afterSample'> & {
  readonly beforeSample: readonly Readonly<Record<string, unknown>>[];
  readonly afterSample: readonly Readonly<Record<string, unknown>>[];
};

type EtlEnvironment = Readonly<Record<string, unknown>>;

function configuredString(environment: EtlEnvironment, key: string): string | undefined {
  const value = environment[key];
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim();
}

/** DDA-006: only load live ETL review with an explicit governed proposal target. */
export function etlLiveConfiguration(
  environment: EtlEnvironment = import.meta.env,
): EtlLiveConfigurationV1 | undefined {
  const apiBaseUrl = configuredString(environment, 'VITE_DATABREEZE_API_BASE_URL');
  const proposalId = configuredString(environment, 'VITE_DATABREEZE_ETL_PROPOSAL_ID');
  if (apiBaseUrl === undefined || proposalId === undefined) return undefined;
  return Object.freeze({
    baseUrl: apiBaseUrl.replace(/\/$/u, ''),
    proposalId,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isEtlProposalReview(value: unknown): value is EtlProposalReviewV1 {
  if (!isRecord(value) || value['accepted'] !== true) return false;
  if (typeof value['state'] !== 'string' || typeof value['evidenceStatus'] !== 'string') return false;
  if (
    !isStringArray(value['sourceSchema']) ||
    !isStringArray(value['inferredSchema']) ||
    !isStringArray(value['targetSchema']) ||
    !isStringArray(value['assumptions']) ||
    !Array.isArray(value['orderedSteps'])
  ) {
    return false;
  }
  if (!isRecord(value['counts']) || !isRecord(value['estimatedCost'])) return false;
  if (
    typeof value['counts']['changed'] !== 'number' ||
    typeof value['counts']['unchanged'] !== 'number' ||
    typeof value['counts']['rejected'] !== 'number' ||
    typeof value['estimatedCost']['cpuMs'] !== 'number' ||
    typeof value['estimatedCost']['memoryMb'] !== 'number'
  ) {
    return false;
  }
  return Array.isArray(value['exclusions']) && Array.isArray(value['unsupportedScopes']) && Array.isArray(value['qualityEffects']);
}

/** Typed client for a configured ETL proposal review. */
export async function fetchEtlProposal(
  configuration: EtlLiveConfigurationV1,
  signal?: AbortSignal,
): Promise<EtlProposalReviewV1> {
  const url = `${configuration.baseUrl}/v1/dda/etl-proposals/${encodeURIComponent(configuration.proposalId)}`;
  const init: RequestInit = {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  };
  if (signal !== undefined) init.signal = signal;
  const response = await globalThis.fetch(url, init);
  if (response.status === 401 || response.status === 403) {
    throw new Error('ETL_PROPOSAL_UNAUTHORIZED');
  }
  if (response.status === 404) throw new Error('ETL_PROPOSAL_NOT_FOUND');
  if (!response.ok) throw new Error('ETL_PROPOSAL_UNAVAILABLE');
  const payload: unknown = await response.json();
  if (!isEtlProposalReview(payload)) throw new Error('ETL_PROPOSAL_INVALID');
  return Object.freeze({
    sourceSchema: Object.freeze([...payload.sourceSchema]),
    inferredSchema: Object.freeze([...payload.inferredSchema]),
    targetSchema: Object.freeze([...payload.targetSchema]),
    orderedSteps: Object.freeze(
      payload.orderedSteps.map((step) =>
        typeof step === 'string'
          ? step
          : isRecord(step) && typeof step['type'] === 'string'
            ? step['type']
            : 'UNKNOWN_STEP',
      ),
    ),
    assumptions: Object.freeze([...payload.assumptions]),
    beforeSample: Object.freeze([] as const),
    afterSample: Object.freeze([] as const),
    counts: Object.freeze({ ...payload.counts }),
    exclusions: Object.freeze([...(payload.exclusions as EtlProposalReviewV1['exclusions'])]),
    unsupportedScopes: Object.freeze([
      ...(payload.unsupportedScopes as EtlProposalReviewV1['unsupportedScopes']),
    ]),
    qualityEffects: Object.freeze([
      ...(payload.qualityEffects as EtlProposalReviewV1['qualityEffects']),
    ]),
    evidenceStatus: payload.evidenceStatus,
    estimatedCost: Object.freeze({ ...payload.estimatedCost }),
    state: payload.state,
  });
}

import type { EtlReviewPageProps } from './etl-review-page.tsx';

export interface EtlLiveConfigurationV1 {
  readonly baseUrl: string;
  readonly proposalId: string;
}

export interface EtlAcceptanceEvidenceV1 {
  readonly revision: number;
  readonly rowCount: number;
  readonly rejectedCount: number;
  readonly contentHash: string;
  readonly schemaHash: string;
  readonly lineageIds: readonly string[];
}

export type EtlProposalReviewV1 = Omit<
  EtlReviewPageProps,
  'locale' | 'beforeSample' | 'afterSample'
> & {
  readonly proposalId: string;
  readonly revision: number;
  readonly beforeSample: readonly Readonly<Record<string, unknown>>[];
  readonly afterSample: readonly Readonly<Record<string, unknown>>[];
  readonly acceptanceEvidence?: EtlAcceptanceEvidenceV1;
};

export interface AcceptEtlProposalInputV1 {
  readonly baseUrl: string;
  readonly proposalId: string;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly expected: {
    readonly rowCount: number;
    readonly rejectedCount: number;
    readonly contentHash: string;
    readonly schemaHash: string;
    readonly lineageIds: readonly string[];
  };
  readonly signal?: AbortSignal;
}

export interface AcceptEtlProposalResultV1 {
  readonly accepted: true;
  readonly proposalId: string;
  readonly datasetVersionId: string;
  readonly replayed: boolean;
}

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

function parseAcceptanceEvidence(value: unknown): EtlAcceptanceEvidenceV1 | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value['revision'] !== 'number' ||
    !Number.isSafeInteger(value['revision']) ||
    value['revision'] < 1
  ) {
    return undefined;
  }
  if (
    typeof value['rowCount'] !== 'number' ||
    !Number.isSafeInteger(value['rowCount']) ||
    value['rowCount'] < 0 ||
    typeof value['rejectedCount'] !== 'number' ||
    !Number.isSafeInteger(value['rejectedCount']) ||
    value['rejectedCount'] < 0 ||
    typeof value['contentHash'] !== 'string' ||
    typeof value['schemaHash'] !== 'string' ||
    !isStringArray(value['lineageIds'])
  ) {
    return undefined;
  }
  return Object.freeze({
    revision: value['revision'],
    rowCount: value['rowCount'],
    rejectedCount: value['rejectedCount'],
    contentHash: value['contentHash'],
    schemaHash: value['schemaHash'],
    lineageIds: Object.freeze([...value['lineageIds']]),
  });
}

function isEtlProposalReview(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || value['accepted'] !== true) return false;
  if (typeof value['proposalId'] !== 'string' || typeof value['state'] !== 'string') return false;
  if (
    typeof value['revision'] !== 'number' ||
    !Number.isSafeInteger(value['revision']) ||
    value['revision'] < 1
  ) {
    return false;
  }
  if (typeof value['evidenceStatus'] !== 'string') return false;
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
  return (
    Array.isArray(value['exclusions']) &&
    Array.isArray(value['unsupportedScopes']) &&
    Array.isArray(value['qualityEffects'])
  );
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
  const acceptanceEvidence = parseAcceptanceEvidence(payload['acceptanceEvidence']);
  return Object.freeze({
    proposalId: payload['proposalId'] as string,
    revision: payload['revision'] as number,
    sourceSchema: Object.freeze([...(payload['sourceSchema'] as string[])]),
    inferredSchema: Object.freeze([...(payload['inferredSchema'] as string[])]),
    targetSchema: Object.freeze([...(payload['targetSchema'] as string[])]),
    orderedSteps: Object.freeze(
      (payload['orderedSteps'] as unknown[]).map((step) =>
        typeof step === 'string'
          ? step
          : isRecord(step) && typeof step['type'] === 'string'
            ? step['type']
            : 'UNKNOWN_STEP',
      ),
    ),
    assumptions: Object.freeze([...(payload['assumptions'] as string[])]),
    beforeSample: Object.freeze([] as const),
    afterSample: Object.freeze([] as const),
    counts: Object.freeze({ ...(payload['counts'] as EtlProposalReviewV1['counts']) }),
    exclusions: Object.freeze([...(payload['exclusions'] as EtlProposalReviewV1['exclusions'])]),
    unsupportedScopes: Object.freeze([
      ...(payload['unsupportedScopes'] as EtlProposalReviewV1['unsupportedScopes']),
    ]),
    qualityEffects: Object.freeze([
      ...(payload['qualityEffects'] as EtlProposalReviewV1['qualityEffects']),
    ]),
    evidenceStatus: payload['evidenceStatus'] as string,
    estimatedCost: Object.freeze({
      ...(payload['estimatedCost'] as EtlProposalReviewV1['estimatedCost']),
    }),
    state: payload['state'] as string,
    ...(acceptanceEvidence === undefined ? {} : { acceptanceEvidence }),
  });
}

/** DDA-007: Accept stays disabled until live hashes exist; never invent evidence. */
export function etlAcceptEnabled(input: {
  readonly tenantConfigured: boolean;
  readonly configuration: EtlLiveConfigurationV1 | undefined;
  readonly proposal: EtlProposalReviewV1 | undefined;
}): boolean {
  return (
    input.tenantConfigured &&
    input.configuration !== undefined &&
    input.proposal?.state === 'READY_FOR_ACCEPTANCE' &&
    input.proposal.acceptanceEvidence !== undefined
  );
}

/** DDA-004/007: accept only with server-owned tenant context and evidence hashes. */
export async function acceptEtlProposal(
  input: AcceptEtlProposalInputV1,
): Promise<AcceptEtlProposalResultV1> {
  const init: RequestInit = {
    method: 'POST',
    headers: { Accept: 'application/json', 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      proposalId: input.proposalId,
      expectedRevision: input.expectedRevision,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      expected: input.expected,
    }),
  };
  if (input.signal !== undefined) init.signal = input.signal;
  const response = await globalThis.fetch(`${input.baseUrl}/v1/dda/etl-acceptances`, init);
  if (response.status === 401 || response.status === 403) {
    throw new Error('ETL_ACCEPT_UNAUTHORIZED');
  }
  if (response.status === 400) throw new Error('ETL_ACCEPT_INVALID');
  if (response.status === 409) throw new Error('ETL_ACCEPT_CONFLICT');
  if (!response.ok) throw new Error('ETL_ACCEPT_UNAVAILABLE');
  const payload: unknown = await response.json();
  if (
    !isRecord(payload) ||
    payload['accepted'] !== true ||
    typeof payload['proposalId'] !== 'string' ||
    typeof payload['datasetVersionId'] !== 'string' ||
    typeof payload['replayed'] !== 'boolean'
  ) {
    throw new Error('ETL_ACCEPT_INVALID');
  }
  return Object.freeze({
    accepted: true as const,
    proposalId: payload['proposalId'],
    datasetVersionId: payload['datasetVersionId'],
    replayed: payload['replayed'],
  });
}

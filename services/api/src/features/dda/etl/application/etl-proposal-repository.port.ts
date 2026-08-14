import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { EtlAcceptanceIdempotencyPortV1 } from './etl-acceptance-idempotency.port.js';

export const ETL_PROPOSAL_REPOSITORY_PORT = Symbol('ETL_PROPOSAL_REPOSITORY_PORT');

export type EtlProposalStateV1 = 'NEEDS_REVIEW' | 'READY_FOR_ACCEPTANCE' | 'ACCEPTED' | 'REJECTED';

export interface EtlQualityEffectV1 {
  readonly dimension:
    | 'completeness'
    | 'validity'
    | 'uniqueness'
    | 'consistency'
    | 'freshness'
    | 'extraction_confidence';
  readonly denominator: number;
  readonly coverage: number;
  readonly rule: string;
  readonly expectation: string;
  readonly sampleState: 'FULL' | 'PARTIAL' | 'NONE';
  readonly limitations: readonly string[];
  readonly completeGateEligible: boolean;
}

export interface EtlReviewContextV1 {
  readonly sourceSchema: readonly string[];
  readonly inferredSchema: readonly string[];
  readonly targetSchema: readonly string[];
  readonly assumptions: readonly string[];
  readonly beforeSample: readonly Readonly<Record<string, unknown>>[];
  readonly afterSample: readonly Readonly<Record<string, unknown>>[];
  readonly counts: {
    readonly changed: number;
    readonly unchanged: number;
    readonly rejected: number;
  };
  readonly exclusions: readonly {
    readonly scope: string;
    readonly reasonCode: string;
    readonly count: number;
  }[];
  readonly unsupportedScopes: readonly {
    readonly scope: string;
    readonly reasonCode: string;
    readonly count: number;
  }[];
  readonly sampling: {
    readonly disclosed: boolean;
    readonly method: 'HEAD';
    readonly seed: number;
    readonly rowCount: number;
  };
  readonly qualityEffects: readonly EtlQualityEffectV1[];
  readonly evidenceStatus: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
  readonly estimatedCost: { readonly cpuMs: number; readonly memoryMb: number };
  readonly aiSuggestions: readonly {
    readonly label: string;
    readonly authoritative: false;
    readonly summary: string;
  }[];
  readonly driftSignals?: readonly string[];
  readonly overallQualitySummary?: {
    readonly formula: string;
    readonly weights: Readonly<Record<string, number>>;
    readonly missingDimensionBehavior: string;
    readonly coverage: number;
    readonly provesFactualCorrectness: false;
  };
}

export interface EtlProposalRecordV1 {
  readonly proposalId: string;
  readonly revision: number;
  readonly state: EtlProposalStateV1;
  readonly blockingReasons: readonly string[];
  readonly plan: unknown;
  readonly review: EtlReviewContextV1;
  readonly createdAt: string;
  /** Required for durable Prisma persistence; optional for legacy in-memory tests. */
  readonly tenantScope?: TenantScopeV1;
}

export interface EtlProposalRepositoryPortV1 extends EtlAcceptanceIdempotencyPortV1 {
  save(record: EtlProposalRecordV1): Promise<EtlProposalRecordV1>;
  /** HTTP callers must provide the trusted scope; the optional form preserves legacy service composition. */
  findById(
    proposalId: string,
    tenantScope?: TenantScopeV1,
  ): Promise<EtlProposalRecordV1 | undefined>;
  update(record: EtlProposalRecordV1): Promise<EtlProposalRecordV1>;
}

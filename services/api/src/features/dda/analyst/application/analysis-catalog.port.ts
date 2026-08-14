import type { StableIdentifierV1, TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export const ANALYSIS_CATALOG_AUTHORITY_PORT = Symbol('ANALYSIS_CATALOG_AUTHORITY_PORT');

export type AnalysisNonAnswerReasonV1 =
  | 'AMBIGUOUS_REQUEST'
  | 'INSUFFICIENT_DATA'
  | 'UNAUTHORIZED_DATA'
  | 'STALE_INPUT'
  | 'QUALITY_BLOCKED'
  | 'SOURCE_UNAVAILABLE'
  | 'UNSUPPORTED_PLAN'
  | 'BUDGET_DENIED'
  | 'ADAPTER_UNAVAILABLE';

/** Metadata-only catalog used to constrain a typed proposal. It contains no source rows. */
export interface AnalysisCatalogV1 {
  readonly datasetVersionId: string;
  readonly semanticVersionId: string;
  readonly metricVersionId: string;
  readonly permissionProjectionVersionId: string;
  readonly authorizedFields: readonly string[];
  readonly authorizedJoins: readonly string[];
  readonly units: Readonly<Record<string, string>>;
  readonly grains: readonly string[];
  readonly blockedReason?: AnalysisNonAnswerReasonV1;
}

/** The authority-bound catalog returned only after tenant/member/version checks. */
export interface AnalysisCatalogAuthoritySnapshotV1 extends AnalysisCatalogV1 {
  readonly tenantScope: TenantScopeV1;
  readonly memberId: StableIdentifierV1;
  readonly authorizationEpoch: number;
  readonly versionState: 'CURRENT' | 'STALE';
}

export interface AnalysisCatalogRequestV1 {
  readonly datasetVersionId: unknown;
  readonly semanticVersionId: unknown;
  readonly metricVersionId: unknown;
  readonly permissionProjectionVersionId: unknown;
  readonly memberId?: unknown;
}

/** Canonical IDs passed to the server-side authority after request validation. */
export interface AnalysisCatalogAuthorityRequestV1 {
  readonly datasetVersionId: StableIdentifierV1;
  readonly semanticVersionId: StableIdentifierV1;
  readonly metricVersionId: StableIdentifierV1;
  readonly permissionProjectionVersionId: StableIdentifierV1;
  readonly memberId: StableIdentifierV1;
}

export type AnalysisCatalogAuthorityStatusV1 =
  | 'AUTHORIZED'
  | 'NOT_FOUND'
  | 'RESTRICTED'
  | 'STALE'
  | 'UNAVAILABLE';

export type AnalysisCatalogAuthorityResultV1 =
  | {
      readonly status: 'AUTHORIZED';
      readonly catalog: AnalysisCatalogAuthoritySnapshotV1;
    }
  | { readonly status: Exclude<AnalysisCatalogAuthorityStatusV1, 'AUTHORIZED'> };

/** DSM/IAM/permission authority facade. Implementations must resolve fresh state per request. */
export interface AnalysisCatalogAuthorityPortV1 {
  load(
    context: IamTenantContextV1,
    request: AnalysisCatalogAuthorityRequestV1,
  ): Promise<AnalysisCatalogAuthorityResultV1>;
}

export type AnalysisCatalogResolutionResultV1 =
  | { readonly accepted: true; readonly value: AnalysisCatalogAuthoritySnapshotV1 }
  | { readonly accepted: false; readonly code: AnalysisNonAnswerReasonV1 };

export interface AnalysisCatalogResolverV1 {
  resolve(
    context: IamTenantContextV1,
    request: AnalysisCatalogRequestV1,
  ): Promise<AnalysisCatalogResolutionResultV1>;
}

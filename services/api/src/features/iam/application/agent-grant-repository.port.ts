import type {
  AgentGrantLevelV1,
  MembershipAccessPresetV1,
} from '@databreeze/domain/permissions/v1';
import type {
  StableIdentifierV1,
  StrictUtcTimestampV1,
  TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from './tenant-context.js';

export const AGENT_GRANT_REPOSITORY_PORT = Symbol('AGENT_GRANT_REPOSITORY_PORT');

export interface WorkspaceAgentGrantRecordV1 {
  readonly id: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1 & { readonly scopeType: 'workspace' };
  readonly memberId: StableIdentifierV1;
  readonly level: AgentGrantLevelV1;
  readonly revision: number;
  readonly updatedAt: StrictUtcTimestampV1;
}

export interface WorkspaceDatasetRestrictionRecordV1 {
  readonly memberId: StableIdentifierV1;
  readonly deniedDatasetIds: readonly StableIdentifierV1[];
  readonly revision: number;
  readonly updatedAt: StrictUtcTimestampV1;
}

export type AgentGrantDatasetTargetValidationResultV1 =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly code: 'NOT_FOUND' | 'UNAVAILABLE' };

/** IAM-owned seam for a DSM-backed exact-workspace dataset catalog check. */
export interface AgentGrantDatasetTargetValidationPortV1 {
  validate(
    context: IamTenantContextV1,
    datasetIds: readonly StableIdentifierV1[],
  ): Promise<AgentGrantDatasetTargetValidationResultV1>;
}

/**
 * Effective workspace authorization epoch used by IAM decisions and cache/session freshness.
 * This is deliberately distinct from UserIdentity.securityEpoch.
 */
export interface WorkspaceAuthorizationEpochResolverPortV1 {
  resolveWorkspaceAuthorizationEpoch(context: IamTenantContextV1): Promise<number>;
}

export interface AgentGrantTransactionPortV1 {
  findGrant(
    context: IamTenantContextV1,
    memberId: StableIdentifierV1,
  ): Promise<WorkspaceAgentGrantRecordV1 | undefined>;
  saveGrant(
    context: IamTenantContextV1,
    grant: WorkspaceAgentGrantRecordV1,
    expectedRevision: number | undefined,
  ): Promise<void>;
  findDatasetRestrictions(
    context: IamTenantContextV1,
    memberId: StableIdentifierV1,
  ): Promise<WorkspaceDatasetRestrictionRecordV1 | undefined>;
  saveDatasetRestrictions(
    context: IamTenantContextV1,
    record: WorkspaceDatasetRestrictionRecordV1,
    expectedRevision: number | undefined,
  ): Promise<void>;
  bumpAuthorizationEpoch(context: IamTenantContextV1): Promise<number>;
}

export interface AgentGrantRepositoryPortV1
  extends AgentGrantTransactionPortV1,
    WorkspaceAuthorizationEpochResolverPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: AgentGrantTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

export type { MembershipAccessPresetV1 };

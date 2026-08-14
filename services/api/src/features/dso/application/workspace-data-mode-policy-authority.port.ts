import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

export interface CurrentWorkspaceDataModePolicyV1 {
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly policyId: StableIdentifierV1;
  readonly currentPolicyVersionId: StableIdentifierV1;
  readonly currentPolicyVersionHash: string;
  readonly aggregateRevision: number;
}

export interface WorkspaceDataModePolicyAuthorityPortV1 {
  resolveCurrent(input: {
    readonly organizationId: StableIdentifierV1;
    readonly workspaceId: StableIdentifierV1;
  }): Promise<CurrentWorkspaceDataModePolicyV1 | undefined>;
}

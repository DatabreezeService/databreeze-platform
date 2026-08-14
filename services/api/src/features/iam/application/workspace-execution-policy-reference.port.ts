import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

export interface WorkspaceExecutionPolicyReferenceV1 {
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly dataModePolicyId: StableIdentifierV1;
  readonly currentDataModePolicyVersionId: StableIdentifierV1;
  readonly dataModeProjection: 'LOCAL' | 'HYBRID' | 'CLOUD';
  readonly authorizationEpoch: number;
}

export interface WorkspaceExecutionPolicyReferenceAuthorityPortV1 {
  resolveExact(input: {
    readonly organizationId: StableIdentifierV1;
    readonly workspaceId: StableIdentifierV1;
  }): Promise<WorkspaceExecutionPolicyReferenceV1 | undefined>;
}

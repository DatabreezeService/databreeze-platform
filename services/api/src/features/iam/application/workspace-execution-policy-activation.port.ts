import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

export interface WorkspaceExecutionPolicyActivationParticipantPortV1 {
  compareAndSet(input: {
    readonly organizationId: StableIdentifierV1;
    readonly workspaceId: StableIdentifierV1;
    readonly expectedPolicyId?: StableIdentifierV1;
    readonly expectedPolicyVersionId?: StableIdentifierV1;
    readonly expectedModeProjection?: 'LOCAL' | 'HYBRID' | 'CLOUD';
    readonly expectedAuthorizationEpoch: number;
    readonly nextPolicyId: StableIdentifierV1;
    readonly nextPolicyVersionId: StableIdentifierV1;
    readonly nextModeProjection: 'LOCAL' | 'HYBRID' | 'CLOUD';
  }): Promise<number>;
}

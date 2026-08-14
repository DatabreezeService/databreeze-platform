import type { DataModePolicyVersionV1 } from '@databreeze/domain/data-mode/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const WORKSPACE_DATA_MODE_POLICY_ACTIVATION_USE_CASE = Symbol(
  'WORKSPACE_DATA_MODE_POLICY_ACTIVATION_USE_CASE',
);

export interface WorkspaceDataModePolicyActivationApplyV1 {
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly policy: DataModePolicyVersionV1;
  readonly expectedAggregateRevision: number;
  readonly expectedCurrentPolicyVersionId?: StableIdentifierV1;
  readonly expectedAuthorizationEpoch: number;
}

export interface WorkspaceDataModePolicyActivationResultV1 {
  readonly replayed: boolean;
  readonly policy: DataModePolicyVersionV1;
  readonly aggregateRevision: number;
  readonly authorizationEpoch: number;
  readonly requestHash: string;
}

export interface WorkspaceDataModePolicyActivationParticipantPortV1 {
  apply(
    input: WorkspaceDataModePolicyActivationApplyV1,
  ): Promise<WorkspaceDataModePolicyActivationResultV1>;
}

export interface WorkspaceDataModePolicyActivationUseCaseV1 {
  activate(
    context: IamTenantContextV1,
    input: {
      readonly policy: DataModePolicyVersionV1;
      readonly expectedAggregateRevision: number;
      readonly expectedCurrentPolicyVersionId?: StableIdentifierV1;
      readonly expectedIamPolicyId?: StableIdentifierV1;
      readonly expectedIamPolicyVersionId?: StableIdentifierV1;
      readonly expectedIamModeProjection?: 'LOCAL' | 'HYBRID' | 'CLOUD';
      readonly expectedAuthorizationEpoch: number;
    },
  ): Promise<
    | { readonly accepted: true; readonly value: WorkspaceDataModePolicyActivationResultV1 }
    | {
        readonly accepted: false;
        readonly code:
          | 'INVALID_ACTIVATION'
          | 'SCOPE_MISMATCH'
          | 'ACTIVATION_UNAUTHORIZED'
          | 'RECENT_MFA_REQUIRED'
          | 'TRANSITION_PROOF_REQUIRED'
          | 'ACTIVATION_GUARDS_UNAVAILABLE'
          | 'ACTIVATION_STALE'
          | 'IDEMPOTENCY_CONFLICT'
          | 'PERSISTENCE_UNAVAILABLE';
      }
  >;
}

export class UnavailableWorkspaceDataModePolicyActivationUseCase
  implements WorkspaceDataModePolicyActivationUseCaseV1
{
  public async activate(): Promise<{
    readonly accepted: false;
    readonly code: 'PERSISTENCE_UNAVAILABLE';
  }> {
    await Promise.resolve();
    return Object.freeze({ accepted: false, code: 'PERSISTENCE_UNAVAILABLE' });
  }
}

import type { DataModeV1 } from '@databreeze/domain/data-mode/v1';
import type {
  StableIdentifierV1,
  StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

/** IAM-022/DSO-008: consumer-owned seam for the atomic personal-workspace policy participant. */
export interface InitialWorkspacePolicyProvisionerPortV1 {
  provision(input: {
    readonly organizationId: StableIdentifierV1;
    readonly workspaceId: StableIdentifierV1;
    readonly publishedAt: StrictUtcTimestampV1;
  }): Promise<{
    readonly policyId: StableIdentifierV1;
    readonly policyVersionId: StableIdentifierV1;
    readonly dataModeProjection: DataModeV1;
  }>;
}


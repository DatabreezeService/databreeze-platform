import type { DashboardSnapshotV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type { RefreshCoordinatorPortV1 } from './refresh-coordinator.port.js';

export type MaterializationVerificationStatusV1 =
  | 'VERIFIED'
  | 'MISSING'
  | 'FAILED'
  | 'MISMATCHED'
  | 'RETENTION_DELETED';

export interface VerifiedMaterializationV1 {
  readonly materializationId: string;
  readonly resultManifestHash: string;
  readonly cacheIdentityHash: string;
  readonly datasetVersionId: string;
  readonly permissionProjectionVersionId: string;
  readonly status: MaterializationVerificationStatusV1;
}

export type SnapshotCommitErrorCodeV1 =
  | 'INCOMPLETE_MATERIALIZATION_SET'
  | 'MIXED_INPUT_SET'
  | 'MIXED_PERMISSION_PROJECTION'
  | 'SOURCE_UNAVAILABLE'
  | 'SNAPSHOT_COMMIT_FAILED';

export type SnapshotCommitResultV1 =
  | {
      readonly accepted: true;
      readonly value: { readonly state: 'COMMITTED'; readonly snapshotId: string };
    }
  | { readonly accepted: false; readonly code: SnapshotCommitErrorCodeV1 };

const HASH_PATTERN = /^[0-9a-f]{64}$/u;

/** DDA-032: publish one complete snapshot via a single transactional pointer swap. */
export class SnapshotCommitService {
  public constructor(private readonly coordinator: RefreshCoordinatorPortV1) {}

  public async commit(input: {
    readonly dashboardId: string;
    readonly refreshId: string;
    readonly snapshot: DashboardSnapshotV1;
    readonly materializations: readonly VerifiedMaterializationV1[];
  }): Promise<SnapshotCommitResultV1> {
    const requiredIds = new Set(input.snapshot.materializationIds);
    const providedIds = new Set(input.materializations.map((item) => item.materializationId));
    for (const required of requiredIds) {
      if (!providedIds.has(required)) {
        return Object.freeze({ accepted: false, code: 'INCOMPLETE_MATERIALIZATION_SET' });
      }
    }

    for (const materialization of input.materializations) {
      if (materialization.status === 'RETENTION_DELETED') {
        return Object.freeze({ accepted: false, code: 'SOURCE_UNAVAILABLE' });
      }
      if (
        materialization.status !== 'VERIFIED' ||
        !HASH_PATTERN.test(materialization.resultManifestHash) ||
        !HASH_PATTERN.test(materialization.cacheIdentityHash)
      ) {
        return Object.freeze({ accepted: false, code: 'INCOMPLETE_MATERIALIZATION_SET' });
      }
    }

    const datasetVersions = new Set(input.materializations.map((item) => item.datasetVersionId));
    if (datasetVersions.size > 1) {
      return Object.freeze({ accepted: false, code: 'MIXED_INPUT_SET' });
    }

    const permissions = new Set(
      input.materializations.map((item) => item.permissionProjectionVersionId),
    );
    if (permissions.size > 1) {
      return Object.freeze({ accepted: false, code: 'MIXED_PERMISSION_PROJECTION' });
    }

    try {
      await this.coordinator.commitSnapshotAtomically({
        dashboardId: input.dashboardId,
        refreshId: input.refreshId,
        snapshot: input.snapshot,
      });
    } catch {
      return Object.freeze({ accepted: false, code: 'SNAPSHOT_COMMIT_FAILED' });
    }

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        state: 'COMMITTED' as const,
        snapshotId: input.snapshot.snapshotId,
      }),
    });
  }
}

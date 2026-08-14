import type { DashboardSnapshotV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type { RefreshCoordinatorPortV1 } from './refresh-coordinator.port.js';
import {
  parseStableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { WorkerVerifiedResultManifestPortV1 } from '../../../jra/worker/worker-result-finalization.port.js';
import {
  readDashboardSnapshotBindingProofV1,
  validateDashboardSnapshotBindingProofV1,
} from '../../dashboard/application/dashboard-repository.port.js';
import type { DashboardPublicationMaterializationBindingProofV1 } from '../../dashboard/application/dashboard-publication-materialization.port.js';

export type MaterializationVerificationStatusV1 =
  | 'VERIFIED'
  | 'MISSING'
  | 'FAILED'
  | 'MISMATCHED'
  | 'RETENTION_DELETED';

export interface VerifiedMaterializationV1 {
  readonly materializationId: string;
  readonly resultManifestId?: string;
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
const HANDLER_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const OUTPUT_SCHEMA_ID = 'dda.dashboard-widget-result.v4';

function sameScope(left: TenantScopeV1, right: TenantScopeV1): boolean {
  if (left.scopeType !== right.scopeType || left.organizationId !== right.organizationId) {
    return false;
  }
  if ('workspaceId' in left || 'workspaceId' in right) {
    if (
      !('workspaceId' in left) ||
      !('workspaceId' in right) ||
      left.workspaceId !== right.workspaceId
    ) {
      return false;
    }
  }
  if ('projectId' in left || 'projectId' in right) {
    return 'projectId' in left && 'projectId' in right && left.projectId === right.projectId;
  }
  return true;
}

/** DDA-032: publish one complete snapshot via a single transactional pointer swap. */
export class SnapshotCommitService {
  public constructor(
    private readonly coordinator: RefreshCoordinatorPortV1,
    private readonly manifests?: WorkerVerifiedResultManifestPortV1,
    private readonly requireVerifiedManifests = manifests !== undefined,
  ) {}

  public async commit(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly refreshId: string;
    readonly expectedRevision: number;
    readonly expectedLeaseId: string;
    readonly expectedInputSelectorHash: string;
    readonly snapshot: DashboardSnapshotV1;
    readonly materializations: readonly VerifiedMaterializationV1[];
  }): Promise<SnapshotCommitResultV1> {
    const bindingProof = this.manifests
      ? validateDashboardSnapshotBindingProofV1({
          snapshot: input.snapshot,
          bindingProof: readDashboardSnapshotBindingProofV1(input.snapshot),
        })
      : undefined;
    if (this.manifests !== undefined && bindingProof === undefined) {
      return Object.freeze({ accepted: false, code: 'INCOMPLETE_MATERIALIZATION_SET' });
    }
    const proofByMaterializationId = new Map<
      string,
      DashboardPublicationMaterializationBindingProofV1
    >(
      (bindingProof ?? []).map((proof) => [proof.materializationId, proof]),
    );
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
      if (this.requireVerifiedManifests && this.manifests === undefined) {
        return Object.freeze({ accepted: false, code: 'INCOMPLETE_MATERIALIZATION_SET' });
      }
      if (this.manifests !== undefined) {
        const proof = proofByMaterializationId.get(materialization.materializationId);
        if (
          proof === undefined ||
          proof.resultManifestId !== materialization.resultManifestId ||
          proof.cacheIdentityHash !== materialization.cacheIdentityHash
        ) {
          return Object.freeze({ accepted: false, code: 'INCOMPLETE_MATERIALIZATION_SET' });
        }
        const parsedManifestId = parseStableIdentifierV1(materialization.resultManifestId);
        if (!parsedManifestId.accepted) {
          return Object.freeze({ accepted: false, code: 'INCOMPLETE_MATERIALIZATION_SET' });
        }
        let manifest;
        try {
          manifest = await this.manifests.findVerified({
            tenantScope: input.tenantScope,
            resultManifestId: parsedManifestId.value,
          });
        } catch {
          return Object.freeze({ accepted: false, code: 'INCOMPLETE_MATERIALIZATION_SET' });
        }
        if (
          manifest === undefined ||
          manifest.resultManifestId !== materialization.resultManifestId ||
          manifest.resultManifestHash !== materialization.resultManifestHash ||
          !sameScope(manifest.tenantScope, input.tenantScope) ||
          manifest.outputSchemaId !== OUTPUT_SCHEMA_ID ||
          manifest.engineVersion !== proof.engineVersion ||
          manifest.subjectBindings['dashboardId'] !== input.dashboardId ||
          manifest.subjectBindings['dashboardVersionId'] !== proof.dashboardVersionId ||
          manifest.subjectBindings['widgetId'] !== proof.widgetId ||
          manifest.subjectBindings['planVersionId'] !== proof.analysisPlanVersionId ||
          manifest.subjectBindings['metricVersionId'] !== proof.metricVersionId ||
          manifest.subjectBindings['datasetVersionId'] !== proof.datasetVersionId ||
          manifest.subjectBindings['permissionProjectionVersionId'] !==
            proof.permissionProjectionVersionId ||
          manifest.subjectBindings['policyVersionId'] !== proof.effectivePolicyVersionId ||
          manifest.subjectBindings['locale'] !== proof.locale ||
          manifest.subjectBindings['timezone'] !== proof.timezone ||
          manifest.subjectBindings['inputSelectorHash'] !== input.snapshot.inputSelectorHash ||
          manifest.subjectBindings['engineVersion'] !== proof.engineVersion ||
          !HANDLER_DIGEST_PATTERN.test(manifest.subjectBindings['handlerDigest'] ?? '') ||
          manifest.attestations.length !== 1
        ) {
          return Object.freeze({ accepted: false, code: 'INCOMPLETE_MATERIALIZATION_SET' });
        }
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
        tenantScope: input.tenantScope,
        dashboardId: input.dashboardId,
        refreshId: input.refreshId,
        expectedRevision: input.expectedRevision,
        expectedLeaseId: input.expectedLeaseId,
        expectedInputSelectorHash: input.expectedInputSelectorHash,
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

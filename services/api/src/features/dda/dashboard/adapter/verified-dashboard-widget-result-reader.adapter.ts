import {
  parseV4Contract,
  type DdaDashboardWidgetResultsAccepted,
  type JraWorkerDashboardWidgetResultOutput,
} from '@databreeze/contracts/v4';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { DdaIaePortV1 } from '../../application/foundation-ports.js';
import type { DashboardRepositoryPortV1 } from '../../application/dashboard-repository.port.js';
import type { RefreshRepositoryPortV1 } from '../../application/refresh-repository.port.js';
import {
  readDashboardSnapshotBindingProofV1,
  validateDashboardSnapshotBindingProofV1,
} from '../application/dashboard-repository.port.js';
import type {
  DashboardWidgetResultReadV1,
  DashboardWidgetResultReaderPortV1,
} from '../application/dashboard-widget-result.port.js';
import type { WorkerVerifiedResultManifestPortV1 } from '../../../jra/worker/worker-result-finalization.port.js';

const OUTPUT_SCHEMA_ID = 'dda.dashboard-widget-result.v4';
const OUTPUT_CONTRACT_ID =
  'https://schemas.databreeze.dev/contracts/v4/jra-worker-dashboard-widget-result-output';
const ACCEPTED_CONTRACT_ID =
  'https://schemas.databreeze.dev/contracts/v4/dda-dashboard-widget-results-accepted';
const JSON_MEDIA_TYPE = 'application/json';
const MAXIMUM_OUTPUT_BYTES = 4 * 1024 * 1024;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const HANDLER_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

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
    return (
      'projectId' in left && 'projectId' in right && left.projectId === right.projectId
    );
  }
  return true;
}

function exactRecord(
  actual: object,
  expected: Readonly<Record<string, string>>,
): boolean {
  const actualRecord = actual as Readonly<Record<string, unknown>>;
  const actualKeys = Object.keys(actualRecord).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key, index) => key === expectedKeys[index] && actualRecord[key] === expected[key],
    )
  );
}

function decodeJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

function freshnessState(
  value: 'FRESH' | 'PENDING' | 'STALE' | 'BLOCKED' | 'SOURCE_UNAVAILABLE',
): DdaDashboardWidgetResultsAccepted['freshness']['state'] {
  return value === 'FRESH' ? 'CURRENT' : value;
}

/**
 * DDA-025/DDA-032, IAE-024, JRA-031: rebuild one public dashboard result only
 * from an exact immutable snapshot, a server-verified JRA manifest, and the
 * corresponding hash-bound IAE bytes.
 */
export class VerifiedDashboardWidgetResultReaderAdapterV1
  implements DashboardWidgetResultReaderPortV1
{
  public constructor(
    private readonly dependencies: {
      readonly snapshots: RefreshRepositoryPortV1;
      readonly dashboards: DashboardRepositoryPortV1;
      readonly manifests: WorkerVerifiedResultManifestPortV1;
      readonly iae: DdaIaePortV1;
    },
  ) {}

  public async read(
    input: Parameters<DashboardWidgetResultReaderPortV1['read']>[0],
  ): Promise<DashboardWidgetResultReadV1> {
    try {
      const snapshot = await this.dependencies.snapshots.findSnapshot(
        input.context.tenantScope,
        input.snapshotId,
      );
      if (snapshot === undefined || !sameScope(snapshot.tenantScope, input.context.tenantScope)) {
        return Object.freeze({ accepted: false, code: 'NOT_FOUND' });
      }
      if (snapshot.permissionProjectionVersionId !== input.permissionProjectionVersionId) {
        return Object.freeze({ accepted: false, code: 'UNAUTHORIZED' });
      }

      const version = await this.dependencies.dashboards.findVersion(
        input.context.tenantScope,
        snapshot.dashboardVersionId,
      );
      if (
        version === undefined ||
        version.dashboardId !== input.dashboardId ||
        !sameScope(version.tenantScope, input.context.tenantScope)
      ) {
        return Object.freeze({ accepted: false, code: 'NOT_FOUND' });
      }

      const untrustedProof = readDashboardSnapshotBindingProofV1(snapshot);
      const proof = validateDashboardSnapshotBindingProofV1({
        snapshot,
        bindingProof: untrustedProof,
      });
      if (proof === undefined) {
        return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
      }

      const inputVersionIds = [...new Set(proof.map((item) => item.datasetVersionId))].sort();
      if (inputVersionIds.length === 0 || inputVersionIds.length > 32) {
        return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
      }

      const widgets: DdaDashboardWidgetResultsAccepted['widgets'][number][] = [];
      const seenWidgets = new Set<string>();
      for (const binding of proof) {
        const manifest = await this.dependencies.manifests.findVerified({
          tenantScope: input.context.tenantScope,
          resultManifestId: binding.resultManifestId,
        });
        if (
          manifest === undefined ||
          manifest.resultManifestId !== binding.resultManifestId ||
          manifest.outputSchemaId !== OUTPUT_SCHEMA_ID ||
          manifest.engineVersion !== binding.engineVersion ||
          !sameScope(manifest.tenantScope, input.context.tenantScope) ||
          manifest.attestations.length !== 1 ||
          !HASH_PATTERN.test(manifest.resultManifestHash) ||
          !HASH_PATTERN.test(manifest.descriptorHash)
        ) {
          return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
        }

        const handlerDigest = manifest.subjectBindings['handlerDigest'];
        if (handlerDigest === undefined || !HANDLER_DIGEST_PATTERN.test(handlerDigest)) {
          return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
        }
        const expectedBindings = Object.freeze({
          dashboardId: input.dashboardId,
          dashboardVersionId: binding.dashboardVersionId,
          widgetId: binding.widgetId,
          planVersionId: binding.analysisPlanVersionId,
          metricVersionId: binding.metricVersionId,
          datasetVersionId: binding.datasetVersionId,
          permissionProjectionVersionId: binding.permissionProjectionVersionId,
          policyVersionId: binding.effectivePolicyVersionId,
          locale: binding.locale,
          timezone: binding.timezone,
          inputSelectorHash: snapshot.inputSelectorHash,
          engineVersion: binding.engineVersion,
          handlerDigest,
        });
        if (!exactRecord(manifest.subjectBindings, expectedBindings)) {
          return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
        }

        const attestation = manifest.attestations[0];
        if (
          attestation === undefined ||
          attestation.mediaType !== JSON_MEDIA_TYPE ||
          attestation.contentLength <= 0 ||
          attestation.contentLength > MAXIMUM_OUTPUT_BYTES ||
          !HASH_PATTERN.test(attestation.contentSha256)
        ) {
          return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
        }
        const opened = await this.dependencies.iae.openProcessingContent({
          tenantScope: input.context.tenantScope,
          artifactVersionId: attestation.artifactVersionId,
          expectedContentSha256: attestation.contentSha256,
          maximumByteLength: MAXIMUM_OUTPUT_BYTES,
          allowedMediaTypes: [JSON_MEDIA_TYPE],
        });
        if (
          !opened.accepted ||
          opened.value.artifactVersionId !== attestation.artifactVersionId ||
          opened.value.contentSha256 !== attestation.contentSha256 ||
          opened.value.byteLength !== attestation.contentLength ||
          opened.value.bytes.byteLength !== attestation.contentLength ||
          opened.value.mediaType !== JSON_MEDIA_TYPE ||
          !sameScope(opened.value.tenantScope, input.context.tenantScope)
        ) {
          return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
        }

        const parsedOutput = parseV4Contract<JraWorkerDashboardWidgetResultOutput>(
          OUTPUT_CONTRACT_ID,
          decodeJson(opened.value.bytes),
        );
        if (
          !parsedOutput.accepted ||
          !exactRecord(parsedOutput.value.subjectBindings, expectedBindings) ||
          parsedOutput.value.widgetResult.widgetId !== binding.widgetId ||
          seenWidgets.has(binding.widgetId) ||
          parsedOutput.value.widgetResult.rows.some(
            (row) =>
              row.provenance.planVersionId !== binding.analysisPlanVersionId ||
              row.provenance.metricVersionId !== binding.metricVersionId ||
              row.provenance.datasetVersionId !== binding.datasetVersionId,
          )
        ) {
          return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
        }
        seenWidgets.add(binding.widgetId);
        widgets.push(parsedOutput.value.widgetResult);
      }

      const accepted = parseV4Contract<DdaDashboardWidgetResultsAccepted>(ACCEPTED_CONTRACT_ID, {
        schemaVersion: 4,
        accepted: true,
        dashboardId: input.dashboardId,
        snapshotId: snapshot.snapshotId,
        freshness: {
          state: freshnessState(snapshot.freshnessState),
          lastSuccessfulRefreshAt: snapshot.createdAt,
          inputSelectorHash: snapshot.inputSelectorHash,
          dashboardVersionId: snapshot.dashboardVersionId,
          inputVersionIds,
        },
        widgets,
      });
      if (!accepted.accepted) {
        return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
      }
      return Object.freeze({ accepted: true, value: accepted.value });
    } catch {
      return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
    }
  }
}

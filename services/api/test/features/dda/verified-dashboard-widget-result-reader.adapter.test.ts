/* eslint-disable @typescript-eslint/require-await -- focused port doubles are asynchronous. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeDashboardSnapshotHashV1,
  createDashboardSnapshotV1,
  type DashboardVersionV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import { VerifiedDashboardWidgetResultReaderAdapterV1 } from '../../../src/features/dda/dashboard/adapter/verified-dashboard-widget-result-reader.adapter.js';
import type { DdaIaePortV1 } from '../../../src/features/dda/application/foundation-ports.js';
import type { RefreshRepositoryPortV1 } from '../../../src/features/dda/application/refresh-repository.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { WorkerVerifiedResultManifestV1 } from '../../../src/features/jra/worker/worker-result-finalization.port.js';
import { withRefreshSnapshotBindingProof } from './refresh-snapshot-fixture.js';

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('TEST_IDENTIFIER_INVALID');
  return parsed.value;
}

const ids = {
  actor: stable('00000000-0000-4000-8000-000000000101'),
  correlation: stable('00000000-0000-4000-8000-000000000102'),
  dashboard: stable('00000000-0000-4000-8000-000000000103'),
  snapshot: stable('00000000-0000-4000-8000-000000000104'),
  version: stable('00000000-0000-4000-8000-000000000105'),
  materialization: stable('00000000-0000-4000-8000-000000000106'),
  artifact: stable('00000000-0000-4000-8000-000000000107'),
  manifest: stable('00000000-0000-4000-8000-00000000f007'),
  attempt: stable('00000000-0000-4000-8000-000000000109'),
  job: stable('00000000-0000-4000-8000-000000000110'),
  descriptor: stable('00000000-0000-4000-8000-000000000111'),
  attestation: stable('00000000-0000-4000-8000-000000000112'),
  cell: stable('00000000-0000-4000-8000-000000000113'),
  evidence: stable('00000000-0000-4000-8000-000000000114'),
} as const;

const parsedScope = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(parsedScope.accepted, true);
if (!parsedScope.accepted) throw new Error('TEST_SCOPE_INVALID');
const tenantScope = parsedScope.value;

const parsedTime = parseStrictUtcTimestampV1('2026-08-13T10:00:00.000Z');
assert.equal(parsedTime.accepted, true);
if (!parsedTime.accepted) throw new Error('TEST_TIME_INVALID');
const createdAt = parsedTime.value;

const parsedContext = createIamTenantContextV1({
  actorId: ids.actor,
  tenantScope,
  authorizationEpoch: 7,
  correlationId: ids.correlation,
  idempotencyKey: 'verified-widget-result-reader',
});
assert.equal(parsedContext.accepted, true);
if (!parsedContext.accepted) throw new Error('TEST_CONTEXT_INVALID');
const context = parsedContext.value;

const rawSnapshot = createDashboardSnapshotV1({
  snapshotId: ids.snapshot,
  tenantScope,
  dashboardVersionId: ids.version,
  materializationIds: [ids.materialization],
  inputSelectorHash: 'a'.repeat(64),
  permissionProjectionVersionId: stable('00000000-0000-4000-8000-000000000115'),
  audience: 'WORKSPACE_VIEWERS',
  freshnessState: 'FRESH',
  evidenceState: 'AVAILABLE',
  canonicalHash: computeDashboardSnapshotHashV1({
    snapshotId: ids.snapshot,
    tenantScope,
    dashboardVersionId: ids.version,
    materializationIds: [ids.materialization],
    inputSelectorHash: 'a'.repeat(64),
    permissionProjectionVersionId: stable('00000000-0000-4000-8000-000000000115'),
    audience: 'WORKSPACE_VIEWERS',
    freshnessState: 'FRESH',
    evidenceState: 'AVAILABLE',
    createdAt,
  }),
  createdAt,
});
assert.equal(rawSnapshot.accepted, true);
if (!rawSnapshot.accepted) throw new Error('TEST_SNAPSHOT_INVALID');
const snapshot = withRefreshSnapshotBindingProof(rawSnapshot.value);
const proofCandidate = snapshot.bindingProof[0];
assert.notEqual(proofCandidate, undefined);
if (proofCandidate === undefined) throw new Error('TEST_PROOF_INVALID');
const proof = proofCandidate;

const version = {
  versionId: ids.version,
  dashboardId: ids.dashboard,
  tenantScope,
} as unknown as DashboardVersionV1;

const handlerDigest = `sha256:${'b'.repeat(64)}`;
const subjectBindings = Object.freeze({
  dashboardId: ids.dashboard,
  dashboardVersionId: ids.version,
  widgetId: proof.widgetId,
  planVersionId: proof.analysisPlanVersionId,
  metricVersionId: proof.metricVersionId,
  datasetVersionId: proof.datasetVersionId,
  permissionProjectionVersionId: proof.permissionProjectionVersionId,
  policyVersionId: proof.effectivePolicyVersionId,
  locale: proof.locale,
  timezone: proof.timezone,
  inputSelectorHash: snapshot.inputSelectorHash,
  engineVersion: proof.engineVersion,
  handlerDigest,
});

const artifact = Object.freeze({
  schemaVersion: 4,
  kind: 'DASHBOARD_WIDGET_RESULT',
  widgetResult: Object.freeze({
    widgetId: proof.widgetId,
    resultState: 'READY',
    rows: Object.freeze([
      Object.freeze({
        label: 'Doanh thu',
        displayValue: '1.250.000 ₫',
        numericValue: 1_250_000,
        unit: 'VND',
        provenance: Object.freeze({
          resultCellId: ids.cell,
          planVersionId: proof.analysisPlanVersionId,
          metricVersionId: proof.metricVersionId,
          datasetVersionId: proof.datasetVersionId,
          evidenceRefs: Object.freeze([ids.evidence]),
        }),
      }),
    ]),
  }),
  subjectBindings,
});
const bytes = new TextEncoder().encode(JSON.stringify(artifact));
const contentHash = await import('node:crypto').then(({ createHash }) =>
  createHash('sha256').update(bytes).digest('hex'),
);

const manifest: WorkerVerifiedResultManifestV1 = Object.freeze({
  resultManifestId: ids.manifest,
  resultManifestHash: 'c'.repeat(64),
  jobId: ids.job,
  attemptId: ids.attempt,
  tenantScope,
  descriptorId: ids.descriptor,
  descriptorHash: 'd'.repeat(64),
  outputSchemaId: 'dda.dashboard-widget-result.v4',
  engineVersion: proof.engineVersion,
  sourceArtifactVersionIds: Object.freeze([proof.datasetVersionId]),
  sourceLineageHash: 'e'.repeat(64),
  subjectBindings,
  attestations: Object.freeze([
    Object.freeze({
      attestationId: ids.attestation,
      artifactVersionId: ids.artifact,
      contentSha256: contentHash,
      contentLength: bytes.byteLength,
      mediaType: 'application/json',
    }),
  ]),
  finalizedAt: createdAt,
});

function adapter(
  overrides: {
    readonly manifest?: WorkerVerifiedResultManifestV1 | undefined;
    readonly openedHash?: string;
  } = {},
) {
  return new VerifiedDashboardWidgetResultReaderAdapterV1({
    snapshots: {
      findSnapshot: async () => snapshot,
    } as unknown as RefreshRepositoryPortV1,
    dashboards: {
      findVersion: async () => version,
    } as never,
    manifests: {
      findVerified: async (input) => {
        assert.deepEqual(input.tenantScope, context.tenantScope);
        assert.equal(input.resultManifestId, proof.resultManifestId);
        return 'manifest' in overrides ? overrides.manifest : manifest;
      },
    },
    iae: {
      openProcessingContent: async (
        input: Parameters<DdaIaePortV1['openProcessingContent']>[0],
      ) => {
        assert.equal(input.artifactVersionId, ids.artifact);
        assert.equal(input.expectedContentSha256, contentHash);
        assert.deepEqual(input.allowedMediaTypes, ['application/json']);
        return Object.freeze({
          accepted: true,
          value: Object.freeze({
            artifactVersionId: ids.artifact,
            tenantScope,
            contentSha256: overrides.openedHash ?? contentHash,
            mediaType: 'application/json',
            byteLength: bytes.byteLength,
            bytes,
          }),
        });
      },
    } as unknown as DdaIaePortV1,
  });
}

void test('[DDA-032][IAE-024][JRA-031] returns typed values only from exact verified manifests and IAE bytes', async () => {
  const result = await adapter().read({
    context,
    dashboardId: ids.dashboard,
    snapshotId: ids.snapshot,
    permissionProjectionVersionId: proof.permissionProjectionVersionId,
  });

  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.schemaVersion, 4);
  assert.equal(result.value.freshness.state, 'CURRENT');
  assert.deepEqual(result.value.freshness.inputVersionIds, [proof.datasetVersionId]);
  assert.deepEqual(result.value.widgets, [artifact.widgetResult]);
  assert.equal(JSON.stringify(result.value).includes('artifactVersionId'), false);
  assert.equal(JSON.stringify(result.value).includes('tenantScope'), false);
});

void test('[DDA-025][DDA-032] fails closed on absent manifests and changed content', async () => {
  const input = {
    context,
    dashboardId: ids.dashboard,
    snapshotId: ids.snapshot,
    permissionProjectionVersionId: proof.permissionProjectionVersionId,
  };
  assert.deepEqual(await adapter({ manifest: undefined }).read(input), {
    accepted: false,
    code: 'UNAVAILABLE',
  });
  assert.deepEqual(await adapter({ openedHash: 'f'.repeat(64) }).read(input), {
    accepted: false,
    code: 'UNAVAILABLE',
  });
});

void test('[DDA-018][DDA-026] rejects dashboard and permission projection mismatches without opening values', async () => {
  assert.deepEqual(
    await adapter().read({
      context,
      dashboardId: stable('00000000-0000-4000-8000-000000000999'),
      snapshotId: ids.snapshot,
      permissionProjectionVersionId: proof.permissionProjectionVersionId,
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );
  assert.deepEqual(
    await adapter().read({
      context,
      dashboardId: ids.dashboard,
      snapshotId: ids.snapshot,
      permissionProjectionVersionId: stable('00000000-0000-4000-8000-000000000998'),
    }),
    { accepted: false, code: 'UNAUTHORIZED' },
  );
});

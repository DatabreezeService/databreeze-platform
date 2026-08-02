import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInboxItemV1,
  finalizeArtifactAdmissionV1,
  updateInboxMetadataV1,
  transitionInboxItemV1,
} from '../dist/artifact-intake/v1.js';
import { createArtifactVersionV1 } from '../dist/artifact/v1.js';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
};
const baseArtifact = {
  artifactId: '00000000-0000-4000-8000-000000000010',
  versionId: '00000000-0000-4000-8000-000000000011',
  tenantScope: scope,
  sourceKind: 'FILE',
  dataMode: 'Hybrid',
  contentSha256: 'a'.repeat(64),
  byteSize: 24,
  mediaType: 'text/csv',
  displayName: 'orders.csv',
  createdAt: '2026-01-01T00:00:00.000Z',
};

void test('[IAE-001, IAE-013] inbox creation is idempotency-bound and transitions explicitly', () => {
  const created = createInboxItemV1({
    inboxItemId: '00000000-0000-4000-8000-000000000020',
    tenantScope: scope,
    idempotencyKey: 'capture-1',
    artifactVersionId: baseArtifact.versionId,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(created.value.state, 'NEW');
  const routed = transitionInboxItemV1(created.value, 'ROUTED');
  assert.equal(routed.accepted, true);
  if (!routed.accepted) return;
  assert.deepEqual(transitionInboxItemV1(created.value, 'ARCHIVED'), {
    accepted: false,
    code: 'INVALID_TRANSITION',
  });
});

void test('[IAE-009, IAE-010] admission requires digest, size, media signature, and clean scan', () => {
  const artifact = createArtifactVersionV1(baseArtifact);
  assert.equal(artifact.accepted, true);
  if (!artifact.accepted) return;
  assert.deepEqual(
    finalizeArtifactAdmissionV1({
      artifact: artifact.value,
      actualSha256: 'a'.repeat(64),
      actualByteSize: 24,
      detectedMediaType: 'text/csv',
      scanState: 'CLEAN',
      maxByteSize: 100,
    }),
    { accepted: true, value: { status: 'ACTIVE', scanState: 'CLEAN' } },
  );
  assert.deepEqual(
    finalizeArtifactAdmissionV1({
      artifact: artifact.value,
      actualSha256: 'b'.repeat(64),
      actualByteSize: 24,
      detectedMediaType: 'text/csv',
      scanState: 'CLEAN',
      maxByteSize: 100,
    }),
    { accepted: false, code: 'DIGEST_MISMATCH' },
  );
  assert.deepEqual(
    finalizeArtifactAdmissionV1({
      artifact: artifact.value,
      actualSha256: 'a'.repeat(64),
      actualByteSize: 24,
      detectedMediaType: 'text/csv',
      scanState: 'MALICIOUS',
      maxByteSize: 100,
    }),
    { accepted: true, value: { status: 'QUARANTINED', scanState: 'MALICIOUS' } },
  );
});

void test('[IAE-013] inbox metadata is bounded, revisioned, and clearable', () => {
  const created = createInboxItemV1({
    inboxItemId: '00000000-0000-4000-8000-000000000030',
    tenantScope: scope,
    idempotencyKey: 'metadata-1',
    artifactVersionId: baseArtifact.versionId,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const updated = updateInboxMetadataV1(created.value, {
    assigneeId: '00000000-0000-4000-8000-000000000031',
    labels: ['finance', 'urgent'],
    priority: 'HIGH',
    dueAt: '2026-01-02T00:00:00.000Z',
    expectedRevision: 1,
  });
  assert.equal(updated.accepted, true);
  if (!updated.accepted) return;
  assert.equal(updated.value.priority, 'HIGH');
  assert.equal(updated.value.revision, 2);
  const cleared = updateInboxMetadataV1(updated.value, {
    assigneeId: null,
    labels: [],
    dueAt: null,
    expectedRevision: 2,
  });
  assert.equal(cleared.accepted, true);
  if (cleared.accepted) assert.equal('assigneeId' in cleared.value, false);
  assert.deepEqual(
    updateInboxMetadataV1(created.value, { priority: 'INVALID', expectedRevision: 1 }),
    { accepted: false, code: 'INVALID_METADATA' },
  );
});

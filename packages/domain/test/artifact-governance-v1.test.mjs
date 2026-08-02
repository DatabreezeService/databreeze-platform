import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createArtifactLineageV1,
  evaluateArtifactRetentionV1,
  validateDerivedArtifactVersionV1,
} from '../dist/artifact-governance/v1.js';
import { createArtifactVersionV1 } from '../dist/artifact/v1.js';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
};

void test('[IAE-003, IAE-007, IAE-012] lineage pins source versions and typed transformations', () => {
  const result = createArtifactLineageV1({
    lineageId: '00000000-0000-4000-8000-000000000010',
    derivedArtifactVersionId: '00000000-0000-4000-8000-000000000011',
    tenantScope: scope,
    sourceArtifactVersionIds: ['00000000-0000-4000-8000-000000000012'],
    processorVersion: 'spreadsheet-auditor@1.0.0',
    coordinateLineage: [
      {
        sourceEvidenceId: '00000000-0000-4000-8000-000000000013',
        derivedEvidenceId: '00000000-0000-4000-8000-000000000014',
        transform: 'NORMALIZED',
      },
    ],
    sourceTenantScopes: [scope],
  });
  assert.equal(result.accepted, true);
  if (result.accepted) assert.equal(result.value.coordinateLineage[0]?.transform, 'NORMALIZED');
});

void test('[IAE-008] derived data mode cannot be wider than its least-permissive source', () => {
  const source = createArtifactVersionV1({
    artifactId: '00000000-0000-4000-8000-000000000020',
    versionId: '00000000-0000-4000-8000-000000000021',
    tenantScope: scope,
    sourceKind: 'FILE',
    dataMode: 'Local',
    contentSha256: 'a'.repeat(64),
    byteSize: 1,
    mediaType: 'text/csv',
    displayName: 'source.csv',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const derived = createArtifactVersionV1({
    artifactId: '00000000-0000-4000-8000-000000000022',
    versionId: '00000000-0000-4000-8000-000000000023',
    tenantScope: scope,
    sourceKind: 'GENERATED',
    dataMode: 'Hybrid',
    contentSha256: 'b'.repeat(64),
    byteSize: 1,
    mediaType: 'text/csv',
    displayName: 'derived.csv',
    createdAt: '2026-01-01T00:00:01.000Z',
  });
  assert.equal(source.accepted, true);
  assert.equal(derived.accepted, true);
  if (!source.accepted || !derived.accepted) return;
  assert.deepEqual(validateDerivedArtifactVersionV1({ derived: derived.value, sourceVersions: [source.value] }), {
    accepted: false,
    code: 'DATA_MODE_WIDENING',
  });
  assert.deepEqual(validateDerivedArtifactVersionV1({
    derived: { ...derived.value, dataMode: 'Local' },
    sourceVersions: [source.value],
  }), { accepted: true, value: true });
});

void test('[IAE-021] deletion eligibility is blocked by the strictest retention and governance condition', () => {
  const blocked = evaluateArtifactRetentionV1({
    evaluatedAt: '2026-01-01T00:00:00.000Z',
    workspaceRetentionUntil: '2026-01-02T00:00:00.000Z',
    resourceRetentionUntil: '2025-12-01T00:00:00.000Z',
    auditRetentionUntil: '2025-12-01T00:00:00.000Z',
    recoveryWindowUntil: '2025-12-01T00:00:00.000Z',
    activeApproval: true,
    legalHold: false,
  });
  assert.equal(blocked.accepted, true);
  if (!blocked.accepted) return;
  assert.deepEqual(blocked.value.blockers, ['WORKSPACE_RETENTION', 'ACTIVE_APPROVAL']);
  const eligible = evaluateArtifactRetentionV1({
    evaluatedAt: '2026-01-03T00:00:00.000Z',
    workspaceRetentionUntil: '2026-01-02T00:00:00.000Z',
    resourceRetentionUntil: '2025-12-01T00:00:00.000Z',
    auditRetentionUntil: '2025-12-01T00:00:00.000Z',
    recoveryWindowUntil: '2025-12-01T00:00:00.000Z',
    activeApproval: false,
    legalHold: false,
  });
  assert.deepEqual(eligible, {
    accepted: true,
    value: {
      eligible: true,
      blockers: [],
      evaluatedAt: '2026-01-03T00:00:00.000Z',
    },
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createArtifactVersionV1,
  createContentPlacementV1,
  createEvidenceReferenceV1,
  validateEvidenceCoordinateV1,
} from '../dist/artifact/v1.js';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
};
const base = {
  artifactId: '00000000-0000-4000-8000-000000000010',
  versionId: '00000000-0000-4000-8000-000000000011',
  tenantScope: scope,
  sourceKind: 'FILE',
  dataMode: 'Local',
  contentSha256: 'a'.repeat(64),
  byteSize: 42,
  mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  displayName: 'inventory.xlsx',
  createdAt: '2026-01-01T00:00:00.000Z',
};

void test('[IAE-001, IAE-003] artifact versions normalize and freeze immutable metadata', () => {
  const result = createArtifactVersionV1(base);
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.contentSha256, 'a'.repeat(64));
  assert.equal(result.value.scanState, 'PENDING');
  assert.equal(Object.isFrozen(result.value), true);
});

void test('[IAE-009, IAE-010] artifact scan state is bounded and immutable metadata includes it', () => {
  const result = createArtifactVersionV1({ ...base, scanState: 'MALICIOUS' });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.scanState, 'MALICIOUS');
  assert.deepEqual(createArtifactVersionV1({ ...base, scanState: 'UNKNOWN' }), {
    accepted: false,
    code: 'INVALID_SCAN_STATE',
  });
});

void test('[IAE-002, DSO-003] Local artifacts accept only opaque local placements', () => {
  const artifact = createArtifactVersionV1(base);
  assert.equal(artifact.accepted, true);
  if (!artifact.accepted) return;
  const placement = createContentPlacementV1({
    placementId: '00000000-0000-4000-8000-000000000012',
    artifactVersion: artifact.value,
    tenantScope: scope,
    kind: 'LOCAL',
    opaqueReference: 'local-reference_1234',
    contentSha256: 'a'.repeat(64),
  });
  assert.equal(placement.accepted, true);
  assert.equal(
    createContentPlacementV1({
      placementId: '00000000-0000-4000-8000-000000000013',
      artifactVersion: artifact.value,
      tenantScope: scope,
      kind: 'CLOUD',
      opaqueReference: 'cloud-reference_1234',
      contentSha256: 'a'.repeat(64),
    }).code,
    'LOCAL_CONTENT_LEAK',
  );
  assert.equal(
    createContentPlacementV1({
      placementId: '00000000-0000-4000-8000-000000000014',
      artifactVersion: artifact.value,
      tenantScope: scope,
      kind: 'LOCAL',
      opaqueReference: 'C:\\\\Users\\\\secret\\\\inventory.xlsx',
      contentSha256: 'a'.repeat(64),
    }).code,
    'INVALID_REFERENCE',
  );
});

void test('[IAE-005, IAE-006] Local evidence carries coordinates but never excerpts', () => {
  const artifact = createArtifactVersionV1(base);
  assert.equal(artifact.accepted, true);
  if (!artifact.accepted) return;
  const evidence = createEvidenceReferenceV1({
    evidenceId: '00000000-0000-4000-8000-000000000015',
    artifactVersion: artifact.value,
    tenantScope: scope,
    coordinate: { kind: 'CELL', sheet: 'Sheet1', address: 'B4' },
  });
  assert.equal(evidence.accepted, true);
  assert.equal(
    createEvidenceReferenceV1({
      evidenceId: '00000000-0000-4000-8000-000000000016',
      artifactVersion: artifact.value,
      tenantScope: scope,
      coordinate: { kind: 'CELL', sheet: 'Sheet1', address: 'B4' },
      excerpt: 'secret source value',
    }).code,
    'LOCAL_CONTENT_LEAK',
  );
});

void test('[IAE-006] evidence coordinates are validated against exact source geometry', () => {
  assert.deepEqual(
    validateEvidenceCoordinateV1(
      { kind: 'CELL', sheet: 'Sheet1', address: 'B4' },
      { kind: 'SPREADSHEET', sheets: [{ name: 'Sheet1', maxRow: 10, maxColumn: 3 }] },
    ),
    { accepted: true, value: true },
  );
  assert.deepEqual(
    validateEvidenceCoordinateV1(
      { kind: 'CELL', sheet: 'Sheet1', address: 'B4' },
      { kind: 'SPREADSHEET', sheets: [{ name: '  Sheet1  ', maxRow: 10, maxColumn: 3 }] },
    ),
    { accepted: true, value: true },
  );
  assert.deepEqual(
    validateEvidenceCoordinateV1(
      { kind: 'CELL', sheet: 'Sheet1', address: 'D4' },
      { kind: 'SPREADSHEET', sheets: [{ name: 'Sheet1', maxRow: 10, maxColumn: 3 }] },
    ),
    { accepted: false, code: 'COORDINATE_OUT_OF_BOUNDS' },
  );
  assert.deepEqual(
    validateEvidenceCoordinateV1({ kind: 'PAGE', page: 4 }, { kind: 'PAGED', maxPage: 3 }),
    { accepted: false, code: 'COORDINATE_OUT_OF_BOUNDS' },
  );
  assert.deepEqual(
    validateEvidenceCoordinateV1(
      { kind: 'CELL', sheet: 'Sheet1', address: 'B4' },
      { kind: 'SPREADSHEET', sheets: null },
    ),
    { accepted: false, code: 'INVALID_COORDINATE' },
  );
  assert.deepEqual(
    validateEvidenceCoordinateV1({ kind: 'PAGE', page: 1 }, { kind: 'PAGED', maxPage: '3' }),
    { accepted: false, code: 'INVALID_COORDINATE' },
  );
});

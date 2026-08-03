import assert from 'node:assert/strict';
import test from 'node:test';

import { createArtifactExportManifestV1 } from '../dist/artifact-export/v1.js';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000721',
  workspaceId: '00000000-0000-4000-8000-000000000722',
};

void test('[IAE-018] export manifests preserve hashes, evidence references, and approval state', () => {
  const result = createArtifactExportManifestV1({
    manifestId: '00000000-0000-4000-8000-000000000723',
    tenantScope: scope,
    entries: [
      {
        versionId: '00000000-0000-4000-8000-000000000724',
        contentSha256: 'a'.repeat(64),
        byteSize: 10,
        evidenceIds: ['00000000-0000-4000-8000-000000000725'],
        processorVersions: ['spreadsheet-auditor@1'],
      },
    ],
    approvalState: 'APPROVED',
    createdAt: '2026-01-03T00:00:00.000Z',
    canonicalHash: 'b'.repeat(64),
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.entries[0].contentSha256, 'a'.repeat(64));
  assert.deepEqual(
    createArtifactExportManifestV1({
      manifestId: '00000000-0000-4000-8000-000000000723',
      tenantScope: scope,
      entries: [
        {
          versionId: '00000000-0000-4000-8000-000000000724',
          contentSha256: 'a'.repeat(64),
          byteSize: 10,
          evidenceIds: [],
          processorVersions: [],
        },
        {
          versionId: '00000000-0000-4000-8000-000000000724',
          contentSha256: 'c'.repeat(64),
          byteSize: 11,
          evidenceIds: [],
          processorVersions: [],
        },
      ],
      approvalState: 'PENDING',
      createdAt: '2026-01-03T00:00:00.000Z',
      canonicalHash: 'b'.repeat(64),
    }),
    { accepted: false, code: 'DUPLICATE_IDENTIFIER' },
  );
});

void test('[IAE-018] processor versions are validated after normalization and trimming', () => {
  const base = {
    manifestId: '00000000-0000-4000-8000-000000000726',
    tenantScope: scope,
    entries: [
      {
        versionId: '00000000-0000-4000-8000-000000000727',
        contentSha256: 'a'.repeat(64),
        byteSize: 10,
        evidenceIds: [],
        processorVersions: ['   '],
      },
    ],
    approvalState: 'PENDING',
    createdAt: '2026-01-03T00:00:00.000Z',
    canonicalHash: 'b'.repeat(64),
  };
  assert.deepEqual(createArtifactExportManifestV1(base), {
    accepted: false,
    code: 'INVALID_ENTRY',
  });

  const trimmed = createArtifactExportManifestV1({
    ...base,
    entries: [{ ...base.entries[0], processorVersions: [`${' '.repeat(128)}v1`] }],
  });
  assert.equal(trimmed.accepted, true);
  if (trimmed.accepted) assert.deepEqual(trimmed.value.entries[0].processorVersions, ['v1']);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { WebIntakeController } from '../../../src/features/dda/intake/api/web-intake.controller.js';
import { WebIntakeProblemError } from '../../../src/features/dda/intake/application/web-intake-problem.error.js';
import type { WebIntakeServiceV1 } from '../../../src/features/dda/intake/application/web-intake.service.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);

void test('[DDA-002] intake controller returns IDs and status only', async () => {
  const controller = new WebIntakeController({
    publishedProfile: () => ({
      profileId: 'dda.web.tabular.v1',
      csv: { encodings: ['utf-8'], dialects: ['excel'] },
      xlsx: { macrosAllowed: false, externalLinksAllowed: false },
      limits: {
        maxBytes: 512_000,
        maxRows: 20_000,
        maxColumns: 256,
        maxSheets: 8,
        maxFormulas: 500,
      },
    }),
    finalizeUpload: () =>
      Promise.resolve({
        accepted: true as const,
        value: {
          sessionId: '00000000-0000-4000-8000-000000000112',
          artifactVersionId: '00000000-0000-4000-8000-000000000012',
          status: 'FINALIZED' as const,
          profileId: 'dda.web.tabular.v1',
        },
      }),
  } as unknown as WebIntakeServiceV1);

  const profile = await controller.getProfile();
  assert.equal(profile.profileId, 'dda.web.tabular.v1');

  const response = await controller.finalize({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000112',
    fileName: 'sales.csv',
    claimedMediaType: 'text/csv',
    expectedSha256: 'a'.repeat(64),
    contentBase64: Buffer.from('name,amount\nA,1\n').toString('base64'),
  });
  assert.deepEqual(response, {
    accepted: true,
    sessionId: '00000000-0000-4000-8000-000000000112',
    artifactVersionId: '00000000-0000-4000-8000-000000000012',
    status: 'FINALIZED',
    profileId: 'dda.web.tabular.v1',
  });
  assert.doesNotMatch(JSON.stringify(response), /contentBase64|name,amount|Cafe/u);
});

void test('[DDA-002] intake controller maps rejections to stable Problem codes', async () => {
  const controller = new WebIntakeController({
    publishedProfile: () => ({
      profileId: 'dda.web.tabular.v1',
      csv: { encodings: ['utf-8'], dialects: ['excel'] },
      xlsx: { macrosAllowed: false, externalLinksAllowed: false },
      limits: {
        maxBytes: 512_000,
        maxRows: 20_000,
        maxColumns: 256,
        maxSheets: 8,
        maxFormulas: 500,
      },
    }),
    finalizeUpload: () =>
      Promise.resolve({
        accepted: false as const,
        code: 'DDA_INTAKE_CHECKSUM_MISMATCH' as const,
      }),
  } as unknown as WebIntakeServiceV1);

  await assert.rejects(
    controller.finalize({
      tenantScope,
      sessionId: '00000000-0000-4000-8000-000000000110',
      fileName: 'sales.csv',
      claimedMediaType: 'text/csv',
      expectedSha256: 'b'.repeat(64),
      contentBase64: Buffer.from('x').toString('base64'),
    }),
    (error: unknown) =>
      error instanceof WebIntakeProblemError && error.code === 'DDA_INTAKE_CHECKSUM_MISMATCH',
  );
});

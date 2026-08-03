import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createServiceAccountV1,
  isServiceAccountSecretUsableV1,
  markServiceAccountUsedV1,
  revokeServiceAccountV1,
  rotateServiceAccountSecretV1,
} from '@databreeze/domain/service-account/v1';

const ids = {
  account: '00000000-0000-4000-8000-000000000601',
  organization: '00000000-0000-4000-8000-000000000602',
  workspace: '00000000-0000-4000-8000-000000000603',
};
const createdAt = '2026-08-03T00:00:00.000Z';

function input(overrides = {}) {
  return {
    id: ids.account,
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    name: 'Import worker',
    permissions: ['artifact.record.read', 'job.execution.create'],
    secretDigest: 'a'.repeat(64),
    secretIssuedAt: createdAt,
    createdAt,
    ...overrides,
  };
}

void test('[IAM-013] service account stores only bounded scoped permissions and a digest', () => {
  const result = createServiceAccountV1(input());
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.status, 'ACTIVE');
  assert.equal(result.value.secretVersion, 1);
  assert.deepEqual(result.value.permissions, ['artifact.record.read', 'job.execution.create']);
  assert.equal(Object.hasOwn(result.value, 'secret'), false);
});

void test('[IAM-013] invalid permissions, wildcard, digest, and lifetime fail closed', () => {
  assert.deepEqual(createServiceAccountV1(input({ permissions: ['*'] })), {
    accepted: false,
    code: 'INVALID_PERMISSION',
  });
  assert.deepEqual(createServiceAccountV1(input({ secretDigest: 'secret' })), {
    accepted: false,
    code: 'INVALID_DIGEST',
  });
  assert.deepEqual(
    createServiceAccountV1({
      ...input(),
      secretExpiresAt: '2027-08-04T00:00:00.000Z',
    }),
    { accepted: false, code: 'INVALID_LIFETIME' },
  );
});

void test('[IAM-013] secret rotation requires the current revision and increments the version', () => {
  const created = createServiceAccountV1(input());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const rotated = rotateServiceAccountSecretV1(created.value, {
    secretDigest: 'b'.repeat(64),
    issuedAt: '2026-08-03T00:01:00.000Z',
    expectedRevision: 1,
  });
  assert.equal(rotated.accepted, true);
  if (!rotated.accepted) return;
  assert.equal(rotated.value.secretVersion, 2);
  assert.equal(rotated.value.revision, 2);
  assert.deepEqual(
    rotateServiceAccountSecretV1(created.value, {
      secretDigest: 'c'.repeat(64),
      issuedAt: '2026-08-03T00:01:00.000Z',
      expectedRevision: 2,
    }),
    { accepted: false, code: 'REVISION_CONFLICT' },
  );
});

void test('[IAM-013] last-use is monotonic and unusable secrets fail closed', () => {
  const created = createServiceAccountV1(input({ secretExpiresAt: '2026-08-03T01:00:00.000Z' }));
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const used = markServiceAccountUsedV1(created.value, '2026-08-03T00:10:00.000Z');
  assert.equal(used.accepted, true);
  if (!used.accepted) return;
  assert.deepEqual(markServiceAccountUsedV1(used.value, '2026-08-03T00:09:00.000Z'), {
    accepted: false,
    code: 'INVALID_TIMESTAMP',
  });
  assert.deepEqual(isServiceAccountSecretUsableV1(used.value, '2026-08-03T01:00:00.000Z'), {
    accepted: false,
    code: 'SECRET_EXPIRED',
  });
});

void test('[IAM-013] revocation is permanent and revision guarded', () => {
  const created = createServiceAccountV1(input());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const revoked = revokeServiceAccountV1(created.value, '2026-08-03T00:02:00.000Z', 1);
  assert.equal(revoked.accepted, true);
  if (!revoked.accepted) return;
  assert.equal(revoked.value.status, 'REVOKED');
  assert.deepEqual(revokeServiceAccountV1(revoked.value, '2026-08-03T00:03:00.000Z', 2), {
    accepted: false,
    code: 'SECRET_REVOKED',
  });
});

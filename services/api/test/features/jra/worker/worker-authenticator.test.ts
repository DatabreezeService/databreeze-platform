import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createServiceAccountV1,
  type ServiceAccountV1,
} from '@databreeze/domain/service-account/v1';
import { parseStrictUtcTimestampV1 } from '@databreeze/domain/tenant-scope/v1';

import { ServiceAccountWorkerAuthenticator } from '../../../../src/features/jra/worker/service-account-worker-authenticator.js';
import type { WorkerCredentialLookupPortV1 } from '../../../../src/features/iam/application/worker-credential-lookup.port.js';

const secret = 'dbsa_test-secret';
const digest = 'a'.repeat(64);
const accountResult = createServiceAccountV1({
  id: '00000000-0000-4000-8000-000000000003',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  name: 'worker',
  permissions: ['job.execution.run'],
  secretDigest: digest,
  secretIssuedAt: '2026-08-13T00:00:00.000Z',
  createdAt: '2026-08-13T00:00:00.000Z',
});
if (!accountResult.accepted) throw new Error('invalid test account');

function lookup(account: ServiceAccountV1 | undefined): WorkerCredentialLookupPortV1 {
  return {
    findCurrentWorkerCredentialByDigest: async (secretDigest) => {
      await Promise.resolve();
      return secretDigest === digest ? account : undefined;
    },
    findCurrentWorkerCredentialById: async () => {
      await Promise.resolve();
      return account;
    },
  };
}

void test('authenticates only the current worker credential and derives scope and epoch from IAM', async () => {
  const authenticator = new ServiceAccountWorkerAuthenticator(
    lookup(accountResult.value),
    () => digest,
  );
  const result = await authenticator.authenticate({
    headers: { authorization: `Bearer ${secret}` },
  });
  assert.equal(result?.workerId, accountResult.value.id);
  assert.equal(result?.securityEpoch, accountResult.value.secretVersion);
  assert.deepEqual(result?.tenantScope, {
    scopeType: 'workspace',
    organizationId: accountResult.value.organizationId,
    workspaceId: accountResult.value.workspaceId,
  });
  if (!result) throw new Error('worker was not authenticated');
  assert.equal(await authenticator.isCurrent(result), true);
});

void test('rejects revoked, expired, wrong-permission, malformed, and stale-epoch credentials uniformly', async () => {
  const revokedAt = parseStrictUtcTimestampV1('2026-08-13T00:00:00.000Z');
  if (!revokedAt.accepted) throw new Error('invalid test timestamp');
  const revoked: ServiceAccountV1 = {
    ...accountResult.value,
    status: 'REVOKED',
    revokedAt: revokedAt.value,
  };
  const authenticator = new ServiceAccountWorkerAuthenticator(lookup(revoked), () => digest);
  assert.equal(
    await authenticator.authenticate({ headers: { authorization: `Bearer ${secret}` } }),
    undefined,
  );
  assert.equal(
    await authenticator.authenticate({ headers: { authorization: 'Basic something' } }),
    undefined,
  );
  assert.equal(
    await authenticator.authenticate({
      headers: { authorization: `Bearer ${secret}`, Authorization: `Bearer ${secret}` },
    }),
    undefined,
  );

  const wrongPermission: ServiceAccountV1 = {
    ...accountResult.value,
    permissions: ['artifact.record.read'],
  };
  assert.equal(
    await new ServiceAccountWorkerAuthenticator(lookup(wrongPermission), () => digest).authenticate(
      { headers: { authorization: `Bearer ${secret}` } },
    ),
    undefined,
  );

  const stale = new ServiceAccountWorkerAuthenticator(lookup(accountResult.value), () =>
    'c'.repeat(64),
  );
  assert.equal(
    await stale.authenticate({ headers: { authorization: `Bearer ${secret}` } }),
    undefined,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { ServiceAccountController } from '../../../src/features/iam/api/service-account.controller.js';
import { ServiceAccountProblemError } from '../../../src/features/iam/application/service-account-problem.error.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000731';
const actorId = '00000000-0000-4000-8000-000000000732';
const correlationId = '00000000-0000-4000-8000-000000000733';
const serviceAccountId = '00000000-0000-4000-8000-000000000734';

function context() {
  const result = createIamTenantContextV1({
    actorId,
    correlationId,
    tenantScope: { scopeType: 'organization', organizationId },
    idempotencyKey: 'controller',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function controller(overrides: Record<string, unknown> = {}) {
  const service = {
    list: () => Promise.resolve({ accepted: true as const, value: [{ id: serviceAccountId }] }),
    create: () =>
      Promise.resolve({
        accepted: true as const,
        value: { account: { id: serviceAccountId }, secret: 'one-time' },
      }),
    rotate: () =>
      Promise.resolve({
        accepted: true as const,
        value: { account: { id: serviceAccountId }, secret: 'successor' },
      }),
    revoke: () => Promise.resolve({ accepted: true as const, value: { id: serviceAccountId } }),
    ...overrides,
  };
  const requestContext = { resolve: () => Promise.resolve(context()) };
  return new ServiceAccountController(service as never, requestContext);
}

void test('[IAM-013] controller exposes safe list/create/rotate/revoke results', async () => {
  const instance = controller();
  assert.deepEqual(await instance.list({}, organizationId), [{ id: serviceAccountId }]);
  assert.deepEqual(
    await instance.create(
      {},
      {
        name: 'Import worker',
        permissions: ['artifact.record.read'],
      },
    ),
    { account: { id: serviceAccountId }, secret: 'one-time' },
  );
  assert.deepEqual(await instance.rotate({}, serviceAccountId, { expectedRevision: 1 }), {
    account: { id: serviceAccountId },
    secret: 'successor',
  });
  assert.deepEqual(await instance.revoke({}, serviceAccountId, { expectedRevision: 2 }), {
    id: serviceAccountId,
  });
});

void test('[IAM-013] controller rejects a path outside the authenticated organization', async () => {
  await assert.rejects(
    controller().list({}, '00000000-0000-4000-8000-000000000799'),
    (error: unknown) =>
      error instanceof ServiceAccountProblemError && error.code === 'SERVICE_ACCOUNT_SCOPE_DENIED',
  );
});

void test('[IAM-013] controller maps lifecycle failures to stable problem codes', async () => {
  await assert.rejects(
    controller({
      revoke: () => Promise.resolve({ accepted: false as const, code: 'CONFLICT' as const }),
    }).revoke({}, serviceAccountId, { expectedRevision: 1 }),
    (error: unknown) =>
      error instanceof ServiceAccountProblemError && error.code === 'SERVICE_ACCOUNT_CONFLICT',
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { AuditAttestationController } from '../../../src/features/aud/api/audit-attestation.controller.js';
import { AuditProblemError } from '../../../src/features/aud/application/audit-problem.error.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000841';
const workspaceId = '00000000-0000-4000-8000-000000000842';
const attestationId = '00000000-0000-4000-8000-000000000843';
const actorId = '00000000-0000-4000-8000-000000000844';
const correlationId = '00000000-0000-4000-8000-000000000845';

function context() {
  const result = createIamTenantContextV1({
    actorId,
    correlationId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    idempotencyKey: 'attestation-controller',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function controller(overrides: Record<string, unknown> = {}) {
  const service = {
    create: () => Promise.resolve({ accepted: true as const, value: { attestationId } }),
    verify: () => Promise.resolve({ accepted: true as const, value: true as const }),
    ...overrides,
  };
  return new AuditAttestationController(service as never, {
    resolve: () => Promise.resolve(context()),
  });
}

void test('[AUD-015, AUD-016] controller exposes create and verify operations', async () => {
  const instance = controller();
  assert.deepEqual(
    await instance.create(
      {},
      {
        signerKeyId: 'key-1',
        firstSequence: 1,
        lastSequence: 3,
        rootDigest: 'root',
      },
    ),
    { attestationId },
  );
  assert.deepEqual(await instance.verify({}, attestationId), { valid: true });
});

void test('[AUD-015] controller maps not-found and unavailable results', async () => {
  await assert.rejects(
    controller({
      verify: () => Promise.resolve({ accepted: false as const, code: 'NOT_FOUND' as const }),
    }).verify({}, attestationId),
    (error: unknown) =>
      error instanceof AuditProblemError && error.code === 'AUDIT_ATTESTATION_NOT_FOUND',
  );
  await assert.rejects(
    controller({
      create: () => Promise.resolve({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    }).create(
      {},
      {
        signerKeyId: 'key-1',
        firstSequence: 1,
        lastSequence: 3,
        rootDigest: 'root',
      },
    ),
    (error: unknown) =>
      error instanceof AuditProblemError && error.code === 'AUDIT_ATTESTATION_UNAVAILABLE',
  );
});

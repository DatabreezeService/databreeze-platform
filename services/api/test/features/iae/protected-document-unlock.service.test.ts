import { strict as assert } from 'node:assert';
import test from 'node:test';

import { InMemoryProtectedDocumentSecretInputAdapter } from '../../../src/features/iae/adapter/in-memory-protected-document-secret-input.adapter.js';
import { InMemoryProtectedDocumentUnlockRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-protected-document-unlock-repository.adapter.js';
import { ProtectedDocumentUnlockService } from '../../../src/features/iae/application/protected-document-unlock.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 1,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'protected-document',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const input = {
  requestId: '55555555-5555-4555-8555-555555555555',
  artifactVersionId: '66666666-6666-4666-8666-666666666666',
  mode: 'LOCAL_SECRET_INPUT',
  createdAt: '2026-08-02T00:00:00.000Z',
  expiresAt: '2026-08-02T00:20:00.000Z',
};

void test('IAE-015 service issues and consumes opaque one-shot unlock handles', async () => {
  const service = new ProtectedDocumentUnlockService(
    new InMemoryProtectedDocumentUnlockRepositoryAdapter(),
    new InMemoryProtectedDocumentSecretInputAdapter(() => '2026-08-02T00:05:00.000Z'),
  );
  const created = await service.create(context, input);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const handle = await service.issueHandle(context, created.value.requestId);
  assert.equal(handle.accepted, true);
  if (!handle.accepted) return;
  assert.equal(Object.hasOwn(handle.value, 'secret'), false);
  const outcome = await service.recordOutcome(context, created.value.requestId, {
    handleId: handle.value.handleId,
    expectedRevision: 1,
    outcome: 'UNLOCKED',
    occurredAt: '2026-08-02T00:01:00.000Z',
  });
  assert.equal(outcome.accepted, true);
  if (outcome.accepted) assert.equal(outcome.value.state, 'UNLOCKED');
  const replay = await service.recordOutcome(context, created.value.requestId, {
    handleId: handle.value.handleId,
    expectedRevision: 2,
    outcome: 'UNLOCKED',
    occurredAt: '2026-08-02T00:02:00.000Z',
  });
  assert.deepEqual(replay, { accepted: false, code: 'UNLOCK_HANDLE_INVALID' });
});

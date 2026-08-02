import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { AuditLedgerService } from '../../../src/features/aud/application/audit-ledger.service.js';
import { InMemoryAuditRepositoryAdapter } from '../../../src/features/aud/adapter/in-memory-audit-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

function context(idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid audit context');
  return result.value;
}

function input(eventId: string, action: 'job.started' | 'job.completed') {
  return {
    eventId,
    actorType: 'USER' as const,
    action,
    entityType: 'job',
    entityId: '00000000-0000-4000-8000-000000000020',
    entityRevision: action === 'job.started' ? 1 : 2,
    occurredAt: action === 'job.started' ? '2026-01-01T00:00:00.000Z' : '2026-01-01T00:00:01.000Z',
    summary: { outcome: 'accepted' },
  };
}

const digestPort = {
  digest: (value: string) => createHash('sha256').update(value).digest('base64url'),
};

void test('[AUD-015, AUD-016, AUD-017] audit service seals a verified tenant chain', async () => {
  const repository = new InMemoryAuditRepositoryAdapter();
  const service = new AuditLedgerService(repository, digestPort);
  await service.append(
    context('event-1'),
    input('00000000-0000-4000-8000-000000000021', 'job.started'),
  );
  await service.append(
    context('event-2'),
    input('00000000-0000-4000-8000-000000000022', 'job.completed'),
  );
  const sealed = await service.seal(context('seal-1'), '2026-01-01T00:01:00.000Z');
  assert.equal(sealed.accepted, true);
  if (!sealed.accepted) return;
  assert.equal(sealed.value.firstSequence, 1);
  assert.equal(sealed.value.lastSequence, 2);
  assert.equal(sealed.value.eventCount, 2);
  assert.deepEqual(await service.seal(context('seal-1'), '2026-01-01T00:01:00.000Z'), sealed);
  assert.equal((await repository.listSeals(context('read'))).length, 1);
});

void test('[AUD-015] empty audit scopes cannot be sealed', async () => {
  const service = new AuditLedgerService(new InMemoryAuditRepositoryAdapter(), digestPort);
  assert.deepEqual(await service.seal(context('empty-seal'), '2026-01-01T00:01:00.000Z'), {
    accepted: false,
    code: 'INVALID_SEQUENCE',
  });
});

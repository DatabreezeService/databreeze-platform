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

function input(eventId: string) {
  return {
    eventId,
    actorType: 'USER' as const,
    action: 'membership.invited' as const,
    entityType: 'membership',
    entityId: '00000000-0000-4000-8000-000000000020',
    entityRevision: 1,
    occurredAt: '2026-01-01T00:00:00.000Z',
    summary: { outcome: 'accepted' },
  };
}

void test('[AUD-001, AUD-003, AUD-005, IAM-009] service binds audit identity to the authorized context', async () => {
  const repository = new InMemoryAuditRepositoryAdapter();
  const service = new AuditLedgerService(repository, {
    digest: (value) => createHash('sha256').update(value).digest('base64url'),
  });
  const first = await service.append(
    context('audit-1'),
    input('00000000-0000-4000-8000-000000000021'),
  );
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.value.actor.actorId, actorId);
  assert.equal(first.value.correlationId, correlationId);
  assert.deepEqual(first.value.tenantScope, {
    scopeType: 'workspace',
    organizationId,
    workspaceId,
  });
  const repeated = await service.append(
    context('audit-1'),
    input('00000000-0000-4000-8000-000000000021'),
  );
  assert.deepEqual(repeated, first);
  assert.equal((await repository.listEvents(context('read'))).length, 1);
});

void test('[AUD-003, AUD-005] invalid actor and unsafe summary fail before persistence', async () => {
  const repository = new InMemoryAuditRepositoryAdapter();
  const service = new AuditLedgerService(repository, {
    digest: (value) => createHash('sha256').update(value).digest('base64url'),
  });
  assert.deepEqual(
    await service.append(context('audit-2'), {
      ...input('00000000-0000-4000-8000-000000000022'),
      actorType: 'ROOT',
    }),
    { accepted: false, code: 'INVALID_ACTOR' },
  );
  assert.deepEqual(
    await service.append(context('audit-3'), {
      ...input('00000000-0000-4000-8000-000000000023'),
      summary: { password: 'never-log' },
    }),
    { accepted: false, code: 'INVALID_SUMMARY' },
  );
  assert.deepEqual(await repository.listEvents(context('read')), []);
});

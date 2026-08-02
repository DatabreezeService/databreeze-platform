import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  appendAuditEventV1,
  createAuditSealV1,
  type AuditEventV1,
  type AuditSealV1,
} from '@databreeze/domain/audit/v1';

import { InMemoryAuditRepositoryAdapter } from '../../../src/features/aud/adapter/in-memory-audit-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';
const digestPort = {
  digest: (value: string) => createHash('sha256').update(value).digest('base64url'),
};

function context(workspace: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    actorId,
    correlationId,
    idempotencyKey: `audit-${workspace}`,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid audit context');
  return result.value;
}

function event(eventId: string, idempotencyKey: string, workspace = workspaceId): AuditEventV1 {
  const result = appendAuditEventV1(
    { events: [] },
    {
      eventId,
      action: 'membership.invited',
      tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
      actor: { actorType: 'USER', actorId },
      entityType: 'membership',
      entityId: '00000000-0000-4000-8000-000000000020',
      entityRevision: 1,
      occurredAt: '2026-01-01T00:00:00.000Z',
      correlationId,
      idempotencyKey,
      summary: { outcome: 'accepted' },
    },
    digestPort,
  );
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid audit event');
  return result.value.event;
}

void test('[AUD-001, AUD-004, AUD-006, IAM-009] audit events are append-only and scope-isolated', async () => {
  const repository = new InMemoryAuditRepositoryAdapter();
  const stored = event('00000000-0000-4000-8000-000000000021', 'invite-1');
  await repository.appendEvent(context(workspaceId), stored);
  assert.deepEqual(await repository.listEvents(context(workspaceId)), [stored]);
  assert.deepEqual(await repository.listEvents(context(siblingWorkspaceId)), []);
  assert.deepEqual(await repository.appendEvent(context(workspaceId), stored), stored);
  await assert.rejects(
    repository.appendEvent(
      context(workspaceId),
      event('00000000-0000-4000-8000-000000000022', 'invite-1'),
    ),
    /AUD_IDEMPOTENCY_CONFLICT/,
  );
});

void test('[AUD-015, AUD-016] seals are immutable and visible only within their tenant scope', async () => {
  const repository = new InMemoryAuditRepositoryAdapter();
  const stored = event('00000000-0000-4000-8000-000000000031', 'invite-3');
  await repository.appendEvent(context(workspaceId), stored);
  const createdSeal = createAuditSealV1(
    [stored],
    stored.tenantScope,
    '2026-01-01T00:01:00.000Z',
    digestPort,
  );
  assert.equal(createdSeal.accepted, true);
  if (!createdSeal.accepted) return;
  const seal: AuditSealV1 = createdSeal.value;
  await repository.saveSeal(context(workspaceId), seal);
  assert.deepEqual(await repository.listSeals(context(workspaceId)), [seal]);
  assert.deepEqual(await repository.listSeals(context(siblingWorkspaceId)), []);
  await assert.rejects(
    repository.saveSeal(context(workspaceId), { ...seal, rootDigest: 'tampered' }),
    /AUD_IMMUTABLE_SEAL/,
  );
});

void test('[AUD-007, IAM-009] audit transactions roll back staged events and seals', async () => {
  const repository = new InMemoryAuditRepositoryAdapter();
  const stored = event('00000000-0000-4000-8000-000000000041', 'invite-4');
  await assert.rejects(
    repository.withTransaction(context(workspaceId), async (transaction) => {
      await transaction.appendEvent(context(workspaceId), stored);
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.deepEqual(await repository.listEvents(context(workspaceId)), []);
  assert.deepEqual(await repository.listSeals(context(workspaceId)), []);
});

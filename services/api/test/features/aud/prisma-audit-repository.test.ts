import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { AuditLedgerService } from '../../../src/features/aud/application/audit-ledger.service.js';
import { appendAuditEventV1 } from '@databreeze/domain/audit/v1';
import {
  PrismaAuditRepositoryAdapter,
  type AuditDatabaseClientV1,
} from '../../../src/features/aud/adapter/prisma-audit-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000101';
const workspaceId = '00000000-0000-4000-8000-000000000102';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000103';
const actorId = '00000000-0000-4000-8000-000000000110';
const correlationId = '00000000-0000-4000-8000-000000000111';

function context(workspace = workspaceId, idempotencyKey = 'audit') {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid audit context');
  return result.value;
}

function delegate<TRow extends Record<string, unknown>>(rows: TRow[]) {
  return {
    create({ data }: { readonly data: TRow }) {
      const persisted = { ...data };
      rows.push(persisted);
      return Promise.resolve(persisted);
    },
    findUnique({ where }: { readonly where: { readonly id: string } }) {
      return Promise.resolve(rows.find((row) => row['id'] === where.id) ?? null);
    },
    findFirst({
      where,
      orderBy,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
    }) {
      const matching = rows.filter((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      );
      const [field, direction] = Object.entries(orderBy ?? {})[0] ?? [];
      if (field) {
        matching.sort((left, right) => {
          if (left[field] === right[field]) return 0;
          const comparison = left[field]! < right[field]! ? -1 : 1;
          return direction === 'desc' ? -comparison : comparison;
        });
      }
      return Promise.resolve(matching[0] ?? null);
    },
    findMany({
      where,
      orderBy,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy: Readonly<Record<string, 'asc' | 'desc'>>;
    }) {
      const filtered = rows.filter((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      );
      const [field, direction] = Object.entries(orderBy)[0] ?? [];
      return Promise.resolve(
        [...filtered].sort((left, right) => {
          if (!field) return 0;
          const leftValue = left[field];
          const rightValue = right[field];
          if (leftValue === rightValue) return 0;
          const comparison = leftValue! < rightValue! ? -1 : 1;
          return direction === 'desc' ? -comparison : comparison;
        }),
      );
    },
  };
}

function client(): AuditDatabaseClientV1 {
  const eventRows: Record<string, unknown>[] = [];
  const sealRows: Record<string, unknown>[] = [];
  const database = {
    auditEventRecord: delegate(eventRows),
    auditSealRecord: delegate(sealRows),
    async $transaction<TValue>(
      work: (transaction: AuditDatabaseClientV1) => Promise<TValue>,
    ): Promise<TValue> {
      const eventCount = eventRows.length;
      const sealCount = sealRows.length;
      try {
        return await work(database as unknown as AuditDatabaseClientV1);
      } catch (error) {
        eventRows.splice(eventCount);
        sealRows.splice(sealCount);
        throw error;
      }
    },
  };
  return database as unknown as AuditDatabaseClientV1;
}

const digest = {
  digest: (value: string) => createHash('sha256').update(value, 'utf8').digest('base64url'),
};

function input(eventId: string, action: 'job.started' | 'job.completed') {
  return {
    eventId,
    actorType: 'USER' as const,
    action,
    entityType: 'job',
    entityId: '00000000-0000-4000-8000-000000000120',
    entityRevision: action === 'job.started' ? 1 : 2,
    occurredAt: action === 'job.started' ? '2026-01-01T00:00:00.000Z' : '2026-01-01T00:00:01.000Z',
    summary: { outcome: 'accepted' },
  };
}

void test('[AUD-001, AUD-003, AUD-008, IAM-009] Prisma audit adapter persists an immutable scoped chain', async () => {
  const repository = new PrismaAuditRepositoryAdapter(client(), digest);
  const service = new AuditLedgerService(repository, digest);
  const first = await service.append(
    context(workspaceId, 'event-1'),
    input('00000000-0000-4000-8000-000000000121', 'job.started'),
  );
  assert.equal(first.accepted, true);
  const second = await service.append(
    context(workspaceId, 'event-2'),
    input('00000000-0000-4000-8000-000000000122', 'job.completed'),
  );
  assert.equal(second.accepted, true);
  assert.equal((await repository.listEvents(context(workspaceId, 'read'))).length, 2);
  assert.equal((await repository.listEvents(context(siblingWorkspaceId, 'sibling'))).length, 0);
  assert.equal((await repository.listEvents(context(organizationId, 'organization'))).length, 0);
});

void test('[AUD-015, AUD-018] Prisma audit adapter persists and reads immutable seals', async () => {
  const repository = new PrismaAuditRepositoryAdapter(client(), digest);
  const service = new AuditLedgerService(repository, digest);
  await service.append(
    context(workspaceId, 'event-3'),
    input('00000000-0000-4000-8000-000000000123', 'job.started'),
  );
  const sealed = await service.seal(context(workspaceId, 'seal-1'), '2026-01-01T00:01:00.000Z');
  assert.equal(sealed.accepted, true);
  assert.equal((await repository.listSeals(context(workspaceId, 'read'))).length, 1);
  assert.equal((await repository.listSeals(context(siblingWorkspaceId, 'sibling'))).length, 0);
});

void test('[AUD-002] Prisma audit transactions do not retain an event when the unit of work fails', async () => {
  const repository = new PrismaAuditRepositoryAdapter(client(), digest);
  await assert.rejects(
    repository.withTransaction(context(workspaceId, 'rollback'), async (transaction) => {
      const created = appendAuditEventV1(
        { events: [] },
        {
          ...input('00000000-0000-4000-8000-000000000124', 'job.started'),
          tenantScope: context(workspaceId, 'nested').tenantScope,
          actor: { actorType: 'USER', actorId },
          correlationId,
          idempotencyKey: 'nested',
        },
        digest,
      );
      assert.equal(created.accepted, true);
      if (!created.accepted) return;
      await transaction.appendEvent(context(workspaceId, 'nested'), created.value.event);
      await transaction.listEvents(context(workspaceId, 'inspect'));
      throw new Error('rollback-me');
    }),
    /rollback-me/u,
  );
  assert.equal((await repository.listEvents(context(workspaceId, 'after'))).length, 0);
});

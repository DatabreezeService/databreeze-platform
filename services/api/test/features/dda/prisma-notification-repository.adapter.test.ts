/* eslint-disable @typescript-eslint/require-await -- Promise-shaped in-memory test doubles. */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { DdaDatabaseClientV1 } from '../../../src/features/dda/adapter/dda-database.client.js';
import { PrismaNotificationRepositoryAdapter } from '../../../src/features/dda/notification/prisma-notification-repository.adapter.js';
import type {
  NotificationIntentInputV1,
  NotificationTenantContextV1,
} from '../../../src/features/dda/notification/notification-repository.port.js';

type Row = Record<string, unknown>;

const ids = {
  organization: '00000000-0000-4000-8000-000000000101',
  otherOrganization: '00000000-0000-4000-8000-000000000102',
  workspace: '00000000-0000-4000-8000-000000000103',
  otherWorkspace: '00000000-0000-4000-8000-000000000104',
  actor: '00000000-0000-4000-8000-000000000105',
  otherActor: '00000000-0000-4000-8000-000000000106',
  first: '00000000-0000-4000-8000-000000000107',
  second: '00000000-0000-4000-8000-000000000108',
  third: '00000000-0000-4000-8000-000000000109',
  firstEvent: '00000000-0000-4000-8000-000000000110',
  secondEvent: '00000000-0000-4000-8000-000000000111',
  thirdEvent: '00000000-0000-4000-8000-000000000112',
  correlation: '00000000-0000-4000-8000-000000000113',
  subject: '00000000-0000-4000-8000-000000000114',
};

const timestamp = '2026-08-13T08:00:00.000Z';

function context(input: {
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly actorId?: string;
}): NotificationTenantContextV1 {
  return {
    actorId: input.actorId ?? ids.actor,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: input.organizationId ?? ids.organization,
      workspaceId: input.workspaceId ?? ids.workspace,
    },
  };
}

function intent(
  input: Partial<NotificationIntentInputV1> & { readonly organizationId?: string } = {},
): NotificationIntentInputV1 {
  const eventId = input.eventId ?? ids.firstEvent;
  const notificationId = input.notificationId ?? ids.first;
  const recipientId = input.recipientId ?? ids.actor;
  const workspaceId = input.workspaceId ?? ids.workspace;
  const subjectId = input.subjectId ?? ids.subject;
  const bundleKey = input.bundleKey ?? `${eventId.replaceAll('-', '')}${'0'.repeat(32)}`;
  return {
    eventId,
    notificationId,
    recipientId,
    workspaceId,
    subjectId,
    kind: input.kind ?? 'SYNC_FAILED',
    action: input.action ?? 'OPEN_DATA',
    labelVi: input.labelVi ?? 'Đồng bộ cần chú ý',
    labelEn: input.labelEn ?? 'Sync needs attention',
    createdAt: input.createdAt ?? timestamp,
    correlationId: input.correlationId ?? ids.correlation,
    eventHash: input.eventHash ?? 'a'.repeat(64),
    authorizationProof: input.authorizationProof ?? {
      organizationId: input.organizationId ?? ids.organization,
      workspaceId,
      recipientId,
      subjectId,
      eventId,
      authorizationEpoch: 1,
      token: 'resolver-proof-token',
    },
    bundleKey,
    bundleWindowStart: input.bundleWindowStart ?? timestamp,
  };
}

function clone(value: unknown): unknown {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map((item) => clone(item));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR' && Array.isArray(expected)) {
      return expected.some((candidate) => matches(row, candidate as Row));
    }
    if (key === 'AND' && Array.isArray(expected)) {
      return expected.every((candidate) => matches(row, candidate as Row));
    }
    if (typeof expected === 'object' && expected !== null && !Array.isArray(expected)) {
      const operators = expected as Row;
      if ('lt' in operators) {
        const actual = row[key];
        const bound = operators['lt'];
        if (actual instanceof Date && bound instanceof Date)
          return actual.getTime() < bound.getTime();
        if (typeof actual === 'string' && typeof bound === 'string') return actual < bound;
        if (typeof actual === 'number' && typeof bound === 'number') return actual < bound;
        return false;
      }
      if ('equals' in operators) return row[key] === operators['equals'];
    }
    return row[key] === expected;
  });
}

class FakeNotificationDatabase {
  public readonly rows: Row[] = [];
  public readonly projectionReceipts: Row[] = [];
  public readonly checkpoints: Row[] = [];
  public readonly stateReceipts: Row[] = [];
  public readonly queries: { readonly operation: string; readonly input: Row }[] = [];

  public readonly ddaNotificationIntent = {
    create: async ({ data }: { readonly data: Row }) => {
      if (
        this.rows.some(
          (row) =>
            row['organizationId'] === data['organizationId'] &&
            row['workspaceId'] === data['workspaceId'] &&
            row['recipientId'] === data['recipientId'] &&
            row['bundleKey'] === data['bundleKey'],
        ) ||
        this.rows.some((row) => row['id'] === data['id'])
      ) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const row = { ...data };
      this.rows.push(row);
      return clone(row) as Row;
    },
    findFirst: async ({ where }: { readonly where: Row }) => {
      this.queries.push({ operation: 'findFirst', input: where });
      const row = this.rows.find((candidate) => matches(candidate, where));
      return row === undefined ? null : (clone(row) as Row);
    },
    findMany: async ({
      where,
      take,
    }: {
      readonly where: Row;
      readonly orderBy: readonly Row[];
      readonly take: number;
    }) => {
      this.queries.push({ operation: 'findMany', input: { where, take } });
      const rows = this.rows.filter((candidate) => matches(candidate, where));
      rows.sort((left, right) => {
        const createdAt =
          (right['createdAt'] as Date).getTime() - (left['createdAt'] as Date).getTime();
        return createdAt || String(right['id']).localeCompare(String(left['id']));
      });
      return rows.slice(0, take).map((row) => clone(row) as Row);
    },
    count: async ({ where }: { readonly where: Row }) => {
      this.queries.push({ operation: 'count', input: where });
      return this.rows.filter((candidate) => matches(candidate, where)).length;
    },
    updateMany: async ({ where, data }: { readonly where: Row; readonly data: Row }) => {
      this.queries.push({ operation: 'updateMany', input: { where, data } });
      let count = 0;
      for (const row of this.rows) {
        if (!matches(row, where)) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    },
  };

  public readonly ddaNotificationProjectionReceipt = {
    findFirst: async ({ where }: { readonly where: Row }) => {
      const row = this.projectionReceipts.find((candidate) => matches(candidate, where));
      return row === undefined ? null : (clone(row) as Row);
    },
    create: async ({ data }: { readonly data: Row }) => {
      if (
        this.projectionReceipts.some((row) =>
          ['organizationId', 'workspaceId', 'recipientId', 'eventId'].every(
            (key) => row[key] === data[key],
          ),
        )
      ) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const row = { ...data };
      this.projectionReceipts.push(row);
      return clone(row) as Row;
    },
  };

  public readonly ddaNotificationProjectionCheckpoint = {
    findFirst: async ({ where }: { readonly where: Row }) => {
      const row = this.checkpoints.find((candidate) => matches(candidate, where));
      return row === undefined ? null : (clone(row) as Row);
    },
    updateMany: async ({ where, data }: { readonly where: Row; readonly data: Row }) => {
      const row = this.checkpoints.find((candidate) => matches(candidate, where));
      if (row === undefined) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      readonly where: Row;
      readonly create: Row;
      readonly update: Row;
    }) => {
      const composite = where['organizationId_workspaceId_consumerKey'];
      const scope =
        typeof composite === 'object' && composite !== null ? (composite as Row) : where;
      const existing = this.checkpoints.find((candidate) => matches(candidate, scope));
      if (existing === undefined) {
        const row = { ...create };
        this.checkpoints.push(row);
        return clone(row) as Row;
      }
      Object.assign(existing, update);
      return clone(existing) as Row;
    },
  };

  public readonly ddaNotificationStateCommandReceipt = {
    findFirst: async ({ where }: { readonly where: Row }) => {
      const row = this.stateReceipts.find((candidate) => matches(candidate, where));
      return row === undefined ? null : (clone(row) as Row);
    },
    create: async ({ data }: { readonly data: Row }) => {
      if (
        this.stateReceipts.some((row) =>
          [
            'organizationId',
            'workspaceId',
            'recipientId',
            'notificationId',
            'idempotencyKey',
          ].every((key) => row[key] === data[key]),
        )
      ) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const row = { ...data };
      this.stateReceipts.push(row);
      return clone(row) as Row;
    },
  };

  public async $transaction<TValue>(work: (client: this) => Promise<TValue>): Promise<TValue> {
    return work(this);
  }
}

function adapterHarness() {
  const database = new FakeNotificationDatabase();
  return {
    database,
    adapter: new PrismaNotificationRepositoryAdapter(database as unknown as DdaDatabaseClientV1),
  };
}

void test('[NCO-001][NCO-002] durable intent writes are idempotent by tenant recipient event ID and reject hash conflicts', async () => {
  const { adapter, database } = adapterHarness();
  const current = context({});

  const first = await adapter.createIntent(current, intent());
  assert.equal(first.accepted, true);
  if (!first.accepted) throw new Error('TEST_INTENT_CREATE_FAILED');

  const replay = await adapter.createIntent(current, intent());
  assert.deepEqual(replay, first);
  assert.equal(database.rows.length, 1);

  const hashConflict = await adapter.createIntent(current, intent({ eventHash: 'b'.repeat(64) }));
  assert.deepEqual(hashConflict, { accepted: false, code: 'CONFLICT' });
});

void test('[NCO-002][NCO-014] durable ordinary deliveries upsert one recipient bundle while retaining event receipts', async () => {
  const { adapter, database } = adapterHarness();
  const current = context({});
  const sharedBundle = 'f'.repeat(64);

  const first = await adapter.createIntent(
    current,
    intent({ bundleKey: sharedBundle, bundleWindowStart: timestamp }),
  );
  assert.equal(first.accepted, true);

  const second = await adapter.createIntent(
    current,
    intent({
      eventId: ids.secondEvent,
      eventHash: 'b'.repeat(64),
      bundleKey: sharedBundle,
      bundleWindowStart: timestamp,
      createdAt: '2026-08-13T08:01:00.000Z',
    }),
  );
  assert.equal(second.accepted, true);
  assert.equal(database.rows.length, 1);
  assert.equal(database.projectionReceipts.length, 2);
  assert.equal(database.rows[0]?.['occurrenceCount'], 2);
  assert.equal(database.rows[0]?.['eventId'], ids.secondEvent);
  assert.equal((database.rows[0]?.['firstOccurredAt'] as Date).toISOString(), timestamp);
  assert.equal(
    (database.rows[0]?.['lastOccurredAt'] as Date).toISOString(),
    '2026-08-13T08:01:00.000Z',
  );
});

void test('[NCO-001][NCO-002] durable projection checkpoints are tenant-scoped, monotonic, and hash-conflict safe', async () => {
  const { adapter, database } = adapterHarness();
  const checkpoint = {
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    consumerKey: 'notification-test-consumer',
    lastEventId: ids.firstEvent,
    lastEventHash: 'a'.repeat(64),
    lastOccurredAt: timestamp,
  };

  assert.deepEqual(await adapter.advanceCheckpoint(checkpoint), { accepted: true });
  assert.deepEqual(await adapter.getCheckpoint(checkpoint), checkpoint);
  assert.deepEqual(await adapter.advanceCheckpoint(checkpoint), { accepted: true });
  assert.deepEqual(
    await adapter.advanceCheckpoint({ ...checkpoint, lastEventHash: 'b'.repeat(64) }),
    { accepted: false, code: 'CONFLICT' },
  );
  assert.deepEqual(
    await adapter.advanceCheckpoint({
      ...checkpoint,
      lastEventId: ids.thirdEvent,
      lastOccurredAt: '2026-08-13T07:00:00.000Z',
    }),
    { accepted: true },
  );
  assert.deepEqual(
    await adapter.advanceCheckpoint({
      ...checkpoint,
      lastEventId: ids.secondEvent,
      lastEventHash: 'b'.repeat(64),
      lastOccurredAt: '2026-08-13T08:01:00.000Z',
    }),
    { accepted: true },
  );
  assert.equal(database.checkpoints[0]?.['revision'], 2);
  assert.equal(database.checkpoints[0]?.['lastEventId'], ids.secondEvent);
});

void test('[NCO-004][NCO-012][NCO-020] list uses exact tenant recipient filters, bounded keyset reads, and authoritative unread count', async () => {
  const { adapter, database } = adapterHarness();
  const current = context({});
  await adapter.createIntent(current, intent());
  await adapter.createIntent(
    current,
    intent({
      eventId: ids.secondEvent,
      notificationId: ids.second,
      createdAt: '2026-08-13T08:01:00.000Z',
      eventHash: 'b'.repeat(64),
    }),
  );
  await adapter.createIntent(
    current,
    intent({
      eventId: ids.thirdEvent,
      notificationId: ids.third,
      recipientId: ids.otherActor,
      eventHash: 'c'.repeat(64),
    }),
  );
  await adapter.createIntent(
    context({ organizationId: ids.otherOrganization, workspaceId: ids.otherWorkspace }),
    intent({
      eventId: ids.thirdEvent,
      notificationId: ids.third,
      workspaceId: ids.otherWorkspace,
      eventHash: 'd'.repeat(64),
      organizationId: ids.otherOrganization,
    }),
  );

  const page = await adapter.list(current, { limit: 1 });
  assert.equal(page.accepted, true);
  if (!page.accepted) throw new Error('TEST_LIST_FAILED');
  assert.equal(page.value.items.length, 1);
  assert.equal(page.value.unreadCount, 2);
  assert.equal(database.queries.at(-1)?.operation, 'count');
  const listQuery = database.queries.findLast((query) => query.operation === 'findMany');
  assert.deepEqual(listQuery?.input['where'], {
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    recipientId: ids.actor,
  });
  assert.equal(listQuery?.input['take'], 2);
  assert.equal(typeof page.value.nextCursor, 'string');

  const next = await adapter.list(
    current,
    page.value.nextCursor === undefined
      ? { limit: 1 }
      : { limit: 1, cursor: page.value.nextCursor },
  );
  assert.equal(next.accepted, true);
  if (!next.accepted) throw new Error('TEST_NEXT_PAGE_FAILED');
  assert.equal(next.value.items.length, 1);
  assert.equal(next.value.unreadCount, 2);
});

void test('[NCO-012] durable state transitions are monotonic, replay-safe, and dismissible without unread count drift', async () => {
  const { adapter } = adapterHarness();
  const current = context({});
  await adapter.createIntent(current, intent());

  const read = await adapter.setState(current, {
    notificationId: ids.first,
    state: 'READ',
    expectedRevision: 1,
  });
  assert.equal(read.accepted, true);
  if (!read.accepted) throw new Error('TEST_READ_FAILED');
  assert.equal(read.value.state, 'READ');
  assert.equal(read.value.revision, 2);

  const replay = await adapter.setState(current, {
    notificationId: ids.first,
    state: 'READ',
    expectedRevision: 1,
  });
  assert.deepEqual(replay, read);

  const archived = await adapter.setState(current, {
    notificationId: ids.first,
    state: 'ARCHIVED',
    expectedRevision: 2,
  });
  assert.equal(archived.accepted, true);
  if (!archived.accepted) throw new Error('TEST_ARCHIVE_FAILED');
  assert.equal(archived.value.state, 'ARCHIVED');

  const staleRead = await adapter.setState(current, {
    notificationId: ids.first,
    state: 'READ',
    expectedRevision: 3,
  });
  assert.deepEqual(staleRead, { accepted: false, code: 'CONFLICT' });

  const dismissed = await adapter.setState(current, {
    notificationId: ids.first,
    state: 'DISMISSED',
    expectedRevision: 3,
  });
  assert.equal(dismissed.accepted, true);
  if (!dismissed.accepted) throw new Error('TEST_DISMISS_FAILED');
  assert.equal(dismissed.value.state, 'DISMISSED');

  const staleArchive = await adapter.setState(current, {
    notificationId: ids.first,
    state: 'ARCHIVED',
    expectedRevision: 4,
  });
  assert.deepEqual(staleArchive, { accepted: false, code: 'CONFLICT' });
});

void test('[NCO-003][NCO-004] invalid persisted rows fail closed before crossing the repository boundary', async () => {
  const { adapter, database } = adapterHarness();
  const current = context({});
  await adapter.createIntent(current, intent());
  database.rows[0]!['labelEn'] = 'C:\\secret.txt';

  const result = await adapter.list(current, { limit: 20 });
  assert.deepEqual(result, { accepted: false, code: 'UNAVAILABLE' });
});

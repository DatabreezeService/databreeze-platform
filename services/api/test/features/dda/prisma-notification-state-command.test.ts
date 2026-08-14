/* eslint-disable @typescript-eslint/require-await -- Promise-shaped in-memory test doubles. */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { DdaDatabaseClientV1 } from '../../../src/features/dda/adapter/dda-database.client.js';
import { PrismaNotificationRepositoryAdapter } from '../../../src/features/dda/notification/prisma-notification-repository.adapter.js';
import type { NotificationStateCommandInputV1 } from '../../../src/features/dda/notification/notification-state-command.port.js';
import type { NotificationTenantContextV1 } from '../../../src/features/dda/notification/notification-repository.port.js';

type Row = Record<string, unknown>;

const ids = {
  organization: '00000000-0000-4000-8000-000000000201',
  workspace: '00000000-0000-4000-8000-000000000202',
  recipient: '00000000-0000-4000-8000-000000000203',
  notification: '00000000-0000-4000-8000-000000000204',
  subject: '00000000-0000-4000-8000-000000000205',
  event: '00000000-0000-4000-8000-000000000206',
  correlation: '00000000-0000-4000-8000-000000000207',
};

const context: NotificationTenantContextV1 = {
  actorId: ids.recipient,
  tenantScope: {
    scopeType: 'workspace',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
  },
};

const otherRecipientContext: NotificationTenantContextV1 = {
  actorId: '00000000-0000-4000-8000-000000000208',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
  },
};

function row(input: { readonly state?: string; readonly revision?: number } = {}): Row {
  const createdAt = new Date('2026-08-14T08:00:00.000Z');
  return {
    id: ids.notification,
    eventId: ids.event,
    eventHash: 'a'.repeat(64),
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    recipientId: ids.recipient,
    subjectId: ids.subject,
    kind: 'SYNC_FAILED',
    action: 'OPEN_DATA',
    labelVi: 'Đồng bộ cần chú ý',
    labelEn: 'Sync needs attention',
    createdAt,
    correlationId: ids.correlation,
    occurrenceCount: 1,
    firstOccurredAt: createdAt,
    lastOccurredAt: createdAt,
    state: input.state ?? 'UNREAD',
    revision: input.revision ?? 1,
    dismissedAt: null,
    bundleKey: 'b'.repeat(64),
    bundleWindowStart: createdAt,
  };
}

function command(
  input: Partial<NotificationStateCommandInputV1> = {},
): NotificationStateCommandInputV1 {
  return {
    context: input.context ?? context,
    notificationId: ids.notification,
    targetState: input.targetState ?? 'READ',
    expectedRevision: input.expectedRevision ?? 1,
    idempotencyKey: input.idempotencyKey ?? 'notification-command-1',
    fingerprint: input.fingerprint ?? 'c'.repeat(64),
  };
}

function matches(rowValue: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => rowValue[key] === value);
}

class FakeStateDatabase {
  public notification = row();
  public readonly receipts: Row[] = [];
  public failReceipt = false;
  public raceReceipt = false;

  public readonly ddaNotificationIntent = {
    findFirst: async ({ where }: { readonly where: Row }) =>
      matches(this.notification, where) ? { ...this.notification } : null,
    updateMany: async ({ where, data }: { readonly where: Row; readonly data: Row }) => {
      if (!matches(this.notification, where)) return { count: 0 };
      Object.assign(this.notification, data);
      return { count: 1 };
    },
    create: async () => ({ ...this.notification }),
    findMany: async () => [],
    count: async () => 0,
  };

  public readonly ddaNotificationStateCommandReceipt = {
    findFirst: async ({ where }: { readonly where: Row }) => {
      const found = this.receipts.find((receipt) => matches(receipt, where));
      return found === undefined ? null : { ...found };
    },
    create: async ({ data }: { readonly data: Row }) => {
      if (this.raceReceipt) {
        this.raceReceipt = false;
        this.receipts.push({ ...data });
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      if (this.failReceipt) throw new Error('receipt write failed');
      this.receipts.push({ ...data });
      return { ...data };
    },
  };

  public async $transaction<TValue>(work: (client: this) => Promise<TValue>): Promise<TValue> {
    const saved = { ...this.notification };
    try {
      return await work(this);
    } catch (error) {
      this.notification = saved;
      throw error;
    }
  }
}

function adapterHarness() {
  const database = new FakeStateDatabase();
  return {
    database,
    adapter: new PrismaNotificationRepositoryAdapter(database as unknown as DdaDatabaseClientV1),
  };
}

void test('[NCO-012] state mutation and result receipt commit atomically with exact tenant and recipient binding', async () => {
  const { adapter, database } = adapterHarness();

  const result = await adapter.setStateCommand(command());

  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('TEST_STATE_COMMAND_REJECTED');
  assert.equal(result.value.state, 'READ');
  assert.equal(result.value.revision, 2);
  assert.equal(database.notification['state'], 'READ');
  assert.equal(database.receipts.length, 1);
  assert.equal(database.receipts[0]?.['recipientId'], ids.recipient);
  assert.equal(database.receipts[0]?.['expectedRevision'], 1);
  assert.equal(database.receipts[0]?.['targetState'], 'READ');
});

void test('[NCO-012] command replay returns the exact prior result and changed payload conflicts', async () => {
  const { adapter, database } = adapterHarness();
  const first = await adapter.setStateCommand(command());
  assert.equal(first.accepted, true);

  const replay = await adapter.setStateCommand(command());
  assert.deepEqual(replay, first);
  assert.equal(database.receipts.length, 1);

  const conflict = await adapter.setStateCommand(command({ fingerprint: 'd'.repeat(64) }));
  assert.deepEqual(conflict, { accepted: false, code: 'CONFLICT' });
  assert.equal(database.receipts.length, 1);
});

void test('[NCO-012] a new idempotency key cannot bypass the notification revision CAS', async () => {
  const { adapter } = adapterHarness();
  const first = await adapter.setStateCommand(command());
  assert.equal(first.accepted, true);

  const staleSameState = await adapter.setStateCommand(
    command({ idempotencyKey: 'notification-command-2' }),
  );
  assert.deepEqual(staleSameState, { accepted: false, code: 'CONFLICT' });
});

void test('[NCO-012] receipt failure rolls back the notification state mutation', async () => {
  const { adapter, database } = adapterHarness();
  database.failReceipt = true;

  const result = await adapter.setStateCommand(command());

  assert.deepEqual(result, { accepted: false, code: 'UNAVAILABLE' });
  assert.equal(database.notification['state'], 'UNREAD');
  assert.equal(database.notification['revision'], 1);
  assert.equal(database.receipts.length, 0);
});

void test('[NCO-004][NCO-012] a different recipient cannot mutate or replay another recipient notification', async () => {
  const { adapter, database } = adapterHarness();

  const result = await adapter.setStateCommand(command({ context: otherRecipientContext }));

  assert.deepEqual(result, { accepted: false, code: 'NOT_FOUND' });
  assert.equal(database.notification['state'], 'UNREAD');
  assert.equal(database.receipts.length, 0);
});

void test('[NCO-012] a P2002 receipt race replays the committed receipt or reports its fingerprint conflict', async () => {
  const { adapter, database } = adapterHarness();
  database.raceReceipt = true;

  const replay = await adapter.setStateCommand(command());

  assert.equal(replay.accepted, true);
  if (!replay.accepted) throw new Error('TEST_RACE_REPLAY_REJECTED');
  assert.equal(replay.value.state, 'READ');
  assert.equal(database.notification['state'], 'UNREAD');
  assert.equal(database.receipts.length, 1);

  const conflict = await adapter.setStateCommand(command({ fingerprint: 'e'.repeat(64) }));
  assert.deepEqual(conflict, { accepted: false, code: 'CONFLICT' });
});

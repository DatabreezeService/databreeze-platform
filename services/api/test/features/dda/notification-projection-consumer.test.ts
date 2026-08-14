/* eslint-disable @typescript-eslint/require-await -- Promise-shaped in-memory test doubles. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NotificationProjectionConsumerV1,
  type CommittedNotificationEventV1,
  type NotificationProjectionCheckpointPortV1,
  type NotificationRecipientResolverPortV1,
} from '../../../src/features/dda/notification/notification-projection-consumer.js';
import type {
  NotificationIntentInputV1,
  NotificationRepositoryPortV1,
  NotificationTenantContextV1,
} from '../../../src/features/dda/notification/notification-repository.port.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000101',
  workspace: '00000000-0000-4000-8000-000000000102',
  subject: '00000000-0000-4000-8000-000000000103',
  firstEvent: '00000000-0000-4000-8000-000000000104',
  secondEvent: '00000000-0000-4000-8000-000000000105',
  firstRecipient: '00000000-0000-4000-8000-000000000106',
  secondRecipient: '00000000-0000-4000-8000-000000000107',
  correlation: '00000000-0000-4000-8000-000000000108',
};

const scope = {
  scopeType: 'workspace' as const,
  organizationId: ids.organization,
  workspaceId: ids.workspace,
};

function event(input: Partial<CommittedNotificationEventV1> = {}): CommittedNotificationEventV1 {
  return {
    committed: true,
    tenantScope: scope,
    eventId: input.eventId ?? ids.firstEvent,
    eventHash: input.eventHash ?? 'a'.repeat(64),
    subjectId: input.subjectId ?? ids.subject,
    kind: input.kind ?? 'SYNC_FAILED',
    unresolved: input.unresolved ?? true,
    createdAt: input.createdAt ?? '2026-08-14T08:00:00.000Z',
    correlationId: input.correlationId ?? ids.correlation,
  };
}

function proof(
  input: {
    readonly eventId?: string;
    readonly recipientId?: string;
    readonly subjectId?: string;
  } = {},
) {
  return {
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    recipientId: input.recipientId ?? ids.firstRecipient,
    subjectId: input.subjectId ?? ids.subject,
    eventId: input.eventId ?? ids.firstEvent,
    authorizationEpoch: 7,
    token: 'resolver-proof-token',
  };
}

class FakeCheckpointStore implements NotificationProjectionCheckpointPortV1 {
  public checkpoint:
    | {
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly consumerKey: string;
        readonly lastEventId: string;
        readonly lastEventHash: string;
        readonly lastOccurredAt: string;
      }
    | undefined;
  public advances = 0;

  public async getCheckpoint(input: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly consumerKey: string;
  }) {
    if (
      this.checkpoint?.organizationId !== input.organizationId ||
      this.checkpoint?.workspaceId !== input.workspaceId ||
      this.checkpoint?.consumerKey !== input.consumerKey
    )
      return null;
    return this.checkpoint;
  }

  public async advanceCheckpoint(input: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly consumerKey: string;
    readonly lastEventId: string;
    readonly lastEventHash: string;
    readonly lastOccurredAt: string;
  }) {
    this.advances += 1;
    this.checkpoint = Object.freeze({ ...input });
    return { accepted: true as const };
  }
}

function repositoryHarness() {
  const calls: NotificationIntentInputV1[] = [];
  const delivered = new Set<string>();
  const repository: NotificationRepositoryPortV1 = {
    async createIntent(_context: NotificationTenantContextV1, input: NotificationIntentInputV1) {
      calls.push(input);
      const key = `${input.eventId}:${input.recipientId}`;
      if (delivered.has(key)) return { accepted: false as const, code: 'CONFLICT' as const };
      delivered.add(key);
      return { accepted: true as const, value: undefined as never };
    },
    async list() {
      return { accepted: false as const, code: 'UNAVAILABLE' as const };
    },
    async setState() {
      return { accepted: false as const, code: 'UNAVAILABLE' as const };
    },
  };
  return { calls, repository };
}

function resolverHarness(
  recipients: readonly {
    readonly recipientId: string;
    readonly proof: ReturnType<typeof proof>;
  }[],
): NotificationRecipientResolverPortV1 {
  return {
    resolve: async () => ({ accepted: true as const, recipients }),
  };
}

void test('[NCO-001] uncommitted events do not resolve recipients or create intents', async () => {
  const { repository, calls } = repositoryHarness();
  let resolved = 0;
  const resolver: NotificationRecipientResolverPortV1 = {
    resolve: async () => {
      resolved += 1;
      return { accepted: true as const, recipients: [] };
    },
  };
  const checkpoints = new FakeCheckpointStore();
  const consumer = new NotificationProjectionConsumerV1(repository, resolver, checkpoints);

  const result = await consumer.consume({ ...event(), committed: false });

  assert.deepEqual(result, { accepted: false, code: 'NOT_COMMITTED' });
  assert.equal(resolved, 0);
  assert.equal(calls.length, 0);
  assert.equal(checkpoints.advances, 0);
});

void test('[NCO-004][NCO-005] only resolver-approved active recipients receive tenant-scoped intents', async () => {
  const { repository, calls } = repositoryHarness();
  const checkpoints = new FakeCheckpointStore();
  const consumer = new NotificationProjectionConsumerV1(
    repository,
    resolverHarness([
      { recipientId: ids.firstRecipient, proof: proof() },
      {
        recipientId: ids.secondRecipient,
        proof: proof({ recipientId: ids.secondRecipient }),
      },
    ]),
    checkpoints,
  );

  const result = await consumer.consume(event());

  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('TEST_CONSUME_REJECTED');
  assert.equal(result.deliveredCount, 2);
  assert.deepEqual(
    calls.map((call) => call.recipientId),
    [ids.firstRecipient, ids.secondRecipient],
  );
  for (const call of calls) {
    assert.equal(call.workspaceId, ids.workspace);
    assert.equal(call.authorizationProof?.organizationId, ids.organization);
    assert.equal(call.authorizationProof?.workspaceId, ids.workspace);
    assert.equal(call.authorizationProof?.recipientId, call.recipientId);
  }
});

void test('[NCO-004] mismatched resolver proof rejects delivery and leaves checkpoint unchanged', async () => {
  const { repository, calls } = repositoryHarness();
  const checkpoints = new FakeCheckpointStore();
  const consumer = new NotificationProjectionConsumerV1(
    repository,
    resolverHarness([
      { recipientId: ids.firstRecipient, proof: proof({ recipientId: ids.secondRecipient }) },
    ]),
    checkpoints,
  );

  const result = await consumer.consume(event());

  assert.deepEqual(result, { accepted: false, code: 'AUTHORIZATION_INVALID' });
  assert.equal(calls.length, 0);
  assert.equal(checkpoints.advances, 0);
});

void test('[NCO-005] revoked or inactive recipients produce no notification delivery', async () => {
  const { repository, calls } = repositoryHarness();
  const checkpoints = new FakeCheckpointStore();
  const consumer = new NotificationProjectionConsumerV1(
    repository,
    { resolve: async () => ({ accepted: true as const, recipients: [] }) },
    checkpoints,
  );

  const result = await consumer.consume(event());

  assert.deepEqual(result, { accepted: true, deliveredCount: 0, replayed: false });
  assert.equal(calls.length, 0);
  assert.equal(checkpoints.advances, 1);
});

void test('[NCO-002][NCO-014] restart replay is checkpoint-idempotent and bundles non-security events', async () => {
  const first = repositoryHarness();
  const checkpoints = new FakeCheckpointStore();
  const recipients: NotificationRecipientResolverPortV1 = {
    resolve: async (input) => ({
      accepted: true as const,
      recipients: [
        {
          recipientId: ids.firstRecipient,
          proof: proof({ eventId: input.eventId }),
        },
      ],
    }),
  };
  const firstConsumer = new NotificationProjectionConsumerV1(
    first.repository,
    recipients,
    checkpoints,
  );
  const firstResult = await firstConsumer.consume(event());
  assert.equal(firstResult.accepted, true);

  const second = repositoryHarness();
  const secondConsumer = new NotificationProjectionConsumerV1(
    second.repository,
    recipients,
    checkpoints,
  );
  const replayResult = await secondConsumer.consume(event());
  assert.equal(replayResult.accepted, true);
  if (!replayResult.accepted) throw new Error('TEST_REPLAY_REJECTED');
  assert.equal(replayResult.replayed, true);
  assert.equal(second.calls.length, 0);

  const nextResult = await firstConsumer.consume(
    event({
      eventId: ids.secondEvent,
      eventHash: 'b'.repeat(64),
      createdAt: '2026-08-14T08:01:00.000Z',
    }),
  );
  assert.equal(nextResult.accepted, true);
  assert.equal(first.calls[0]?.bundleKey, first.calls[1]?.bundleKey);
});

void test('[NCO-014] security events never share the ordinary bundle key', async () => {
  const { repository, calls } = repositoryHarness();
  const checkpoints = new FakeCheckpointStore();
  const consumer = new NotificationProjectionConsumerV1(
    repository,
    {
      resolve: async (input) => ({
        accepted: true as const,
        recipients: [
          {
            recipientId: ids.firstRecipient,
            proof: proof({ eventId: input.eventId }),
          },
        ],
      }),
    },
    checkpoints,
  );
  await consumer.consume(event());
  await consumer.consume(
    event({
      eventId: ids.secondEvent,
      eventHash: 'b'.repeat(64),
      kind: 'SECURITY_NOTICE',
      createdAt: '2026-08-14T08:01:00.000Z',
    }),
  );

  assert.notEqual(calls[0]?.bundleKey, calls[1]?.bundleKey);
});

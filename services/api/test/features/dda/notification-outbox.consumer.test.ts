/* eslint-disable @typescript-eslint/require-await -- Promise-shaped in-memory test doubles. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NotificationOutboxConsumerV1,
  type NotificationCommittedOutboxPortV1,
  type NotificationOutboxRecordV1,
} from '../../../src/features/dda/notification/notification-outbox.consumer.js';
import {
  NotificationProjectionConsumerV1,
  type CommittedNotificationEventV1,
  type NotificationProjectionCheckpointPortV1,
} from '../../../src/features/dda/notification/notification-projection-consumer.js';
import type {
  NotificationIntentInputV1,
  NotificationRepositoryPortV1,
  NotificationTenantContextV1,
} from '../../../src/features/dda/notification/notification-repository.port.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000501',
  workspace: '00000000-0000-4000-8000-000000000502',
  subject: '00000000-0000-4000-8000-000000000503',
  routineEvent: '00000000-0000-4000-8000-000000000504',
  blockedEvent: '00000000-0000-4000-8000-000000000505',
  recipient: '00000000-0000-4000-8000-000000000506',
  correlation: '00000000-0000-4000-8000-000000000507',
};

const scope = {
  scopeType: 'workspace' as const,
  organizationId: ids.organization,
  workspaceId: ids.workspace,
};

const routine: NotificationOutboxRecordV1 = Object.freeze({
  eventId: ids.routineEvent,
  eventHash: 'a'.repeat(64),
  occurredAt: '2026-08-14T08:00:00.000Z',
});

const blockedEvent: CommittedNotificationEventV1 = Object.freeze({
  committed: true,
  tenantScope: scope,
  eventId: ids.blockedEvent,
  eventHash: 'b'.repeat(64),
  subjectId: ids.subject,
  kind: 'REFRESH_BLOCKED',
  unresolved: true,
  createdAt: '2026-08-14T08:01:00.000Z',
  correlationId: ids.correlation,
});

const blocked: NotificationOutboxRecordV1 = Object.freeze({
  eventId: ids.blockedEvent,
  eventHash: 'b'.repeat(64),
  occurredAt: blockedEvent.createdAt,
  event: blockedEvent,
});

class DurableOutboxDouble implements NotificationCommittedOutboxPortV1 {
  public readonly records = [routine, blocked] as const;

  public async list(input: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly after?: { readonly occurredAt: string; readonly eventId: string };
    readonly limit: number;
  }) {
    const records = this.records.filter((record) => {
      if (input.after === undefined) return true;
      return (
        record.occurredAt > input.after.occurredAt ||
        (record.occurredAt === input.after.occurredAt && record.eventId > input.after.eventId)
      );
    });
    return { accepted: true as const, records: records.slice(0, input.limit + 1) };
  }
}

class DurableCheckpointDouble implements NotificationProjectionCheckpointPortV1 {
  private checkpoint: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly consumerKey: string;
    readonly lastEventId: string;
    readonly lastEventHash: string;
    readonly lastOccurredAt: string;
  } | null = null;

  public async getCheckpoint(input: {
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly consumerKey: string;
  }) {
    if (
      this.checkpoint === null ||
      this.checkpoint.organizationId !== input.organizationId ||
      this.checkpoint.workspaceId !== input.workspaceId ||
      this.checkpoint.consumerKey !== input.consumerKey
    ) {
      return null;
    }
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
    if (
      this.checkpoint !== null &&
      input.lastOccurredAt === this.checkpoint.lastOccurredAt &&
      input.lastEventId === this.checkpoint.lastEventId &&
      input.lastEventHash !== this.checkpoint.lastEventHash
    ) {
      return { accepted: false as const, code: 'CONFLICT' as const };
    }
    if (
      this.checkpoint !== null &&
      (input.lastOccurredAt < this.checkpoint.lastOccurredAt ||
        (input.lastOccurredAt === this.checkpoint.lastOccurredAt &&
          input.lastEventId < this.checkpoint.lastEventId))
    ) {
      return { accepted: true as const };
    }
    this.checkpoint = Object.freeze({ ...input });
    return { accepted: true as const };
  }
}

function repositoryDouble() {
  const calls: NotificationIntentInputV1[] = [];
  const persisted = new Set<string>();
  const repository: NotificationRepositoryPortV1 = {
    async createIntent(_context: NotificationTenantContextV1, input: NotificationIntentInputV1) {
      calls.push(input);
      persisted.add(`${input.eventId}:${input.recipientId}`);
      return { accepted: true as const, value: undefined as never };
    },
    async list() {
      return { accepted: false as const, code: 'UNAVAILABLE' as const };
    },
    async setState() {
      return { accepted: false as const, code: 'UNAVAILABLE' as const };
    },
  };
  return { calls, persisted, repository };
}

void test('[NCO-002][NCO-004] committed outbox consumes routine and actionable events with one durable checkpoint', async () => {
  const checkpoints = new DurableCheckpointDouble();
  const outbox = new DurableOutboxDouble();
  const { calls, repository } = repositoryDouble();
  const projection = new NotificationProjectionConsumerV1(
    repository,
    {
      resolve: async (event) => ({
        accepted: true as const,
        recipients: [
          {
            recipientId: ids.recipient,
            proof: {
              organizationId: ids.organization,
              workspaceId: ids.workspace,
              recipientId: ids.recipient,
              subjectId: event.subjectId,
              eventId: event.eventId,
              authorizationEpoch: 3,
              token: 'active-iam-proof',
            },
          },
        ],
      }),
    },
    checkpoints,
  );
  const consumer = new NotificationOutboxConsumerV1(outbox, projection, checkpoints);

  const result = await consumer.consumePending({
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    limit: 2,
  });

  assert.deepEqual(result, {
    accepted: true,
    consumedCount: 2,
    deliveredCount: 1,
    hasMore: false,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.eventId, ids.blockedEvent);
  assert.equal(calls[0]?.authorizationProof?.recipientId, ids.recipient);
});

void test('[NCO-002][NCO-014] a new consumer instance resumes after restart without replaying delivered events', async () => {
  const checkpoints = new DurableCheckpointDouble();
  const outbox = new DurableOutboxDouble();
  const { calls, repository } = repositoryDouble();
  const resolver = {
    resolve: async (event: CommittedNotificationEventV1) => ({
      accepted: true as const,
      recipients: [
        {
          recipientId: ids.recipient,
          proof: {
            organizationId: ids.organization,
            workspaceId: ids.workspace,
            recipientId: ids.recipient,
            subjectId: event.subjectId,
            eventId: event.eventId,
            authorizationEpoch: 3,
            token: 'active-iam-proof',
          },
        },
      ],
    }),
  };

  const first = new NotificationOutboxConsumerV1(
    outbox,
    new NotificationProjectionConsumerV1(repository, resolver, checkpoints),
    checkpoints,
  );
  assert.equal(
    (
      await first.consumePending({
        organizationId: ids.organization,
        workspaceId: ids.workspace,
        limit: 2,
      })
    ).accepted,
    true,
  );

  const restarted = new NotificationOutboxConsumerV1(
    outbox,
    new NotificationProjectionConsumerV1(repository, resolver, checkpoints),
    checkpoints,
  );
  const replay = await restarted.consumePending({
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    limit: 2,
  });

  assert.deepEqual(replay, {
    accepted: true,
    consumedCount: 0,
    deliveredCount: 0,
    hasMore: false,
  });
  assert.equal(calls.length, 1);
});

void test('[NCO-002][NCO-012] concurrent consumers remain duplicate-safe through the durable recipient event boundary', async () => {
  const checkpoints = new DurableCheckpointDouble();
  const outbox = new DurableOutboxDouble();
  const { persisted, repository } = repositoryDouble();
  const resolver = {
    resolve: async (event: CommittedNotificationEventV1) => ({
      accepted: true as const,
      recipients: [
        {
          recipientId: ids.recipient,
          proof: {
            organizationId: ids.organization,
            workspaceId: ids.workspace,
            recipientId: ids.recipient,
            subjectId: event.subjectId,
            eventId: event.eventId,
            authorizationEpoch: 3,
            token: 'active-iam-proof',
          },
        },
      ],
    }),
  };
  const consumers = [0, 1].map(
    () =>
      new NotificationOutboxConsumerV1(
        outbox,
        new NotificationProjectionConsumerV1(repository, resolver, checkpoints),
        checkpoints,
      ),
  );

  const results = await Promise.all(
    consumers.map((consumer) =>
      consumer.consumePending({
        organizationId: ids.organization,
        workspaceId: ids.workspace,
        limit: 2,
      }),
    ),
  );

  assert.equal(
    results.every((result) => result.accepted),
    true,
  );
  assert.equal(persisted.size, 1);
});

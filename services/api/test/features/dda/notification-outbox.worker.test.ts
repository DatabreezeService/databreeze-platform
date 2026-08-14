/* eslint-disable @typescript-eslint/require-await -- Promise-shaped worker test doubles. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NotificationOutboxProjectionWorkerV1,
  type NotificationOutboxScopePortV1,
} from '../../../src/features/dda/notification/notification-outbox.worker.js';
import type { NotificationOutboxConsumerV1 } from '../../../src/features/dda/notification/notification-outbox.consumer.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000601',
  firstWorkspace: '00000000-0000-4000-8000-000000000602',
  secondWorkspace: '00000000-0000-4000-8000-000000000603',
  thirdWorkspace: '00000000-0000-4000-8000-000000000604',
};

const scopes = [
  { organizationId: ids.organization, workspaceId: ids.firstWorkspace },
  { organizationId: ids.organization, workspaceId: ids.secondWorkspace },
  { organizationId: ids.organization, workspaceId: ids.thirdWorkspace },
] as const;

class TimerDouble {
  public readonly delays: number[] = [];
  private callback: (() => void | Promise<void>) | undefined;
  private cleared = false;

  public setTimeout(callback: () => void | Promise<void>, delay: number): object {
    this.callback = callback;
    this.delays.push(delay);
    this.cleared = false;
    return {};
  }

  public clearTimeout(): void {
    this.cleared = true;
  }

  public async fire(): Promise<void> {
    const callback = this.callback;
    this.callback = undefined;
    if (callback !== undefined && !this.cleared) await callback();
  }
}

class ScopeDouble implements NotificationOutboxScopePortV1 {
  public readonly requests: number[] = [];
  public available = true;

  public async listPendingScopes(input: { readonly limit: number }) {
    this.requests.push(input.limit);
    if (!this.available) return { accepted: false as const, code: 'UNAVAILABLE' as const };
    return { accepted: true as const, scopes: scopes.slice(0, input.limit) };
  }
}

function consumerDouble() {
  const calls: { organizationId: string; workspaceId: string; limit?: number }[] = [];
  const consumer: Pick<NotificationOutboxConsumerV1, 'runOnce'> = {
    runOnce: async (input) => {
      calls.push(input);
      return {
        accepted: true as const,
        consumedCount: 1,
        deliveredCount: 1,
        hasMore: false,
      };
    },
  };
  return { calls, consumer };
}

void test('[NCO-002][NCO-014] worker bounds scope projection and invokes the durable consumer', async () => {
  const source = new ScopeDouble();
  const { calls, consumer } = consumerDouble();
  const worker = new NotificationOutboxProjectionWorkerV1(source, consumer, {
    scopeLimit: 2,
    batchLimit: 7,
    leaseDurationMs: 500,
  });

  const result = await worker.runOnce();

  assert.deepEqual(result, {
    accepted: true,
    processedScopes: 2,
    deliveredCount: 2,
    hasMore: false,
  });
  assert.deepEqual(source.requests, [2]);
  assert.deepEqual(calls, [
    { organizationId: ids.organization, workspaceId: ids.firstWorkspace, limit: 7 },
    { organizationId: ids.organization, workspaceId: ids.secondWorkspace, limit: 7 },
  ]);
});

void test('[NCO-002][NCO-014] lifecycle starts after production boot, applies retry backoff, and stops cleanly', async () => {
  const timer = new TimerDouble();
  const source = new ScopeDouble();
  source.available = false;
  const { calls, consumer } = consumerDouble();
  const worker = new NotificationOutboxProjectionWorkerV1(source, consumer, {
    pollIntervalMs: 40,
    retryBackoffMs: 5,
    maxBackoffMs: 20,
    timer,
  });

  worker.onModuleInit();
  assert.deepEqual(timer.delays, [0]);
  await timer.fire();
  assert.deepEqual(timer.delays, [0, 5]);
  assert.equal(calls.length, 0);

  source.available = true;
  await timer.fire();
  assert.equal(calls.length, scopes.length);
  assert.equal(timer.delays.at(-1), 40);

  await worker.onModuleDestroy();
  assert.equal(timer.delays.length, 3);
  await timer.fire();
  assert.equal(calls.length, scopes.length);
});

void test('[NCO-014] worker lease prevents overlapping runs and shutdown waits for an active run', async () => {
  const source = new ScopeDouble();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const consumer: Pick<NotificationOutboxConsumerV1, 'runOnce'> = {
    runOnce: async () => {
      await gate;
      return { accepted: true as const, consumedCount: 1, deliveredCount: 0, hasMore: false };
    },
  };
  const worker = new NotificationOutboxProjectionWorkerV1(source, consumer, {
    leaseDurationMs: 1_000,
  });

  const active = worker.runOnce();
  await Promise.resolve();
  assert.deepEqual(await worker.runOnce(), { accepted: false, code: 'LEASE_CONFLICT' });
  let destroyed = false;
  const shutdown = worker.onModuleDestroy().then(() => {
    destroyed = true;
  });
  await Promise.resolve();
  assert.equal(destroyed, false);
  release?.();
  await active;
  await shutdown;
  assert.equal(destroyed, true);
});

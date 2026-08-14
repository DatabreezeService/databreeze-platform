/* eslint-disable @typescript-eslint/require-await */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { DashboardPublicationApprovalInvalidationDispatcherV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication-approval-invalidation.dispatcher.js';
import { DashboardPublicationApprovalInvalidationWorkerV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication-approval-invalidation.worker.js';
import type { DashboardPublicationApprovalInvalidationExecutorPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-publication-approval-invalidation.port.js';
import type {
  DashboardPublicationApprovalInvalidationOutboxPortV1,
  DashboardPublicationApprovalInvalidationOutboxRecordV1,
} from '../../../src/features/dda/dashboard/application/dashboard-publication-approval-invalidation-outbox.port.js';

function sid(value: string) {
  const result = parseStableIdentifierV1(value);
  if (!result.accepted) throw new Error('invalid test identifier');
  return result.value;
}

const scope = Object.freeze({
  scopeType: 'project' as const,
  organizationId: sid('21000000-0000-4000-8000-000000000001'),
  workspaceId: sid('21000000-0000-4000-8000-000000000002'),
  projectId: sid('21000000-0000-4000-8000-000000000003'),
});

function record(): DashboardPublicationApprovalInvalidationOutboxRecordV1 {
  return {
    id: '21000000-0000-4000-8000-000000000010',
    keyValue: 'publication-1',
    snapshotId: '21000000-0000-4000-8000-000000000011',
    dashboardId: '21000000-0000-4000-8000-000000000012',
    priorPublishedVersionId: '21000000-0000-4000-8000-000000000013',
    tenantScope: scope,
    action: 'INVALIDATE_DASHBOARD_VERSION_PUBLICATION_APPROVALS',
    state: 'PENDING',
    attempts: 0,
    createdAt: '2026-08-13T01:00:00.000Z',
  };
}

void test('[DDA-025][DDA-029][AUD-003] publication invalidation dispatcher claims after commit, retries JRA failure, and completes idempotently', async () => {
  let current = record();
  const claims: string[] = [];
  const outbox: DashboardPublicationApprovalInvalidationOutboxPortV1 = {
    listPendingTenantScopes: async () => [scope],
    claimNext: async () => {
      if (current.state === 'COMPLETED') return { accepted: true as const, record: undefined };
      current = {
        ...current,
        state: 'CLAIMED',
        attempts: current.attempts + 1,
        leaseOwner: 'worker-1',
        leaseExpiresAt: '2026-08-13T01:01:00.000Z',
      };
      claims.push(current.state);
      return { accepted: true as const, record: current };
    },
    markCompleted: async () => {
      current = {
        ...current,
        state: 'COMPLETED',
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        completedAt: '2026-08-13T01:00:02.000Z',
      };
      return { accepted: true as const };
    },
    markFailed: async (input) => {
      current = {
        ...current,
        state: 'FAILED',
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        nextAttemptAt: input.retryAt.toISOString(),
        lastError: input.error,
      };
      return { accepted: true as const };
    },
  };
  let attempts = 0;
  const executor: DashboardPublicationApprovalInvalidationExecutorPortV1 = {
    invalidatePublicationApproval: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('JRA_TEMPORARY_FAILURE');
      return { accepted: true as const };
    },
  };
  const dispatcher = new DashboardPublicationApprovalInvalidationDispatcherV1(outbox, executor);

  const failed = await dispatcher.dispatchNext({
    tenantScope: scope,
    workerId: 'worker-1',
    now: new Date('2026-08-13T01:00:00.000Z'),
    leaseDurationMs: 60_000,
    retryDelayMs: 0,
  });
  assert.deepEqual(failed, { accepted: true, outcome: 'RETRY_SCHEDULED' });
  assert.equal(current.state, 'FAILED');
  assert.equal(current.attempts, 1);
  assert.match(current.lastError ?? '', /JRA_TEMPORARY_FAILURE/);

  const completed = await dispatcher.dispatchNext({
    tenantScope: scope,
    workerId: 'worker-1',
    now: new Date('2026-08-13T01:00:01.000Z'),
    leaseDurationMs: 60_000,
    retryDelayMs: 0,
  });
  assert.deepEqual(completed, { accepted: true, outcome: 'COMPLETED' });
  assert.equal(current.state, 'COMPLETED');
  assert.equal(current.attempts, 2);
  assert.equal(attempts, 2);
  assert.deepEqual(claims, ['CLAIMED', 'CLAIMED']);

  const idle = await dispatcher.dispatchNext({
    tenantScope: scope,
    workerId: 'worker-1',
    now: new Date('2026-08-13T01:00:03.000Z'),
    leaseDurationMs: 60_000,
    retryDelayMs: 0,
  });
  assert.deepEqual(idle, { accepted: true, outcome: 'IDLE' });
});

void test('[DDA-025][DDA-029] invalidation worker preserves tenant scope and does not run before a committed outbox row exists', async () => {
  const calls: unknown[] = [];
  const outbox: DashboardPublicationApprovalInvalidationOutboxPortV1 = {
    listPendingTenantScopes: async () => [],
    claimNext: async (input) => {
      calls.push(input.tenantScope);
      return { accepted: true as const, record: undefined };
    },
    markCompleted: async () => ({ accepted: true as const }),
    markFailed: async () => ({ accepted: true as const }),
  };
  const executor: DashboardPublicationApprovalInvalidationExecutorPortV1 = {
    invalidatePublicationApproval: async () => {
      throw new Error('MUST_NOT_RUN');
    },
  };
  const dispatcher = new DashboardPublicationApprovalInvalidationDispatcherV1(outbox, executor);
  assert.deepEqual(
    await dispatcher.dispatchNext({
      tenantScope: scope,
      workerId: 'worker-2',
      now: new Date('2026-08-13T01:00:00.000Z'),
      leaseDurationMs: 60_000,
      retryDelayMs: 0,
    }),
    { accepted: true, outcome: 'IDLE' },
  );
  assert.deepEqual(calls, [scope]);
});

void test('[DDA-025][DDA-029][AUD-003] bounded invalidation worker discovers scopes, runs one claim per scope, and shuts down cleanly', async () => {
  const secondScope = Object.freeze({
    scopeType: 'project' as const,
    organizationId: sid('21000000-0000-4000-8000-000000000101'),
    workspaceId: sid('21000000-0000-4000-8000-000000000102'),
    projectId: sid('21000000-0000-4000-8000-000000000103'),
  });
  const discovered: unknown[] = [];
  const dispatches: unknown[] = [];
  const outbox = {
    listPendingTenantScopes: async (input: { readonly limit: number; readonly now: Date }) => {
      discovered.push(input);
      return [scope, secondScope];
    },
  };
  const dispatcher = {
    dispatchNext: async (input: {
      readonly tenantScope: TenantScopeV1;
      readonly workerId: string;
      readonly now: Date;
      readonly leaseDurationMs: number;
      readonly retryDelayMs: number;
    }) => {
      dispatches.push(input.tenantScope);
      return { accepted: true as const, outcome: 'COMPLETED' as const };
    },
  };
  const worker = new DashboardPublicationApprovalInvalidationWorkerV1(outbox, dispatcher, {
    workerId: 'worker-bounded',
    pollIntervalMs: 60_000,
    maxScopesPerPoll: 1,
  });

  await worker.runOnce(new Date('2026-08-13T01:00:00.000Z'));
  assert.equal(discovered.length, 1);
  assert.equal((discovered[0] as { readonly limit: number }).limit, 1);
  assert.deepEqual(dispatches, [scope]);

  worker.onModuleInit();
  await worker.onModuleDestroy();
  await worker.onModuleDestroy();
});

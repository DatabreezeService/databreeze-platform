import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaReadyJobQueueRepositoryAdapter,
  type PrismaReadyJobQueueActionRowV1,
  type PrismaReadyJobQueueDatabaseClientV1,
  type PrismaReadyJobQueueDispatchRowV1,
  type PrismaReadyJobQueueJobRowV1,
} from '../../../src/features/jra/adapter/prisma-ready-job-queue-repository.adapter.js';
import { ReadyJobQueueService } from '../../../src/features/jra/application/ready-job-queue.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000601',
  workspace: '00000000-0000-4000-8000-000000000602',
  siblingWorkspace: '00000000-0000-4000-8000-000000000603',
  actor: '00000000-0000-4000-8000-000000000604',
  correlation: '00000000-0000-4000-8000-000000000605',
  job: '00000000-0000-4000-8000-000000000606',
  dispatch: '00000000-0000-4000-8000-000000000607',
});

function id(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
}

function context(workspaceId: string, key: string) {
  const parsed = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: id(ids.organization),
      workspaceId: id(workspaceId),
    },
    actorId: id(ids.actor),
    correlationId: id(ids.correlation),
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid test context');
  return parsed.value;
}

type State = {
  actions: PrismaReadyJobQueueActionRowV1[];
  jobs: PrismaReadyJobQueueJobRowV1[];
  dispatches: PrismaReadyJobQueueDispatchRowV1[];
  transitions: Array<Record<string, unknown>>;
};

function cloneState(state: State): State {
  return {
    actions: state.actions.map((row) => ({ ...row })),
    jobs: state.jobs.map((row) => ({ ...row })),
    dispatches: state.dispatches.map((row) => ({ ...row })),
    transitions: state.transitions.map((row) => ({ ...row })),
  };
}

function matches(row: Record<string, unknown>, where: Readonly<Record<string, unknown>>) {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function database() {
  let failTransitionCreate = false;
  const state: State = {
    actions: [
      {
        actionType: 'dda.materialize.widget-result',
        version: 1,
        inputSchemaId: 'dda.widget.input.v4',
        outputSchemaId: 'dda.widget.output.v4',
        handlerDigest: 'a'.repeat(64),
        requiredCapabilities: ['artifact.read'],
        sideEffectClass: 'NONE',
        riskClass: 'READ_ONLY',
        defaultTimeoutSeconds: 120,
        maxAttempts: 3,
        approvalClass: 'NONE',
      },
    ],
    jobs: [
      {
        id: ids.job,
        scopeType: 'workspace',
        organizationId: ids.organization,
        workspaceId: ids.workspace,
        projectId: null,
        requestedBy: ids.actor,
        actionType: 'dda.materialize.widget-result',
        actionVersion: 1,
        inputManifestHash: 'b'.repeat(64),
        idempotencyKey: 'materialize:ready-1',
        state: 'CREATED',
        revision: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        startedAt: null,
        finishedAt: null,
      },
    ],
    dispatches: [
      {
        id: ids.dispatch,
        jobId: ids.job,
        scopeType: 'workspace',
        organizationId: ids.organization,
        workspaceId: ids.workspace,
        projectId: null,
        eventType: 'JOB_READY',
        payloadHash: 'c'.repeat(64),
        idempotencyKey: 'dispatch:ready-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        deliveredAt: null,
        revision: 1,
      },
    ],
    transitions: [],
  };

  const makeClient = (working: State): PrismaReadyJobQueueDatabaseClientV1 => {
    const delegate = <TRow extends object>(table: keyof State) => ({
      findFirst: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) =>
        (working[table] as unknown as TRow[]).find((row) =>
          matches(row as unknown as Record<string, unknown>, where),
        ) ?? null,
      findMany: async ({
        where,
        take,
      }: {
        readonly where: Readonly<Record<string, unknown>>;
        readonly take?: number;
      }) => {
        const rows = (working[table] as unknown as TRow[]).filter((row) =>
          matches(row as unknown as Record<string, unknown>, where),
        );
        return take === undefined ? rows : rows.slice(0, take);
      },
      updateMany: async ({
        where,
        data,
      }: {
        readonly where: Readonly<Record<string, unknown>>;
        readonly data: Readonly<Record<string, unknown>>;
      }) => {
        const rows = working[table] as unknown as Record<string, unknown>[];
        const row = rows.find((candidate) => matches(candidate, where));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      create: async ({ data }: { readonly data: Readonly<Record<string, unknown>> }) => {
        if (table === 'transitions') {
          if (failTransitionCreate) throw new Error('TRANSITION_WRITE_FAILED');
          working.transitions.push({ ...data });
          return data;
        }
        throw new Error('unexpected create');
      },
    });
    return {
      jobDispatchRecord: delegate<PrismaReadyJobQueueDispatchRowV1>('dispatches'),
      jobRecord: delegate<PrismaReadyJobQueueJobRowV1>('jobs'),
      typedActionDefinitionRecord: delegate<PrismaReadyJobQueueActionRowV1>('actions'),
      jobTransitionRecord: delegate<never>('transitions'),
      $transaction: async <TValue>(
        work: (transaction: PrismaReadyJobQueueDatabaseClientV1) => Promise<TValue>,
      ) => {
        const transactionState = cloneState(working);
        const result = await work(makeClient(transactionState));
        working.actions = transactionState.actions;
        working.jobs = transactionState.jobs;
        working.dispatches = transactionState.dispatches;
        working.transitions = transactionState.transitions;
        return result;
      },
    };
  };

  const client = makeClient(state);
  return {
    state,
    client,
    failTransition() {
      failTransitionCreate = true;
    },
  };
}

void test('[JRA-001/JRA-013] Prisma ready scanner uses exact scope and CAS-promotes one job', async () => {
  const store = database();
  const service = new ReadyJobQueueService(new PrismaReadyJobQueueRepositoryAdapter(store.client));
  const result = await service.promote(
    context(ids.workspace, 'promote-1'),
    '2026-01-01T00:00:01.000Z',
    10,
  );
  assert.equal('accepted' in result, false);
  if ('accepted' in result) return;
  assert.equal(result.promoted.length, 1);
  assert.equal(store.state.jobs[0]?.state, 'QUEUED');
  assert.equal(store.state.jobs[0]?.revision, 2);
  assert.equal(store.state.dispatches[0]?.deliveredAt?.toISOString(), '2026-01-01T00:00:01.000Z');
  assert.equal(store.state.transitions.length, 1);
  const sibling = await new ReadyJobQueueService(
    new PrismaReadyJobQueueRepositoryAdapter(store.client),
  ).promote(context(ids.siblingWorkspace, 'sibling-1'), '2026-01-01T00:00:02.000Z', 10);
  assert.equal('accepted' in sibling, false);
  if ('accepted' in sibling) return;
  assert.deepEqual(sibling, { promoted: [], skipped: [] });
});

void test('[JRA-001] Prisma ready scanner rolls back the job CAS when transition history fails', async () => {
  const store = database();
  store.failTransition();
  await assert.rejects(
    () =>
      new ReadyJobQueueService(new PrismaReadyJobQueueRepositoryAdapter(store.client)).promote(
        context(ids.workspace, 'rollback-1'),
        '2026-01-01T00:00:01.000Z',
        10,
      ),
    { message: 'TRANSITION_WRITE_FAILED' },
  );
  assert.equal(store.state.jobs[0]?.state, 'CREATED');
  assert.equal(store.state.dispatches[0]?.deliveredAt, null);
});

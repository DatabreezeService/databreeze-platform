import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaJraAdmissionRepositoryAdapter,
  type PrismaAdmissionActionRowV1,
  type PrismaAdmissionDatabaseClientV1,
  type PrismaAdmissionDescriptorRowV1,
  type PrismaAdmissionDispatchRowV1,
  type PrismaAdmissionJobRowV1,
} from '../../../src/features/jra/adapter/prisma-admission-repository.adapter.js';
import { JraAdmissionService } from '../../../src/features/jra/application/admission.service.js';
import type { ExecutionRequestDescriptorVerifierPortV1 } from '../../../src/features/jra/application/execution-request-descriptor.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000401',
  workspace: '00000000-0000-4000-8000-000000000402',
  otherWorkspace: '00000000-0000-4000-8000-000000000403',
  actor: '00000000-0000-4000-8000-000000000404',
  correlation: '00000000-0000-4000-8000-000000000405',
  job: '00000000-0000-4000-8000-000000000406',
  dispatch: '00000000-0000-4000-8000-000000000407',
  descriptor: '00000000-0000-4000-8000-000000000408',
  step: '00000000-0000-4000-8000-000000000409',
  settlement: '00000000-0000-4000-8000-000000000410',
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

function admissionInput() {
  const action = {
    actionType: 'dda.materialize.widget-result',
    version: 1,
    inputSchemaId: 'dda-widget-input.v1',
    outputSchemaId: 'dda-widget-result.v4',
    handlerDigest: 'a'.repeat(64),
    requiredCapabilities: ['artifact.read'],
    sideEffectClass: 'NONE' as const,
    riskClass: 'READ_ONLY' as const,
    defaultTimeoutSeconds: 120,
    maxAttempts: 3,
    approvalClass: 'NONE' as const,
  };
  const tenantScope = {
    scopeType: 'workspace' as const,
    organizationId: id(ids.organization),
    workspaceId: id(ids.workspace),
  };
  return {
    job: {
      jobId: id(ids.job),
      tenantScope,
      requestedBy: id(ids.actor),
      inputManifestHash: 'b'.repeat(64),
      idempotencyKey: 'materialize:dashboard:one',
      createdAt: '2026-01-01T00:00:00.000Z',
      action,
    },
    executionRequest: {
      schemaVersion: 1 as const,
      descriptorId: id(ids.descriptor),
      resultUsageSettlementBindingId: id(ids.settlement),
      tenantScope,
      jobId: id(ids.job),
      stepId: id(ids.step),
      action: {
        type: action.actionType,
        version: action.version,
        inputSchemaId: action.inputSchemaId,
        outputSchemaId: action.outputSchemaId,
        handlerDigest: action.handlerDigest,
        requiredCapabilities: action.requiredCapabilities,
        sideEffectClass: action.sideEffectClass,
        riskClass: action.riskClass,
      },
      inputObjectIds: ['artifact-version:source-1'],
      inputManifestHash: 'b'.repeat(64),
      parameters: { dashboardId: 'dashboard:one', widgetId: 'widget:revenue' },
      outputPolicy: {
        outputObjectId: 'artifact-version:result-1',
        maxBytes: 5_000_000,
        mediaType: 'application/json',
      },
      deadline: '2026-01-01T00:02:00.000Z',
      locale: 'vi-VN' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    dispatch: {
      dispatchId: id(ids.dispatch),
      jobId: id(ids.job),
      tenantScope,
      eventType: 'JOB_READY',
      payloadHash: 'c'.repeat(64),
      idempotencyKey: 'dispatch:materialize:dashboard:one',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

type State = {
  actions: PrismaAdmissionActionRowV1[];
  jobs: PrismaAdmissionJobRowV1[];
  descriptors: PrismaAdmissionDescriptorRowV1[];
  dispatches: PrismaAdmissionDispatchRowV1[];
};

function cloneState(value: State): State {
  return {
    actions: value.actions.map((row) => ({ ...row })),
    jobs: value.jobs.map((row) => ({ ...row })),
    descriptors: value.descriptors.map((row) => ({ ...row })),
    dispatches: value.dispatches.map((row) => ({ ...row })),
  };
}

function matches(row: Record<string, unknown>, where: Readonly<Record<string, unknown>>) {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function duplicate(
  table: keyof State,
  rows: ReadonlyArray<Record<string, unknown>>,
  data: Readonly<Record<string, unknown>>,
) {
  return rows.some((row) => {
    if (row['id'] === data['id']) return true;
    if (table === 'actions')
      return row['actionType'] === data['actionType'] && row['version'] === data['version'];
    if (table === 'jobs') {
      return (
        row['scopeType'] === data['scopeType'] &&
        row['organizationId'] === data['organizationId'] &&
        row['workspaceId'] === data['workspaceId'] &&
        row['projectId'] === data['projectId'] &&
        row['idempotencyKey'] === data['idempotencyKey']
      );
    }
    if (table === 'descriptors') {
      return (
        row['scopeType'] === data['scopeType'] &&
        row['organizationId'] === data['organizationId'] &&
        row['jobId'] === data['jobId']
      );
    }
    return (
      row['scopeType'] === data['scopeType'] &&
      row['organizationId'] === data['organizationId'] &&
      row['workspaceId'] === data['workspaceId'] &&
      row['projectId'] === data['projectId'] &&
      row['jobId'] === data['jobId'] &&
      row['idempotencyKey'] === data['idempotencyKey']
    );
  });
}

function database() {
  const state: State = { actions: [], jobs: [], descriptors: [], dispatches: [] };
  const queries: Array<Readonly<Record<string, unknown>>> = [];
  let failDispatchCreate = false;

  const makeClient = (working: State): PrismaAdmissionDatabaseClientV1 => {
    const delegate = <TRow extends object>(table: keyof State) => ({
      findFirst: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        queries.push(where);
        return (
          (working[table] as unknown as TRow[]).find((row) =>
            matches(row as unknown as Record<string, unknown>, where),
          ) ?? null
        );
      },
      create: async ({ data }: { readonly data: Readonly<Record<string, unknown>> }) => {
        if (table === 'dispatches' && failDispatchCreate) throw new Error('DISPATCH_WRITE_FAILED');
        const rows = working[table] as unknown as TRow[];
        if (duplicate(table, rows as unknown as ReadonlyArray<Record<string, unknown>>, data))
          throw Object.assign(new Error('P2002'), { code: 'P2002' });
        const row = { ...data } as TRow;
        rows.push(row);
        return row;
      },
    });

    const client = {
      typedActionDefinitionRecord: delegate<PrismaAdmissionActionRowV1>('actions'),
      jobRecord: delegate<PrismaAdmissionJobRowV1>('jobs'),
      executionRequestDescriptorRecord: delegate<PrismaAdmissionDescriptorRowV1>('descriptors'),
      jobDispatchRecord: delegate<PrismaAdmissionDispatchRowV1>('dispatches'),
      $transaction: async <TValue>(
        work: (transaction: PrismaAdmissionDatabaseClientV1) => Promise<TValue>,
      ) => {
        const transactionState = cloneState(working);
        const result = await work(makeClient(transactionState));
        working.actions = transactionState.actions;
        working.jobs = transactionState.jobs;
        working.descriptors = transactionState.descriptors;
        working.dispatches = transactionState.dispatches;
        return result;
      },
    } satisfies PrismaAdmissionDatabaseClientV1;
    return client;
  };

  const client: PrismaAdmissionDatabaseClientV1 = {
    ...makeClient(state),
    $transaction: async <TValue>(
      work: (transaction: PrismaAdmissionDatabaseClientV1) => Promise<TValue>,
    ) => {
      const transactionState = cloneState(state);
      const result = await work(makeClient(transactionState));
      state.actions = transactionState.actions;
      state.jobs = transactionState.jobs;
      state.descriptors = transactionState.descriptors;
      state.dispatches = transactionState.dispatches;
      return result;
    },
  };

  return {
    client,
    state,
    queries,
    failNextDispatch() {
      failDispatchCreate = true;
    },
    allowDispatch() {
      failDispatchCreate = false;
    },
  };
}

const acceptingVerifier: ExecutionRequestDescriptorVerifierPortV1 = {
  verify: () => Promise.resolve(true),
};

void test('[JRA-002/JRA-004] Prisma admission persists job, descriptor, and dispatch atomically and replays exact input', async () => {
  const store = database();
  const service = new JraAdmissionService(
    new PrismaJraAdmissionRepositoryAdapter(store.client),
    acceptingVerifier,
  );
  const first = await service.admit(context(ids.workspace, 'admit-1'), admissionInput());
  assert.equal(first.accepted, true);
  assert.equal(store.state.jobs.length, 1);
  assert.equal(store.state.descriptors.length, 1);
  assert.equal(store.state.dispatches.length, 1);

  const replay = await service.admit(context(ids.workspace, 'admit-2'), admissionInput());
  assert.deepEqual(replay, first);

  const drifted = admissionInput();
  drifted.executionRequest.parameters = {
    dashboardId: 'dashboard:other',
    widgetId: 'widget:revenue',
  };
  const conflict = await service.admit(context(ids.workspace, 'admit-3'), drifted);
  assert.deepEqual(conflict, { accepted: false, code: 'JRA_ADMISSION_IDEMPOTENCY_CONFLICT' });
});

void test('[JRA-002] Prisma admission scopes every lookup to the operation context', async () => {
  const store = database();
  const service = new JraAdmissionService(
    new PrismaJraAdmissionRepositoryAdapter(store.client),
    acceptingVerifier,
  );
  assert.equal(
    (await service.admit(context(ids.workspace, 'scope-1'), admissionInput())).accepted,
    true,
  );
  const before = store.queries.length;
  await new PrismaJraAdmissionRepositoryAdapter(store.client).withTransaction(
    context(ids.otherWorkspace, 'scope-2'),
    async (transaction) =>
      transaction.findJobByIdempotency(
        context(ids.otherWorkspace, 'scope-3'),
        'materialize:dashboard:one',
      ),
  );
  const scopedQueries = store.queries.slice(before);
  assert.ok(scopedQueries.some((query) => query['workspaceId'] === id(ids.otherWorkspace)));
  assert.equal(
    scopedQueries.some((query) => query['workspaceId'] === id(ids.workspace)),
    false,
  );
});

void test('[JRA-002] Prisma admission rolls back all records when the dispatch write fails', async () => {
  const store = database();
  const service = new JraAdmissionService(
    new PrismaJraAdmissionRepositoryAdapter(store.client),
    acceptingVerifier,
  );
  store.failNextDispatch();
  await assert.rejects(
    () => service.admit(context(ids.workspace, 'rollback-1'), admissionInput()),
    {
      message: 'DISPATCH_WRITE_FAILED',
    },
  );
  assert.deepEqual(store.state, { actions: [], jobs: [], descriptors: [], dispatches: [] });

  store.allowDispatch();
  assert.equal(
    (await service.admit(context(ids.workspace, 'rollback-2'), admissionInput())).accepted,
    true,
  );
});

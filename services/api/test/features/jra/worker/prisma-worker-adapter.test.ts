import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { WorkerSecurityEpochPortV1 } from '../../../../src/features/jra/worker/worker-ports.js';
import { createExecutionRequestDescriptorV1 } from '../../../../src/features/jra/application/execution-request-descriptor.js';
import { workerAttemptDescriptorBindingHashV1 } from '../../../../src/features/jra/worker/execution-descriptor-binding.js';
import {
  PrismaJraWorkerAdapter,
  type JraWorkerActionDatabaseRowV1,
  type JraWorkerAttemptDatabaseRowV1,
  type JraWorkerCompletionDatabaseRowV1,
  type JraWorkerDatabaseClientV1,
  type JraWorkerExecutionRequestDatabaseRowV1,
  type JraWorkerJobDatabaseRowV1,
  type JraWorkerOutboxDatabaseRowV1,
  type JraWorkerTransitionDatabaseRowV1,
} from '../../../../src/features/jra/worker/prisma-worker-adapter.js';
import type {
  WorkerAttemptAuthorizationV1,
  WorkerIdentityV1,
  WorkerObjectGrantAuthorityPortV1,
} from '../../../../src/features/jra/worker/worker-ports.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000001',
  workspace: '00000000-0000-4000-8000-000000000002',
  worker: '00000000-0000-4000-8000-000000000003',
  job: '00000000-0000-4000-8000-000000000004',
  attempt: '00000000-0000-4000-8000-000000000005',
  output: '00000000-0000-4000-8000-000000000007',
  correlation: '00000000-0000-4000-8000-000000000006',
  descriptor: '00000000-0000-4000-8000-000000000011',
  step: '00000000-0000-4000-8000-000000000012',
  settlementBinding: '00000000-0000-4000-8000-000000000013',
};
const now = '2026-08-13T00:00:00.000Z';
const lease = '2026-08-13T00:10:00.000Z';
const leaseTokenHash = 'a'.repeat(64);
const manifestHash = 'b'.repeat(64);

const scopeResult = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: ids.organization,
  workspaceId: ids.workspace,
});
if (!scopeResult.accepted) throw new Error('invalid test scope');
const scope: TenantScopeV1 = scopeResult.value;

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
}

function utc(value: string): StrictUtcTimestampV1 {
  const parsed = parseStrictUtcTimestampV1(value);
  if (!parsed.accepted) throw new Error('invalid test timestamp');
  return parsed.value;
}

function identity(overrides: Partial<WorkerIdentityV1> = {}): WorkerIdentityV1 {
  return {
    workerId: stable(ids.worker),
    tenantScope: scope,
    securityEpoch: 4,
    correlationId: stable(ids.correlation),
    ...overrides,
  };
}

function actionRow(): JraWorkerActionDatabaseRowV1 {
  return {
    id: '00000000-0000-4000-8000-000000000008',
    actionType: 'typed.test',
    version: 1,
    inputSchemaId: 'input.v1',
    outputSchemaId: 'output.v1',
    handlerDigest: manifestHash,
    requiredCapabilities: ['metadata.read'],
    sideEffectClass: 'NONE',
    riskClass: 'READ_ONLY',
    defaultTimeoutSeconds: 60,
    maxAttempts: 3,
    approvalClass: 'NONE',
    createdAt: new Date(now),
  };
}

function jobRow(state = 'RUNNING', revision = 1): JraWorkerJobDatabaseRowV1 {
  return {
    id: ids.job,
    scopeType: 'workspace',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    projectId: null,
    requestedBy: ids.worker,
    actionType: 'typed.test',
    actionVersion: 1,
    inputManifestHash: manifestHash,
    idempotencyKey: 'job-idempotency',
    state,
    revision,
    createdAt: new Date(now),
    startedAt: new Date(now),
    finishedAt: null,
  };
}

function attemptRow(
  overrides: Partial<JraWorkerAttemptDatabaseRowV1> = {},
): JraWorkerAttemptDatabaseRowV1 {
  return {
    id: ids.attempt,
    jobId: ids.job,
    scopeType: 'workspace',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    projectId: null,
    attemptNumber: 1,
    executorType: 'CLOUD_WORKER',
    executorId: ids.worker,
    leaseTokenHash,
    leaseExpiresAt: new Date(lease),
    state: 'RUNNING',
    createdAt: new Date(now),
    heartbeatAt: new Date(now),
    startedAt: new Date(now),
    finishedAt: null,
    resultManifestHash: null,
    revision: 1,
    ...overrides,
  };
}

function executionRequestRow(
  requiredCapabilities: readonly string[] = ['metadata.read'],
): JraWorkerExecutionRequestDatabaseRowV1 {
  const parsed = createExecutionRequestDescriptorV1({
    schemaVersion: 1,
    descriptorId: ids.descriptor,
    resultUsageSettlementBindingId: ids.settlementBinding,
    tenantScope: scope,
    jobId: ids.job,
    stepId: ids.step,
    action: {
      type: 'typed.test',
      version: 1,
      inputSchemaId: 'input.v1',
      outputSchemaId: 'output.v1',
      handlerDigest: manifestHash,
      requiredCapabilities,
      sideEffectClass: 'NONE',
      riskClass: 'READ_ONLY',
    },
    inputObjectIds: ['input-object-one'],
    inputManifestHash: manifestHash,
    parameters: {},
    outputPolicy: {
      outputObjectId: 'output-object-one',
      maxBytes: 1_024,
      mediaType: 'application/json',
    },
    deadline: '2026-08-13T01:00:00.000Z',
    locale: 'vi-VN',
    createdAt: now,
  });
  if (!parsed.accepted) throw new Error('invalid descriptor fixture');
  return {
    id: ids.descriptor,
    resultUsageSettlementBindingId: ids.settlementBinding,
    jobId: ids.job,
    stepId: ids.step,
    scopeType: 'workspace',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    projectId: null,
    actionType: 'typed.test',
    actionVersion: 1,
    inputSchemaId: 'input.v1',
    outputSchemaId: 'output.v1',
    handlerDigest: manifestHash,
    requiredCapabilities,
    sideEffectClass: 'NONE',
    riskClass: 'READ_ONLY',
    inputObjectIds: ['input-object-one'],
    inputManifestHash: manifestHash,
    parameters: {},
    outputObjectId: 'output-object-one',
    outputMaxBytes: 1_024,
    outputMediaType: 'application/json',
    deadline: new Date('2026-08-13T01:00:00.000Z'),
    locale: 'vi-VN',
    canonicalHash: parsed.value.canonicalHash,
    createdAt: new Date(now),
  };
}

type DelegateRow = object;
type Delegate<TValue extends DelegateRow> = {
  readonly findFirst: (input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }) => Promise<TValue | null>;
  readonly findMany: (input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }) => Promise<readonly TValue[]>;
  readonly create: (input: { readonly data: Readonly<Record<string, unknown>> }) => Promise<TValue>;
  readonly updateMany: (input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }) => Promise<{ readonly count: number }>;
};

function matches(row: DelegateRow, where: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR' && Array.isArray(value))
      return value.some(
        (candidate) =>
          typeof candidate === 'object' &&
          candidate !== null &&
          matches(row, candidate as Record<string, unknown>),
      );
    return (row as Record<string, unknown>)[key] === value;
  });
}

function delegate<TValue extends DelegateRow>(
  read: () => TValue[],
  write: (rows: TValue[]) => void,
): Delegate<TValue> {
  const find = (
    where: Readonly<Record<string, unknown>>,
    orderBy?: Readonly<Record<string, 'asc' | 'desc'>>,
  ): TValue[] => {
    const rows = read().filter((row) => matches(row, where));
    const ordering = Object.entries(orderBy ?? {});
    rows.sort((left, right) => {
      for (const [key, direction] of ordering) {
        const leftValue = (left as Record<string, unknown>)[key];
        const rightValue = (right as Record<string, unknown>)[key];
        const leftComparable = leftValue instanceof Date ? leftValue.getTime() : leftValue;
        const rightComparable = rightValue instanceof Date ? rightValue.getTime() : rightValue;
        if (leftComparable === rightComparable) continue;
        const result =
          typeof leftComparable === 'number' && typeof rightComparable === 'number'
            ? leftComparable < rightComparable
              ? -1
              : 1
            : String(leftComparable).localeCompare(String(rightComparable));
        return direction === 'asc' ? result : -result;
      }
      return 0;
    });
    return rows;
  };
  return {
    findFirst: async ({ where, orderBy }) => {
      await Promise.resolve();
      return find(where, orderBy)[0] ?? null;
    },
    findMany: async ({ where, orderBy }) => {
      await Promise.resolve();
      return find(where, orderBy);
    },
    create: async ({ data }) => {
      await Promise.resolve();
      const row = { ...data } as TValue;
      write([...read(), row]);
      return row;
    },
    updateMany: async ({ where, data }) => {
      await Promise.resolve();
      const rows = read();
      let count = 0;
      for (const row of rows) {
        if (!matches(row, where)) continue;
        Object.assign(row, data);
        count += 1;
      }
      write(rows);
      return { count };
    },
  };
}

class FakeWorkerDatabase {
  public actions = [actionRow()];
  public jobs = [jobRow()];
  public attempts = [attemptRow()];
  public descriptors = [executionRequestRow()];
  public completions: JraWorkerCompletionDatabaseRowV1[] = [];
  public transitions: JraWorkerTransitionDatabaseRowV1[] = [];
  public outbox: JraWorkerOutboxDatabaseRowV1[] = [];
  public failOutbox = false;
  private tail: Promise<void> = Promise.resolve();
  public readonly client: JraWorkerDatabaseClientV1;

  public constructor() {
    this.client = {
      typedActionDefinitionRecord: delegate<JraWorkerActionDatabaseRowV1>(
        () => this.actions,
        (rows) => {
          this.actions = rows;
        },
      ),
      jobRecord: delegate<JraWorkerJobDatabaseRowV1>(
        () => this.jobs,
        (rows) => {
          this.jobs = rows;
        },
      ),
      executionAttemptRecord: delegate<JraWorkerAttemptDatabaseRowV1>(
        () => this.attempts,
        (rows) => {
          this.attempts = rows;
        },
      ),
      executionRequestDescriptorRecord: delegate<JraWorkerExecutionRequestDatabaseRowV1>(
        () => this.descriptors,
        (rows) => {
          this.descriptors = rows;
        },
      ),
      workerCompletionRecord: delegate<JraWorkerCompletionDatabaseRowV1>(
        () => this.completions,
        (rows) => {
          this.completions = rows;
        },
      ),
      jobTransitionRecord: delegate<JraWorkerTransitionDatabaseRowV1>(
        () => this.transitions,
        (rows) => {
          this.transitions = rows;
        },
      ),
      jobOutboxRecord: {
        ...delegate<JraWorkerOutboxDatabaseRowV1>(
          () => this.outbox,
          (rows) => {
            this.outbox = rows;
          },
        ),
        create: async (input) => {
          await Promise.resolve();
          if (this.failOutbox) throw new Error('OUTBOX_WRITE_FAILED');
          const row = { ...input.data } as unknown as JraWorkerOutboxDatabaseRowV1;
          this.outbox = [...this.outbox, row];
          return row;
        },
      },
      $transaction: async <TValue>(
        work: (transaction: JraWorkerDatabaseClientV1) => Promise<TValue>,
      ) => {
        let release!: () => void;
        const previous = this.tail;
        this.tail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        const snapshot = {
          actions: this.actions.map((row) => ({ ...row })),
          jobs: this.jobs.map((row) => ({ ...row })),
          attempts: this.attempts.map((row) => ({ ...row })),
          descriptors: this.descriptors.map((row) => ({ ...row })),
          completions: this.completions.map((row) => ({ ...row })),
          transitions: this.transitions.map((row) => ({ ...row })),
          outbox: this.outbox.map((row) => ({ ...row })),
        };
        try {
          return await work(this.client);
        } catch (error) {
          this.actions = snapshot.actions;
          this.jobs = snapshot.jobs;
          this.attempts = snapshot.attempts;
          this.descriptors = snapshot.descriptors;
          this.completions = snapshot.completions;
          this.transitions = snapshot.transitions;
          this.outbox = snapshot.outbox;
          throw error;
        } finally {
          release();
        }
      },
    };
  }
}

function epochPort(current: () => number): WorkerSecurityEpochPortV1 {
  return {
    isCurrent: async (value) => {
      await Promise.resolve();
      return value.securityEpoch === current();
    },
  };
}

function grants(counter: { count: number }): WorkerObjectGrantAuthorityPortV1 {
  return {
    issueInputGrant: async () => {
      await Promise.resolve();
      throw new Error('not used');
    },
    acceptResultReferences: async (worker, job, attempt, references) => {
      await Promise.resolve();
      counter.count += 1;
      return references.map((objectId) => ({
        grantType: 'JOB_OUTPUT' as const,
        attemptId: attempt.attemptId,
        jobId: job.jobId,
        workerId: worker.workerId,
        securityEpoch: worker.securityEpoch,
        tenantScope: worker.tenantScope,
        objectId,
        expiresAt: attempt.leaseExpiresAt,
      }));
    },
  };
}

function authorization(attemptRevision: number): WorkerAttemptAuthorizationV1 {
  return {
    attempt: {
      schemaVersion: 1,
      attemptId: stable(ids.attempt),
      jobId: stable(ids.job),
      tenantScope: scope,
      attemptNumber: 1,
      executorType: 'CLOUD_WORKER',
      executorId: stable(ids.worker),
      leaseTokenHash,
      leaseExpiresAt: utc(lease),
      state: 'RUNNING',
      createdAt: utc(now),
      heartbeatAt: utc(now),
      startedAt: utc(now),
      revision: attemptRevision,
    },
    job: {
      schemaVersion: 1,
      jobId: stable(ids.job),
      tenantScope: scope,
      requestedBy: stable(ids.worker),
      action: {
        schemaVersion: 1,
        actionType: 'typed.test',
        version: 1,
        inputSchemaId: 'input.v1',
        outputSchemaId: 'output.v1',
        handlerDigest: manifestHash,
        requiredCapabilities: [],
        sideEffectClass: 'NONE',
        riskClass: 'READ_ONLY',
        defaultTimeoutSeconds: 60,
        maxAttempts: 3,
        approvalClass: 'NONE',
      },
      inputManifestHash: manifestHash,
      idempotencyKey: 'job-idempotency',
      state: 'RUNNING',
      createdAt: utc(now),
      startedAt: utc(now),
      revision: 1,
    },
    latestAttemptId: stable(ids.attempt),
    workerSecurityEpoch: 4,
    descriptorId: stable(ids.descriptor),
    descriptorHash: executionRequestRow().canonicalHash,
    attemptBindingHash: workerAttemptDescriptorBindingHashV1({
      descriptorHash: executionRequestRow().canonicalHash,
      attemptId: stable(ids.attempt),
      jobId: stable(ids.job),
      workerId: stable(ids.worker),
      securityEpoch: 4,
      leaseExpiresAt: lease,
    }),
  };
}

void test('authorizes the exact current attempt and rejects scope, supersession, token, and epoch changes', async () => {
  const database = new FakeWorkerDatabase();
  let currentEpoch = 4;
  const adapter = new PrismaJraWorkerAdapter(
    database.client,
    epochPort(() => currentEpoch),
    grants({ count: 0 }),
  );
  const worker = identity();
  const input = {
    attemptId: stable(ids.attempt),
    leaseTokenHash,
    expectedRevision: 1,
    operation: 'CLAIM' as const,
    now,
  };
  assert.ok(await adapter.authorize(worker, input));
  assert.equal(
    await adapter.authorize(
      {
        ...worker,
        tenantScope: {
          scopeType: 'workspace',
          organizationId: stable(ids.organization),
          workspaceId: stable('00000000-0000-4000-8000-000000000099'),
        },
      },
      input,
    ),
    undefined,
  );
  database.attempts.push(
    attemptRow({
      id: '00000000-0000-4000-8000-000000000010',
      attemptNumber: 2,
      state: 'CLAIMED',
    }),
  );
  assert.equal(await adapter.authorize(worker, input), undefined);
  database.attempts.pop();
  database.attempts[0] = attemptRow({ leaseTokenHash: 'c'.repeat(64) });
  assert.equal(await adapter.authorize(worker, input), undefined);
  database.attempts[0] = attemptRow();
  currentEpoch = 5;
  assert.equal(await adapter.authorize(worker, input), undefined);
});

void test('commits completion once, emits the transition/outbox in the same transaction, and replays after restart without reaccepting refs', async () => {
  const database = new FakeWorkerDatabase();
  const counter = { count: 0 };
  const adapter = new PrismaJraWorkerAdapter(
    database.client,
    epochPort(() => 4),
    grants(counter),
  );
  const worker = identity();
  const auth = authorization(1);
  const input = {
    identity: worker,
    authorization: auth,
    leaseTokenHash,
    expectedRevision: 1,
    outcome: 'SUCCEEDED' as const,
    resultManifestHash: manifestHash,
    resultReferences: [ids.output],
    fingerprint: 'd'.repeat(64),
    now,
  };
  const first = await adapter.complete(input);
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.replayed, false);
  assert.equal(counter.count, 1);
  assert.equal(database.completions.length, 1);
  assert.equal(database.outbox.length, 1);
  assert.equal(database.transitions.length, 1);
  assert.equal(database.attempts[0]?.state, 'SUCCEEDED');

  const restarted = new PrismaJraWorkerAdapter(
    database.client,
    epochPort(() => 4),
    grants(counter),
  );
  const replay = await restarted.findReplay({
    identity: worker,
    attemptId: stable(ids.attempt),
    leaseTokenHash,
    expectedRevision: 1,
    outcome: 'SUCCEEDED',
    resultManifestHash: manifestHash,
    resultReferences: [ids.output],
    fingerprint: 'd'.repeat(64),
    now: '2026-08-13T00:30:00.000Z',
  });
  assert.equal(replay?.revision, 2);
  const replayed = await restarted.complete(input);
  assert.equal(replayed.accepted, true);
  if (!replayed.accepted) return;
  assert.equal(replayed.replayed, true);
  assert.equal(counter.count, 1);
});

void test('serializes concurrent workers so only one completion accepts result references', async () => {
  const database = new FakeWorkerDatabase();
  const counter = { count: 0 };
  const firstAdapter = new PrismaJraWorkerAdapter(
    database.client,
    epochPort(() => 4),
    grants(counter),
  );
  const secondAdapter = new PrismaJraWorkerAdapter(
    database.client,
    epochPort(() => 4),
    grants(counter),
  );
  const input = {
    identity: identity(),
    authorization: authorization(1),
    leaseTokenHash,
    expectedRevision: 1,
    outcome: 'SUCCEEDED' as const,
    resultManifestHash: manifestHash,
    resultReferences: [ids.output],
    fingerprint: 'f'.repeat(64),
    now,
  };

  const [first, second] = await Promise.all([
    firstAdapter.complete(input),
    secondAdapter.complete(input),
  ]);
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (!first.accepted || !second.accepted) return;
  assert.equal([first.replayed, second.replayed].filter((value) => !value).length, 1);
  assert.equal(counter.count, 1);
  assert.equal(database.completions.length, 1);
  assert.equal(database.outbox.length, 1);
});

void test('rolls back attempt, completion, transition, and outbox when the transaction fails', async () => {
  const database = new FakeWorkerDatabase();
  database.failOutbox = true;
  const counter = { count: 0 };
  const adapter = new PrismaJraWorkerAdapter(
    database.client,
    epochPort(() => 4),
    grants(counter),
  );
  const result = await adapter.complete({
    identity: identity(),
    authorization: authorization(1),
    leaseTokenHash,
    expectedRevision: 1,
    outcome: 'SUCCEEDED',
    resultManifestHash: manifestHash,
    resultReferences: [ids.output],
    fingerprint: 'e'.repeat(64),
    now,
  });
  assert.equal(result.accepted, false);
  assert.equal(database.attempts[0]?.state, 'RUNNING');
  assert.equal(database.completions.length, 0);
  assert.equal(database.transitions.length, 0);
  assert.equal(database.outbox.length, 0);
});

void test('rolls back the attempt CAS when IAE cannot accept result references', async () => {
  const database = new FakeWorkerDatabase();
  const adapter = new PrismaJraWorkerAdapter(
    database.client,
    epochPort(() => 4),
    {
      issueInputGrant: () => Promise.reject(new Error('not used')),
      acceptResultReferences: () =>
        Promise.reject(new Error('IAE_WORKER_OBJECT_GRANT_CAPABILITY_UNAVAILABLE')),
    },
  );
  const result = await adapter.complete({
    identity: identity(),
    authorization: authorization(1),
    leaseTokenHash,
    expectedRevision: 1,
    outcome: 'SUCCEEDED',
    resultManifestHash: manifestHash,
    resultReferences: [ids.output],
    fingerprint: 'c'.repeat(64),
    now,
  });
  assert.deepEqual(result, { accepted: false, code: 'OBJECT_GRANT_UNAVAILABLE' });
  assert.equal(database.attempts[0]?.state, 'RUNNING');
  assert.equal(database.attempts[0]?.revision, 1);
  assert.equal(database.completions.length, 0);
  assert.equal(database.transitions.length, 0);
  assert.equal(database.outbox.length, 0);
});

void test('[JRA-001/JRA-007/JRA-013/JRA-023] concurrent assignment claims queued PostgreSQL work once', async () => {
  const database = new FakeWorkerDatabase();
  database.jobs = [jobRow('QUEUED', 1)];
  database.attempts = [];
  database.actions = [
    {
      ...actionRow(),
      requiredCapabilities: ['metadata.read'],
    },
  ];
  database.descriptors = [executionRequestRow(['metadata.read'])];
  const adapter = new PrismaJraWorkerAdapter(
    database.client,
    epochPort(() => 4),
    grants({ count: 0 }),
  );
  const assign = (
    adapter as unknown as {
      assign(
        worker: WorkerIdentityV1,
        assignedAt: string,
      ): Promise<
        | {
            readonly attemptId: StableIdentifierV1;
            readonly leaseToken: string;
            readonly expectedRevision: number;
          }
        | undefined
      >;
    }
  ).assign.bind(adapter);

  const [first, second] = await Promise.all([assign(identity(), now), assign(identity(), now)]);
  const assignment = first ?? second;

  assert.ok(assignment);
  assert.equal(
    (assignment as unknown as { readonly descriptorId?: string }).descriptorId,
    ids.descriptor,
  );
  assert.equal(
    (assignment as unknown as { readonly descriptorHash?: string }).descriptorHash,
    executionRequestRow(['metadata.read']).canonicalHash,
  );
  assert.match(
    (assignment as unknown as { readonly attemptBindingHash?: string }).attemptBindingHash ?? '',
    /^[a-f0-9]{64}$/u,
  );
  assert.equal(first === undefined || second === undefined, true);
  assert.equal(database.attempts.length, 1);
  assert.equal(database.attempts[0]?.id, assignment.attemptId);
  assert.equal(database.attempts[0]?.executorId, ids.worker);
  assert.equal(database.attempts[0]?.state, 'CLAIMED');
  assert.equal(database.attempts[0]?.revision, 1);
  assert.equal(database.jobs[0]?.state, 'DISPATCHED');
  assert.equal(database.jobs[0]?.revision, 2);
  assert.equal(database.transitions.length, 1);
  assert.equal(database.transitions[0]?.fromState, 'QUEUED');
  assert.equal(database.transitions[0]?.toState, 'DISPATCHED');
  assert.equal(database.outbox.length, 1);
  assert.match(database.outbox[0]?.eventType ?? '', /^WORKER_ASSIGNED:/u);
  assert.notEqual(database.attempts[0]?.leaseTokenHash, assignment.leaseToken);
  assert.equal(database.attempts[0]?.leaseTokenHash.length, 64);
});

void test('[JRA-007/JRA-013] an expired latest lease is recorded and replaced by a new attempt', async () => {
  const database = new FakeWorkerDatabase();
  database.jobs = [jobRow('RUNNING', 3)];
  database.actions = [{ ...actionRow(), requiredCapabilities: ['metadata.read'] }];
  database.descriptors = [executionRequestRow(['metadata.read'])];
  database.attempts = [
    attemptRow({
      attemptNumber: 1,
      createdAt: new Date('2026-08-12T23:50:00.000Z'),
      heartbeatAt: new Date('2026-08-12T23:55:00.000Z'),
      startedAt: new Date('2026-08-12T23:50:00.000Z'),
      leaseExpiresAt: new Date('2026-08-12T23:59:00.000Z'),
      revision: 2,
    }),
  ];
  const adapter = new PrismaJraWorkerAdapter(
    database.client,
    epochPort(() => 4),
    grants({ count: 0 }),
  );

  const assignment = await adapter.assign(identity(), now);

  assert.ok(assignment);
  assert.equal(database.attempts.length, 2);
  assert.equal(database.attempts[0]?.state, 'EXPIRED');
  assert.equal(database.attempts[0]?.revision, 3);
  assert.equal(database.attempts[1]?.id, assignment.attemptId);
  assert.equal(database.attempts[1]?.attemptNumber, 2);
  assert.equal(database.attempts[1]?.state, 'CLAIMED');
  assert.equal(database.jobs[0]?.state, 'RUNNING');
  assert.equal(database.jobs[0]?.revision, 3);
  assert.equal(database.outbox.length, 1);
});

void test('[JRA-023] an expired attempt for a terminal job cannot starve a newer queued job', async () => {
  const database = new FakeWorkerDatabase();
  const staleJobId = '00000000-0000-4000-8000-000000000014';
  const staleAttemptId = '00000000-0000-4000-8000-000000000015';
  database.jobs = [
    {
      ...jobRow('CANCELLED', 2),
      id: staleJobId,
      finishedAt: new Date('2026-08-12T23:59:00.000Z'),
    },
    jobRow('QUEUED', 1),
  ];
  database.attempts = [
    attemptRow({
      id: staleAttemptId,
      jobId: staleJobId,
      leaseExpiresAt: new Date('2026-08-12T23:59:00.000Z'),
    }),
  ];
  const adapter = new PrismaJraWorkerAdapter(
    database.client,
    epochPort(() => 4),
    grants({ count: 0 }),
  );

  const assignment = await adapter.assign(identity(), now);

  assert.ok(assignment);
  assert.equal(database.attempts.length, 2);
  assert.equal(database.attempts[0]?.id, staleAttemptId);
  assert.equal(database.attempts[0]?.state, 'RUNNING');
  assert.equal(database.jobs[0]?.state, 'CANCELLED');
  assert.equal(database.jobs[1]?.state, 'DISPATCHED');
  assert.equal(database.jobs[1]?.revision, 2);
  assert.equal(database.outbox.length, 1);
});

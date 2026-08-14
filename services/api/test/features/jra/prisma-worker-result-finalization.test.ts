/* eslint-disable @typescript-eslint/require-await */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createExecutionRequestDescriptorV1 } from '../../../src/features/jra/application/execution-request-descriptor.js';
import { workerAttemptDescriptorBindingHashV1 } from '../../../src/features/jra/worker/execution-descriptor-binding.js';
import {
  PrismaJraWorkerAdapter,
  type JraWorkerActionDatabaseRowV1,
  type JraWorkerAttemptDatabaseRowV1,
  type JraWorkerCompletionDatabaseRowV1,
  type JraWorkerDatabaseClientV1,
  type JraWorkerExecutionRequestDatabaseRowV1,
  type JraWorkerJobDatabaseRowV1,
  type JraWorkerOutboxDatabaseRowV1,
  type JraWorkerResultFinalizationDatabaseRowV1,
  type JraWorkerResultManifestDatabaseRowV1,
  type JraWorkerResultPreparationDatabaseRowV1,
  type JraWorkerTransitionDatabaseRowV1,
  type WorkerResultFinalizationEffectsPortV1,
} from '../../../src/features/jra/worker/prisma-worker-adapter.js';
import type { WorkerResultFinalizationInputV1 } from '../../../src/features/jra/worker/worker-result-finalization.port.js';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

const stable = (value: string) => {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid identifier fixture');
  return parsed.value;
};
const utc = (value: string) => {
  const parsed = parseStrictUtcTimestampV1(value);
  if (!parsed.accepted) throw new Error('invalid timestamp fixture');
  return parsed.value;
};
const id = (suffix: string) => stable(`00000000-0000-4000-8000-${suffix.padStart(12, '0')}`);
const scopeResult = parseTenantScopeV1({
  scopeType: 'workspace', organizationId: id('1'), workspaceId: id('2'),
});
if (!scopeResult.accepted) throw new Error('invalid scope fixture');
const scope = scopeResult.value;
const now = '2026-08-14T00:00:00.000Z';
const leaseExpiresAt = '2026-08-14T00:10:00.000Z';
const leaseTokenHash = 'a'.repeat(64);
const resultUsageSettlementBindingId = id('54');
const sourceArtifactVersionIds = Object.freeze([id('52')]);
const processorVersion = 'engine-1.0.0';
const sourceLineageHash = createHash('sha256')
  .update(JSON.stringify({ sourceArtifactVersionIds, processorVersion }), 'utf8')
  .digest('hex');
const descriptor = (() => {
  const result = createExecutionRequestDescriptorV1({
    schemaVersion: 1, descriptorId: id('6'), resultUsageSettlementBindingId,
    tenantScope: scope, jobId: id('4'), stepId: id('20'),
    action: { type: 'typed.test', version: 1, inputSchemaId: 'input.v1', outputSchemaId: 'output.v1',
      handlerDigest: 'd'.repeat(64), requiredCapabilities: ['metadata.read'], sideEffectClass: 'NONE',
      riskClass: 'READ_ONLY' },
    inputObjectIds: sourceArtifactVersionIds, inputManifestHash: 'e'.repeat(64),
    parameters: { dashboardId: id('29'), dashboardVersionId: id('30'), widgetId: id('31'), planVersionId: id('32'),
      metricVersionId: id('33'), datasetVersionId: id('34'), permissionProjectionVersionId: id('35'),
      policyVersionId: id('36'), timezone: 'Asia/Bangkok', inputSelectorHash: '9'.repeat(64),
      engineVersion: processorVersion, dataMode: 'Cloud',
      payloadClass: 'RECONSTRUCTABLE_DERIVED_CONTENT' },
    outputPolicy: { outputObjectId: id('53'), maxBytes: 1024, mediaType: 'application/json' },
    deadline: '2026-08-14T01:00:00.000Z', locale: 'vi-VN', createdAt: now,
  });
  if (!result.accepted) throw new Error('invalid descriptor fixture');
  return result.value;
})();
const bindingHash = workerAttemptDescriptorBindingHashV1({
  descriptorHash: descriptor.canonicalHash, attemptId: id('5'), jobId: id('4'), workerId: id('3'),
  securityEpoch: 4, leaseExpiresAt,
});

type Row = object;
type Delegate<T extends Row> = {
  findFirst(input: { where: Readonly<Record<string, unknown>>; orderBy?: Readonly<Record<string, 'asc' | 'desc'>> }): Promise<T | null>;
  findMany(input: { where: Readonly<Record<string, unknown>>; orderBy?: Readonly<Record<string, 'asc' | 'desc'>> }): Promise<readonly T[]>;
  create(input: { data: Readonly<Record<string, unknown>> }): Promise<T>;
  updateMany(input: { where: Readonly<Record<string, unknown>>; data: Readonly<Record<string, unknown>> }): Promise<{ count: number }>;
};
const matches = (row: Row, where: Readonly<Record<string, unknown>>): boolean =>
  Object.entries(where).every(([key, value]) => {
    if (key === 'OR' && Array.isArray(value))
      return value.some((candidate) => typeof candidate === 'object' && candidate !== null && matches(row, candidate as Record<string, unknown>));
    return (row as Record<string, unknown>)[key] === value;
  });
function delegate<T extends Row>(read: () => T[], write: (rows: T[]) => void): Delegate<T> {
  const select = (where: Readonly<Record<string, unknown>>, orderBy?: Readonly<Record<string, 'asc' | 'desc'>>) => {
    const rows = read().filter((row) => matches(row, where));
    const [ordering] = Object.entries(orderBy ?? {});
    if (ordering) rows.sort((left, right) => {
      const [key, direction] = ordering;
      const leftValue = (left as Record<string, unknown>)[key];
      const rightValue = (right as Record<string, unknown>)[key];
      const a = leftValue instanceof Date ? leftValue.getTime() : leftValue;
      const b = rightValue instanceof Date ? rightValue.getTime() : rightValue;
      const compared = String(a).localeCompare(String(b), undefined, { numeric: true });
      return direction === 'asc' ? compared : -compared;
    });
    return rows;
  };
  return {
    findFirst: async ({ where, orderBy }) => select(where, orderBy)[0] ?? null,
    findMany: async ({ where, orderBy }) => select(where, orderBy),
    create: async ({ data }) => { const row = { ...data } as T; write([...read(), row]); return row; },
    updateMany: async ({ where, data }) => {
      let count = 0; const rows = read();
      for (const row of rows) if (matches(row, where)) { Object.assign(row, data); count += 1; }
      write(rows); return { count };
    },
  };
}

class Database {
  actions: JraWorkerActionDatabaseRowV1[] = [{ id: id('40'), actionType: 'typed.test', version: 1,
    inputSchemaId: 'input.v1', outputSchemaId: 'output.v1', handlerDigest: 'd'.repeat(64),
    requiredCapabilities: ['metadata.read'], sideEffectClass: 'NONE', riskClass: 'READ_ONLY',
    defaultTimeoutSeconds: 60, maxAttempts: 3, approvalClass: 'NONE', createdAt: new Date(now) }];
  jobs: JraWorkerJobDatabaseRowV1[] = [{ id: id('4'), scopeType: 'workspace', organizationId: id('1'),
    workspaceId: id('2'), projectId: null, requestedBy: id('3'), actionType: 'typed.test', actionVersion: 1,
    inputManifestHash: 'e'.repeat(64), idempotencyKey: 'job-key', state: 'RUNNING', revision: 2,
    createdAt: new Date(now), startedAt: new Date(now), finishedAt: null }];
  attempts: JraWorkerAttemptDatabaseRowV1[] = [{ id: id('5'), jobId: id('4'), scopeType: 'workspace',
    organizationId: id('1'), workspaceId: id('2'), projectId: null, attemptNumber: 1,
    executorType: 'CLOUD_WORKER', executorId: id('3'), leaseTokenHash, leaseExpiresAt: new Date(leaseExpiresAt),
    state: 'RUNNING', createdAt: new Date(now), heartbeatAt: new Date(now), startedAt: new Date(now),
    finishedAt: null, resultManifestHash: null, revision: 1 }];
  descriptors: JraWorkerExecutionRequestDatabaseRowV1[] = [{ id: id('6'), jobId: id('4'), stepId: id('20'),
    resultUsageSettlementBindingId,
    scopeType: 'workspace', organizationId: id('1'), workspaceId: id('2'), projectId: null,
    actionType: descriptor.action.type, actionVersion: descriptor.action.version,
    inputSchemaId: descriptor.action.inputSchemaId, outputSchemaId: descriptor.action.outputSchemaId,
    handlerDigest: descriptor.action.handlerDigest, requiredCapabilities: descriptor.action.requiredCapabilities,
    sideEffectClass: descriptor.action.sideEffectClass, riskClass: descriptor.action.riskClass,
    inputObjectIds: descriptor.inputObjectIds, inputManifestHash: descriptor.inputManifestHash,
    parameters: descriptor.parameters, outputObjectId: descriptor.outputPolicy.outputObjectId,
    outputMaxBytes: descriptor.outputPolicy.maxBytes, outputMediaType: descriptor.outputPolicy.mediaType,
    deadline: new Date(descriptor.deadline), locale: descriptor.locale, canonicalHash: descriptor.canonicalHash,
    createdAt: new Date(descriptor.createdAt) }];
  completions: JraWorkerCompletionDatabaseRowV1[] = [];
  preparations: JraWorkerResultPreparationDatabaseRowV1[] = [];
  finalizations: JraWorkerResultFinalizationDatabaseRowV1[] = [];
  manifests: JraWorkerResultManifestDatabaseRowV1[] = [];
  transitions: JraWorkerTransitionDatabaseRowV1[] = [];
  outbox: JraWorkerOutboxDatabaseRowV1[] = [];
  effects = 0;
  lastEffect: Parameters<WorkerResultFinalizationEffectsPortV1['commit']>[1] | undefined;
  failEffects = false;
  private tail = Promise.resolve();
  client: JraWorkerDatabaseClientV1;

  constructor() {
    this.client = {
      typedActionDefinitionRecord: delegate(() => this.actions, (v) => { this.actions = v; }),
      jobRecord: delegate(() => this.jobs, (v) => { this.jobs = v; }),
      executionAttemptRecord: delegate(() => this.attempts, (v) => { this.attempts = v; }),
      executionRequestDescriptorRecord: delegate(() => this.descriptors, (v) => { this.descriptors = v; }),
      workerCompletionRecord: delegate(() => this.completions, (v) => { this.completions = v; }),
      workerResultPreparationRecord: delegate(() => this.preparations, (v) => { this.preparations = v; }),
      workerResultFinalizationRecord: delegate(() => this.finalizations, (v) => { this.finalizations = v; }),
      resultManifestRecord: delegate(() => this.manifests, (v) => { this.manifests = v; }),
      jobTransitionRecord: delegate(() => this.transitions, (v) => { this.transitions = v; }),
      jobOutboxRecord: delegate(() => this.outbox, (v) => { this.outbox = v; }),
      $transaction: async <T>(work: (transaction: JraWorkerDatabaseClientV1) => Promise<T>) => {
        let release!: () => void; const previous = this.tail;
        this.tail = new Promise<void>((resolve) => { release = resolve; }); await previous;
        const snapshot = structuredClone({ jobs: this.jobs, attempts: this.attempts, preparations: this.preparations,
          finalizations: this.finalizations, manifests: this.manifests, transitions: this.transitions,
          outbox: this.outbox, effects: this.effects });
        try { return await work(this.client); }
        catch (error) { Object.assign(this, snapshot); throw error; }
        finally { release(); }
      },
    };
  }

  effectsPort(): WorkerResultFinalizationEffectsPortV1 {
    return { commit: async (_transaction, effect) => {
      if (this.failEffects) throw new Error('EFFECT_FAILED');
      this.lastEffect = effect;
      this.effects += 1;
    } };
  }
}

const identity = { workerId: id('3'), tenantScope: scope, securityEpoch: 4, correlationId: id('9') } as const;
function adapter(database: Database) {
  return new PrismaJraWorkerAdapter(database.client, { isCurrent: async () => true }, {
    issueInputGrant: async () => { throw new Error('unused'); },
    acceptResultReferences: async () => { throw new Error('legacy must be unused'); },
  }, database.effectsPort());
}
function authorization() {
  return {
    attempt: { schemaVersion: 1 as const, attemptId: id('5'), jobId: id('4'), tenantScope: scope,
      attemptNumber: 1, executorType: 'CLOUD_WORKER' as const, executorId: id('3'), leaseTokenHash,
      leaseExpiresAt: utc(leaseExpiresAt), state: 'RUNNING' as const, createdAt: utc(now), heartbeatAt: utc(now),
      startedAt: utc(now), revision: 1 },
    job: { schemaVersion: 1 as const, jobId: id('4'), tenantScope: scope, requestedBy: id('3'),
      action: { schemaVersion: 1 as const, actionType: 'typed.test', version: 1, inputSchemaId: 'input.v1',
        outputSchemaId: 'output.v1', handlerDigest: 'd'.repeat(64), requiredCapabilities: ['metadata.read'],
        sideEffectClass: 'NONE' as const, riskClass: 'READ_ONLY' as const, defaultTimeoutSeconds: 60,
        maxAttempts: 3, approvalClass: 'NONE' as const }, inputManifestHash: 'e'.repeat(64),
      idempotencyKey: 'job-key', state: 'RUNNING' as const, createdAt: utc(now), startedAt: utc(now), revision: 2 },
    latestAttemptId: id('5'), workerSecurityEpoch: 4, descriptorId: id('6'),
    descriptorHash: descriptor.canonicalHash, attemptBindingHash: bindingHash,
  };
}
async function prepared(database: Database) {
  const result = await adapter(database).prepare({ identity, authorization: authorization(), leaseTokenHash,
    expectedRevision: 1, idempotencyKey: 'prepare-key', fingerprint: 'b'.repeat(64), now,
    outputs: [{ kind: 'JSON_RESULT', outputName: 'primary', schemaId: 'output.v1',
      mediaType: 'application/json', contentSha256: 'f'.repeat(64), byteLength: 512,
      sourceLineageHash }] });
  assert.equal(result.accepted, true); if (!result.accepted) throw new Error('prepare failed');
  return result.preparation;
}
function finalizeInput(preparation: Awaited<ReturnType<typeof prepared>>): WorkerResultFinalizationInputV1 {
  return { identity, authorization: authorization(), leaseTokenHash, expectedRevision: 1,
    submissionId: preparation.submissionId, attemptId: id('5'), descriptorId: id('6'),
    descriptorHash: descriptor.canonicalHash, attemptBindingHash: bindingHash, idempotencyKey: 'finalize-key',
    attestationReferences: [{ outputName: 'primary', attestationId: id('50') }],
    attestations: [{ schemaVersion: 1, attestationId: id('50'), tenantScope: scope, jobId: id('4'),
      attemptId: id('5'), executionDescriptorId: id('6'), executionDescriptorHash: descriptor.canonicalHash,
      submissionId: preparation.submissionId, artifactVersionId: id('51'), contentSha256: 'f'.repeat(64),
      contentLength: 512, mediaType: 'application/json', sourceLineageHash,
      outputPolicyHash: preparation.outputPolicyHash, finalizedAt: utc(now) }],
    resultBinding: { kind: 'OUTPUT_SET', outputSchemaId: 'output.v1', outputNames: ['primary'] },
    fingerprint: 'c'.repeat(64), now };
}

void test('[JRA-007/JRA-031] preparation is stable and leaves attempt/job non-terminal', async () => {
  const database = new Database(); const first = await prepared(database); const second = await prepared(database);
  assert.equal(first.submissionId, second.submissionId); assert.equal(database.preparations.length, 1);
  assert.equal(database.attempts[0]?.state, 'RUNNING'); assert.equal(database.jobs[0]?.state, 'RUNNING');
  assert.equal(first.resultUsageSettlementBindingId, resultUsageSettlementBindingId);
  assert.deepEqual(first.outputs[0]?.sourceArtifactVersionIds, sourceArtifactVersionIds);
  assert.equal(first.outputs[0]?.processorVersion, processorVersion);
  assert.equal(first.outputs[0]?.dataMode, 'Cloud');
  assert.equal(first.outputs[0]?.payloadClass, 'RECONSTRUCTABLE_DERIVED_CONTENT');
  assert.deepEqual(first.subjectBindings, { dashboardId: id('29'), dashboardVersionId: id('30'), datasetVersionId: id('34'),
    engineVersion: 'engine-1.0.0', handlerDigest: 'd'.repeat(64), locale: 'vi-VN', metricVersionId: id('33'),
    inputSelectorHash: '9'.repeat(64), permissionProjectionVersionId: id('35'),
    planVersionId: id('32'), policyVersionId: id('36'),
    timezone: 'Asia/Bangkok', widgetId: id('31') });
});

void test('[JRA-012/JRA-023/JRA-031] finalization commits manifest, terminal state, replay, outbox and participants once', async () => {
  const database = new Database(); const input = finalizeInput(await prepared(database)); const service = adapter(database);
  const [first, second] = await Promise.all([service.finalize(input), service.finalize(input)]);
  assert.equal(first.accepted, true); assert.equal(second.accepted, true);
  assert.equal(database.manifests.length, 1); assert.equal(database.finalizations.length, 1);
  assert.equal(database.attempts[0]?.state, 'SUCCEEDED'); assert.equal(database.jobs[0]?.state, 'SUCCEEDED');
  assert.equal(database.outbox.length, 1); assert.equal(database.effects, 1);
  assert.equal(database.lastEffect?.resultUsageSettlementBindingId, resultUsageSettlementBindingId);
  assert.equal(database.lastEffect?.authorizationEpoch, identity.securityEpoch);
  assert.equal(database.lastEffect?.jobRevision, database.jobs[0]?.revision);
});

void test('[JRA-031] participant failure rolls back manifest, terminal state, replay and outbox', async () => {
  const database = new Database(); const input = finalizeInput(await prepared(database)); database.failEffects = true;
  const result = await adapter(database).finalize(input);
  assert.deepEqual(result, { accepted: false, code: 'FINALIZATION_UNAVAILABLE' });
  assert.equal(database.manifests.length, 0); assert.equal(database.finalizations.length, 0);
  assert.equal(database.attempts[0]?.state, 'RUNNING'); assert.equal(database.jobs[0]?.state, 'RUNNING');
  assert.equal(database.outbox.length, 0); assert.equal(database.effects, 0);
});

void test('[JRA-032/BUA-023] mismatched stored settlement binding rejects before terminal mutation', async () => {
  const database = new Database();
  const preparation = await prepared(database);
  (database.preparations[0] as unknown as Record<string, unknown>)[
    'resultUsageSettlementBindingId'
  ] = id('99');

  const result = await adapter(database).finalize(finalizeInput(preparation));

  assert.equal(result.accepted, false);
  assert.equal(database.manifests.length, 0);
  assert.equal(database.finalizations.length, 0);
  assert.equal(database.attempts[0]?.state, 'RUNNING');
  assert.equal(database.jobs[0]?.state, 'RUNNING');
  assert.equal(database.effects, 0);
});

void test('[JRA-007/JRA-031] older attempt preparation is rejected after a newer attempt exists', async () => {
  const database = new Database(); database.attempts.push({ ...database.attempts[0]!, id: id('60'), attemptNumber: 2 });
  const result = await adapter(database).prepare({ identity, authorization: authorization(), leaseTokenHash,
    expectedRevision: 1, idempotencyKey: 'prepare-key', fingerprint: 'b'.repeat(64), now,
    outputs: [{ kind: 'JSON_RESULT', outputName: 'primary', schemaId: 'output.v1',
      mediaType: 'application/json', contentSha256: 'f'.repeat(64), byteLength: 512,
      sourceLineageHash }] });
  assert.deepEqual(result, { accepted: false, code: 'STALE_ATTEMPT' });
  assert.equal(database.preparations.length, 0);
});

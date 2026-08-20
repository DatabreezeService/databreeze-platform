/* eslint-disable @typescript-eslint/require-await */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryExecutionAttemptRepositoryAdapter } from '../../../../src/features/jra/adapter/in-memory-execution-attempt-repository.adapter.js';
import { InMemoryJobRepositoryAdapter } from '../../../../src/features/jra/adapter/in-memory-job-repository.adapter.js';
import { ExecutionAttemptService } from '../../../../src/features/jra/application/execution-attempt.service.js';
import {
  executionWorkloadEnvelopeCanonicalHashV1,
  type ExecutionWorkloadEnvelopeV1,
} from '../../../../src/features/jra/application/execution-workload-envelope.js';
import { JobService } from '../../../../src/features/jra/application/job.service.js';
import { WorkerBoundary } from '../../../../src/features/jra/worker/worker-boundary.js';
import { workerAttemptDescriptorBindingHashV1 } from '../../../../src/features/jra/worker/execution-descriptor-binding.js';
import type {
  WorkerAttemptAuthorityPortV1,
  WorkerAuthenticatorPortV1,
  WorkerCompletionTransactionPortV1,
  WorkerCompletionTransactionResultV1,
  WorkerIdentityV1,
  WorkerObjectGrantAuthorityPortV1,
  WorkerWorkloadEnvelopeAuthorityPortV1,
} from '../../../../src/features/jra/worker/worker-ports.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
});
if (!scopeResult.accepted) throw new Error('invalid test scope');
const scope: TenantScopeV1 = scopeResult.value;
const sid = (value: string): StableIdentifierV1 => {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
};
const utc = (value: string) => {
  const parsed = parseStrictUtcTimestampV1(value);
  if (!parsed.accepted) throw new Error('invalid test timestamp');
  return parsed.value;
};
const workerId = sid('00000000-0000-4000-8000-000000000003');
const jobId = sid('00000000-0000-4000-8000-000000000004');
const attemptId = sid('00000000-0000-4000-8000-000000000005');
const now = '2026-08-13T00:00:00.000Z';
const leaseToken = 'worker-secret-that-is-not-reflected';
const leaseTokenHash = '601d7b5b778cba99637df621f0baca2bca1287c9f2505ab4abd7eca62cc3e1ff';
const manifestHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const descriptorId = sid('00000000-0000-4000-8000-000000000011');
const descriptorHash = '9'.repeat(64);

function bindingHash(leaseExpiresAt = '2026-08-13T00:10:00.000Z') {
  return workerAttemptDescriptorBindingHashV1({
    descriptorHash,
    attemptId,
    jobId,
    workerId,
    securityEpoch: 4,
    leaseExpiresAt,
  });
}

function claimInput(
  expectedRevision = 1,
  token = leaseToken,
  leaseExpiresAt = '2026-08-13T00:10:00.000Z',
) {
  return {
    attemptId,
    leaseToken: token,
    expectedRevision,
    descriptorId,
    descriptorHash,
    attemptBindingHash: bindingHash(leaseExpiresAt),
  };
}

function context(identity: WorkerIdentityV1 = identityValue()) {
  return {
    tenantScope: identity.tenantScope,
    actorId: identity.workerId,
    correlationId: identity.correlationId,
    idempotencyKey: 'worker-test',
    authorizationEpoch: identity.securityEpoch,
    mfaReenrollmentRequired: false,
  } as const;
}

function identityValue(overrides: Partial<WorkerIdentityV1> = {}): WorkerIdentityV1 {
  return {
    workerId,
    tenantScope: scope,
    securityEpoch: 4,
    correlationId: sid('00000000-0000-4000-8000-000000000006'),
    ...overrides,
  };
}

function authenticator(value: WorkerIdentityV1 | undefined): WorkerAuthenticatorPortV1 {
  return { authenticate: async () => value };
}

async function seed(leaseExpiresAt = '2026-08-13T00:10:00.000Z') {
  const attempts = new InMemoryExecutionAttemptRepositoryAdapter();
  const jobs = new InMemoryJobRepositoryAdapter();
  const attemptService = new ExecutionAttemptService(attempts);
  const jobService = new JobService(jobs);
  const job = await jobService.create(context(), {
    jobId,
    tenantScope: scope,
    requestedBy: workerId,
    inputManifestHash: manifestHash,
    idempotencyKey: `job-test-${leaseExpiresAt}`,
    createdAt: now,
    action: {
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
  });
  assert.equal(job.accepted, true);
  const attempt = await attemptService.claim(context(), {
    attemptId,
    jobId,
    tenantScope: scope,
    attemptNumber: 1,
    executorType: 'CLOUD_WORKER',
    executorId: workerId,
    leaseTokenHash,
    leaseExpiresAt,
    createdAt: now,
  });
  assert.equal(attempt.accepted, true);
  return { attempts, jobs, attemptService, jobService };
}

function authorityFor(
  seeded: Awaited<ReturnType<typeof seed>>,
  overrides: {
    readonly latestAttemptId?: StableIdentifierV1;
    readonly workerSecurityEpoch?: number;
    readonly scope?: TenantScopeV1;
  } = {},
): WorkerAttemptAuthorityPortV1 {
  return {
    authorize: async (identity, input) => {
      const lookupContext = context(identity);
      const attempt = await seeded.attempts.find(lookupContext, input.attemptId);
      if (!attempt) return undefined;
      const job = await seeded.jobs.find(lookupContext, attempt.jobId);
      if (!job) return undefined;
      return {
        attempt: {
          ...attempt,
          ...(overrides.scope === undefined ? {} : { tenantScope: overrides.scope }),
        },
        job,
        latestAttemptId: overrides.latestAttemptId ?? attempt.attemptId,
        workerSecurityEpoch: overrides.workerSecurityEpoch ?? identity.securityEpoch,
        descriptorId,
        descriptorHash,
        attemptBindingHash: workerAttemptDescriptorBindingHashV1({
          descriptorHash,
          attemptId: attempt.attemptId,
          jobId: job.jobId,
          workerId: identity.workerId,
          securityEpoch: identity.securityEpoch,
          leaseExpiresAt: attempt.leaseExpiresAt,
        }),
      };
    },
  };
}

void test('[JRA-006/JRA-023] claim rejects a descriptor binding not issued for the exact attempt', async () => {
  const seeded = await seed();
  const counter = { issue: 0, accept: 0 };
  const boundary = boundaryFor(seeded, { counter });
  const claim = boundary.claim.bind(boundary) as unknown as (
    request: unknown,
    input: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;

  await assert.rejects(
    claim(
      {},
      {
        attemptId,
        leaseToken,
        expectedRevision: 1,
        descriptorId,
        descriptorHash,
        attemptBindingHash: '7'.repeat(64),
      },
    ),
    /WORKER_DESCRIPTOR_BINDING_REJECTED/,
  );
  assert.equal(counter.issue, 0);
});

function grants(counter: { issue: number; accept: number } = { issue: 0, accept: 0 }): {
  readonly authority: WorkerObjectGrantAuthorityPortV1;
  readonly counter: { issue: number; accept: number };
} {
  const authority: WorkerObjectGrantAuthorityPortV1 = {
    issueInputGrant: async (identity, job, attempt) => {
      counter.issue += 1;
      return {
        grantType: 'JOB_INPUT',
        attemptId: attempt.attemptId,
        jobId: job.jobId,
        workerId: identity.workerId,
        securityEpoch: identity.securityEpoch,
        tenantScope: identity.tenantScope,
        objectIds: ['00000000-0000-4000-8000-000000000007'],
        expiresAt: attempt.leaseExpiresAt,
      };
    },
    acceptResultReferences: async (identity, job, attempt, refs) => {
      counter.accept += 1;
      return refs.map((objectId) => ({
        grantType: 'JOB_OUTPUT' as const,
        attemptId: attempt.attemptId,
        jobId: job.jobId,
        workerId: identity.workerId,
        securityEpoch: identity.securityEpoch,
        tenantScope: identity.tenantScope,
        objectId,
        expiresAt: attempt.leaseExpiresAt,
      }));
    },
  };
  return { authority, counter };
}

function completionTransaction(
  seeded: Awaited<ReturnType<typeof seed>>,
  objectGrants: WorkerObjectGrantAuthorityPortV1,
): WorkerCompletionTransactionPortV1 {
  type AcceptedCompletion = Extract<
    WorkerCompletionTransactionResultV1,
    { readonly accepted: true }
  >;
  const values = new Map<string, AcceptedCompletion>();
  let tail: Promise<void> = Promise.resolve();
  return {
    findReplay: async (input) => {
      const value = values.get(input.fingerprint);
      return value?.accepted ? value.completion : undefined;
    },
    complete: async (input) => {
      let release!: () => void;
      const previous = tail;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const replay = values.get(input.fingerprint);
        if (replay?.accepted) return { ...replay, replayed: true, outputGrants: [] };
        const outputGrants = await objectGrants.acceptResultReferences(
          input.identity,
          input.authorization.job,
          input.authorization.attempt,
          input.resultReferences,
        );
        const completed = await seeded.attemptService.complete(
          context(input.identity),
          input.authorization.attempt.attemptId,
          input.leaseTokenHash,
          input.outcome,
          input.now,
          input.expectedRevision,
          input.resultManifestHash,
        );
        if (!completed.accepted) {
          return {
            accepted: false,
            code:
              completed.code === 'LEASE_EXPIRED'
                ? 'LEASE_EXPIRED'
                : completed.code === 'INVALID_REVISION'
                  ? 'STALE_ATTEMPT'
                  : completed.code === 'INVALID_LEASE'
                    ? 'ATTEMPT_REJECTED'
                    : 'COMPLETION_UNAVAILABLE',
          };
        }
        const completion = {
          attemptId: completed.value.attemptId,
          revision: completed.value.revision,
          outcome: input.outcome,
          ...(input.resultManifestHash === undefined
            ? {}
            : { resultManifestHash: input.resultManifestHash }),
          resultReferences: input.resultReferences,
        };
        const result = { accepted: true as const, replayed: false, completion, outputGrants };
        values.set(input.fingerprint, result);
        return result;
      } finally {
        release();
      }
    },
  };
}

function boundaryFor(
  seeded: Awaited<ReturnType<typeof seed>>,
  options: {
    readonly identity?: WorkerIdentityV1 | undefined;
    readonly authority?: WorkerAttemptAuthorityPortV1;
    readonly grants?: WorkerObjectGrantAuthorityPortV1;
    readonly workloadEnvelope?: WorkerWorkloadEnvelopeAuthorityPortV1;
    readonly counter?: { issue: number; accept: number };
  } = {},
): WorkerBoundary {
  const objectGrants = options.grants ?? grants(options.counter).authority;
  return new WorkerBoundary({
    attempts: seeded.attemptService,
    authority: options.authority ?? authorityFor(seeded),
    authenticator: authenticator(
      Object.hasOwn(options, 'identity') ? options.identity : identityValue(),
    ),
    grants: objectGrants,
    completion: completionTransaction(seeded, objectGrants),
    ...(options.workloadEnvelope === undefined
      ? {}
      : { workloadEnvelope: options.workloadEnvelope }),
    now: () => now,
  });
}

void test('[JRA-033] workload resolution is lease-bound and returns only the server envelope', async () => {
  const seeded = await seed();
  const withoutHash = {
    schemaVersion: 1 as const,
    workloadId: sid('00000000-0000-4000-8000-000000000020'),
    descriptorId,
    descriptorHash,
    attemptId,
    attemptBindingHash: bindingHash(),
    tenantScope: scope,
    jobId,
    action: {
      type: 'typed.test',
      version: 1,
      handlerDigest: `sha256:${'a'.repeat(64)}`,
      inputSchemaId: 'input.v1',
      outputSchemaId: 'output.v1',
      requiredCapabilities: ['metadata.read'],
      sideEffectClass: 'NONE' as const,
      riskClass: 'READ_ONLY' as const,
    },
    inputHandles: [
      {
        objectId: '00000000-0000-4000-8000-000000000007',
        schemaId: 'input.v1',
        contentSha256: 'c'.repeat(64),
        byteLength: 12,
      },
    ],
    inputManifestHash: manifestHash,
    parameters: {},
    outputPolicy: {
      outputObjectId: '00000000-0000-4000-8000-000000000008',
      maxBytes: 1024,
      mediaType: 'application/json',
    },
    deadline: utc('2026-08-13T00:10:00.000Z'),
    locale: 'vi-VN' as const,
    timezone: 'UTC',
    subjectBindings: { dashboardId: 'dashboard-1' },
    createdAt: utc(now),
  } satisfies Omit<ExecutionWorkloadEnvelopeV1, 'canonicalHash'>;
  const envelope: ExecutionWorkloadEnvelopeV1 = {
    ...withoutHash,
    canonicalHash: executionWorkloadEnvelopeCanonicalHashV1(withoutHash),
  };
  const boundary = boundaryFor(seeded, {
    workloadEnvelope: {
      resolve: async () => ({ accepted: true as const, value: envelope }),
    },
  });
  await boundary.claim({}, claimInput());
  const resolved = await boundary.workload(
    {},
    {
      ...claimInput(2),
    },
  );
  assert.equal(resolved.workloadId, envelope.workloadId);
  assert.equal(resolved.parameters['unexpected'], undefined);
  await assert.rejects(
    boundary.workload({}, { ...claimInput(1) }),
    /WORKER_STALE_LEASE|WORKER_ATTEMPT_REJECTED/,
  );
});

void test('rejects unauthenticated, revoked, cross-scope, and superseded workers uniformly', async () => {
  const seeded = await seed();
  const counter = { issue: 0, accept: 0 };
  const boundary = boundaryFor(seeded, {
    identity: undefined,
    counter,
  });
  await assert.rejects(boundary.claim({}, claimInput()), /WORKER_AUTHENTICATION_FAILED/);

  const crossScope = boundaryFor(seeded, {
    identity: identityValue({
      tenantScope: {
        scopeType: 'workspace',
        organizationId: scope.organizationId,
        workspaceId: sid('00000000-0000-4000-8000-000000000099'),
      },
    }),
    counter,
  });
  await assert.rejects(crossScope.claim({}, claimInput()), /WORKER_ATTEMPT_REJECTED/);

  const superseded = boundaryFor(seeded, {
    authority: authorityFor(seeded, {
      latestAttemptId: sid('00000000-0000-4000-8000-000000000099'),
    }),
    counter,
  });
  await assert.rejects(superseded.claim({}, claimInput()), /WORKER_ATTEMPT_REJECTED/);
  assert.equal(counter.issue, 0);
});

void test('rejects a revoked worker epoch and a stale revision before issuing a grant', async () => {
  const seeded = await seed();
  const counter = { issue: 0, accept: 0 };
  const revoked = boundaryFor(seeded, {
    authority: authorityFor(seeded, { workerSecurityEpoch: 5 }),
    counter,
  });
  await assert.rejects(revoked.claim({}, claimInput()), /WORKER_ATTEMPT_REJECTED/);

  const stale = boundaryFor(seeded, { counter });
  await assert.rejects(
    stale.claim({}, claimInput(999)),
    /WORKER_STALE_LEASE|WORKER_ATTEMPT_REJECTED/,
  );
  assert.equal(counter.issue, 0);
});

void test('claims a lease only after validation and returns the exact attempt-bound input grant', async () => {
  const seeded = await seed();
  const boundary = boundaryFor(seeded);
  const result = await boundary.claim({}, claimInput());
  assert.equal(result.attemptId, attemptId);
  assert.equal(result.jobId, jobId);
  assert.equal(result.leaseExpiresAt, '2026-08-13T00:10:00.000Z');
  assert.equal(result.revision, 2);
  assert.deepEqual(result.inputGrant, {
    grantType: 'JOB_INPUT',
    attemptId,
    jobId,
    workerId,
    securityEpoch: 4,
    tenantScope: scope,
    objectIds: ['00000000-0000-4000-8000-000000000007'],
    expiresAt: '2026-08-13T00:10:00.000Z',
  });
  assert.equal(JSON.stringify(result).includes(leaseToken), false);
});

void test('rejects cancel-requested and terminal jobs before granting or renewing work', async () => {
  const seeded = await seed();
  const transitioned = await seeded.jobService.transition(
    context(),
    jobId,
    'CANCEL_REQUESTED',
    now,
    1,
  );
  assert.equal(transitioned.accepted, true);
  const counter = { issue: 0, accept: 0 };
  const boundary = boundaryFor(seeded, { counter });
  await assert.rejects(boundary.claim({}, claimInput()), /WORKER_ATTEMPT_REJECTED/);
  assert.equal(counter.issue, 0);
});

void test('rejects stale heartbeats and enforces the fifteen-minute initial and extended lease bound', async () => {
  const seeded = await seed();
  const boundary = boundaryFor(seeded);
  await boundary.claim({}, claimInput());
  const heartbeat = await boundary.heartbeat(
    {},
    {
      attemptId,
      leaseToken,
      expectedRevision: 2,
      nextLeaseExpiresAt: '2026-08-13T00:15:00.000Z',
    },
  );
  assert.equal(heartbeat.revision, 3);
  await assert.rejects(
    boundary.heartbeat(
      {},
      {
        attemptId,
        leaseToken,
        expectedRevision: 2,
        nextLeaseExpiresAt: '2026-08-13T00:15:00.000Z',
      },
    ),
    /WORKER_STALE_LEASE/,
  );
  await assert.rejects(
    boundary.heartbeat(
      {},
      {
        attemptId,
        leaseToken,
        expectedRevision: 3,
        nextLeaseExpiresAt: '2026-08-13T00:16:00.000Z',
      },
    ),
    /WORKER_INVALID_LEASE/,
  );

  const longLease = await seed('2026-08-13T00:16:00.000Z');
  await assert.rejects(
    boundaryFor(longLease).claim({}, claimInput(1, leaseToken, '2026-08-13T00:16:00.000Z')),
    /WORKER_INVALID_LEASE/,
  );
});

void test('rejects wrong-token completion before accepting result references', async () => {
  const seeded = await seed();
  const counter = { issue: 0, accept: 0 };
  const boundary = boundaryFor(seeded, { counter });
  await assert.rejects(
    boundary.complete(
      {},
      {
        attemptId,
        leaseToken: 'wrong',
        expectedRevision: 1,
        outcome: 'FAILED',
        resultReferences: [],
      },
    ),
    /WORKER_ATTEMPT_REJECTED/,
  );
  assert.equal(counter.accept, 0);
});

void test('commits result-free failure replay atomically and never repeats the completion transaction', async () => {
  const seeded = await seed();
  const counter = { issue: 0, accept: 0 };
  const boundary = boundaryFor(seeded, { counter });
  await boundary.claim({}, claimInput());
  const input = {
    attemptId,
    leaseToken,
    expectedRevision: 2,
    outcome: 'FAILED' as const,
    resultReferences: [],
  };
  const [first, second] = await Promise.all([
    boundary.complete({}, input),
    boundary.complete({}, input),
  ]);
  assert.deepEqual(second, first);
  assert.equal(counter.accept, 1);
  assert.deepEqual(first.resultReferences, []);
});

void test('fails closed when the durable replay lookup is unavailable', async () => {
  const seeded = await seed();
  const objectGrants = grants().authority;
  const boundary = new WorkerBoundary({
    attempts: seeded.attemptService,
    authority: authorityFor(seeded),
    authenticator: authenticator(identityValue()),
    grants: objectGrants,
    completion: {
      findReplay: async () => {
        throw new Error('database unavailable');
      },
      complete: async () => {
        throw new Error('database unavailable');
      },
    },
    now: () => now,
  });

  await assert.rejects(
    boundary.complete(
      {},
      {
        attemptId,
        leaseToken,
        expectedRevision: 1,
        outcome: 'FAILED',
        resultReferences: [],
      },
    ),
    /WORKER_COMPLETION_UNAVAILABLE/,
  );
});

void test('fails closed on malformed grant shapes and missing durable completion authority', async () => {
  const seeded = await seed();
  const baseGrants = grants().authority;
  const wrongEpochGrants: WorkerObjectGrantAuthorityPortV1 = {
    issueInputGrant: async (identity, job, attempt) => ({
      ...(await baseGrants.issueInputGrant(identity, job, attempt)),
      securityEpoch: identity.securityEpoch + 1,
    }),
    acceptResultReferences: async (identity, job, attempt, references) =>
      baseGrants.acceptResultReferences(identity, job, attempt, references),
  };
  await assert.rejects(
    boundaryFor(seeded, { grants: wrongEpochGrants }).claim({}, claimInput()),
    /WORKER_OBJECT_GRANT_REJECTED/,
  );

  const malformedGrants: WorkerObjectGrantAuthorityPortV1 = {
    issueInputGrant: async () =>
      ({ grantType: 'JOB_INPUT', objectIds: ['not-a-complete-grant'] }) as never,
    acceptResultReferences: async () => [],
  };
  const malformedSeed = await seed();
  await assert.rejects(
    boundaryFor(malformedSeed, { grants: malformedGrants }).claim({}, claimInput()),
    /WORKER_OBJECT_GRANT_REJECTED/,
  );

  assert.throws(
    () =>
      new WorkerBoundary({
        attempts: seeded.attemptService,
        authority: authorityFor(seeded),
        authenticator: authenticator(identityValue()),
        grants: grants().authority,
        completion: undefined as never,
      }),
    /WORKER_COMPLETION_TRANSACTION_UNAVAILABLE/,
  );
});

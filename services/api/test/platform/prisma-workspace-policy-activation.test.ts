import assert from 'node:assert/strict';
import test from 'node:test';

/* eslint-disable @typescript-eslint/require-await -- deterministic Prisma transaction doubles. */

import { createDataModePolicyVersionV1 } from '@databreeze/domain/data-mode/v1';
import { createIamTenantContextV1 } from '../../src/features/iam/application/tenant-context.js';
import {
  PrismaWorkspacePolicyAtomicTransactionAdapter,
  WorkspaceDataModePolicyActivationService,
  type WorkspacePolicyActivationDatabaseClientV1,
} from '../../src/platform/dso-workspace-policy.composition.js';

const activationAuthorization = {
  authorize: async () => ({
    allowed: true as const,
    authorizationDecisionId: 'admin-decision',
    recentMfaAssertionId: 'recent-mfa',
    transitionProofId: 'safe-transition',
  }),
};
const activationEffects = {
  forTransaction: () => ({
    audit: { appendActivation: async () => undefined },
    outbox: { appendPolicyChanged: async () => undefined },
  }),
};

const ids = {
  organization: '00000000-0000-4000-8000-000000000401',
  workspace: '00000000-0000-4000-8000-000000000402',
  actor: '00000000-0000-4000-8000-000000000403',
  policy: '00000000-0000-4000-8000-000000000404',
  version: '00000000-0000-4000-8000-000000000405',
} as const;

function context(key = 'activate-once') {
  const parsed = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organization,
      workspaceId: ids.workspace,
    },
    actorId: ids.actor,
    correlationId: '00000000-0000-4000-8000-000000000406',
    idempotencyKey: key,
    authorizationEpoch: 7,
  });
  if (!parsed.accepted) throw new Error('invalid context');
  return parsed.value;
}

function policy(versionId: string = ids.version, canonicalHash: string = 'd'.repeat(64)) {
  const parsed = createDataModePolicyVersionV1({
    policyId: ids.policy,
    policyVersionId: versionId,
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    revision: 1,
    mode: 'LOCAL',
    allowedPayloadClasses: {
      PUBLIC: ['CONTROL_METADATA'],
      INTERNAL: ['CONTROL_METADATA'],
      CONFIDENTIAL: ['CONTROL_METADATA'],
      RESTRICTED: ['CONTROL_METADATA'],
    },
    allowedPlacementKinds: ['LOCAL'],
    allowedExecutorClasses: ['DESKTOP'],
    allowedDestinationClasses: ['DESKTOP'],
    canonicalHash,
    publishedAt: '2026-08-13T00:00:00.000Z',
  });
  if (!parsed.accepted) throw new Error('invalid policy');
  return parsed.value;
}

function input() {
  return {
    policy: policy(),
    expectedAggregateRevision: 0,
    expectedAuthorizationEpoch: 7,
  } as const;
}

void test('[DSO-026/027][IAM-019] Prisma participant uses CAS filters and increments epoch once', async () => {
  const calls: unknown[] = [];
  const database: WorkspacePolicyActivationDatabaseClientV1 = {
    deviceDataModePolicyRecord: {
      create: async ({ data }) => {
        calls.push(['version-create', data]);
        return data as never;
      },
      findFirst: async () => null,
    },
    workspaceDataModePolicyRecord: {
      findFirst: async () => null,
      create: async ({ data }) => {
        calls.push(['pointer-create', data]);
        return data as never;
      },
      updateMany: async (args) => {
        calls.push(['pointer-update', args]);
        return { count: 1 };
      },
    },
    workspacePolicyActivationRecord: {
      findFirst: async () => null,
      create: async ({ data }) => {
        calls.push(['activation-create', data]);
        return data as never;
      },
    },
    workspaceIdentity: {
      updateMany: async (args) => {
        calls.push(['iam-cas', args]);
        return { count: 1 };
      },
    },
    $transaction: (work) => work(database),
  };
  const service = new WorkspaceDataModePolicyActivationService(
    new PrismaWorkspacePolicyAtomicTransactionAdapter(database, activationEffects),
    activationAuthorization,
  );

  const result = await service.activate(context(), input());
  assert.equal(result.accepted, true);
  const iam = calls.find((entry) => Array.isArray(entry) && entry[0] === 'iam-cas') as
    | [string, { readonly where: unknown; readonly data: unknown }]
    | undefined;
  assert.deepEqual(iam?.[1], {
    where: {
      id: ids.workspace,
      organizationId: ids.organization,
      authorizationEpoch: 7,
      dataModePolicyId: null,
      currentDataModePolicyVersionId: null,
      dataModeProjection: null,
    },
    data: {
      dataModePolicyId: ids.policy,
      currentDataModePolicyVersionId: ids.version,
      dataModeProjection: 'LOCAL',
      authorizationEpoch: 8,
    },
  });
});

void test('[DSO-018] Prisma activation fails closed when transactional audit/outbox are absent', async () => {
  let transactionCalls = 0;
  const database = {
    $transaction: async () => {
      transactionCalls += 1;
      throw new Error('must not run');
    },
  } as unknown as WorkspacePolicyActivationDatabaseClientV1;
  const service = new WorkspaceDataModePolicyActivationService(
    new PrismaWorkspacePolicyAtomicTransactionAdapter(database),
    activationAuthorization,
  );

  assert.deepEqual(await service.activate(context('effects-unavailable'), input()), {
    accepted: false,
    code: 'PERSISTENCE_UNAVAILABLE',
  });
  assert.equal(transactionCalls, 0);
});

void test('[DSO-027] Prisma exact replay returns stored result without version or IAM mutation', async () => {
  let writes = 0;
  const storedPolicy = policy();
  const database: WorkspacePolicyActivationDatabaseClientV1 = {
    deviceDataModePolicyRecord: {
      create: async () => {
        writes += 1;
        throw new Error('unexpected');
      },
      findFirst: async () => null,
    },
    workspaceDataModePolicyRecord: {
      findFirst: async () => ({
        id: ids.policy,
        organizationId: ids.organization,
        workspaceId: ids.workspace,
        currentVersionId: ids.version,
        currentVersionHash: storedPolicy.canonicalHash,
        revision: 1,
      }),
      create: async () => {
        writes += 1;
        throw new Error('unexpected');
      },
      updateMany: async () => {
        writes += 1;
        return { count: 0 };
      },
    },
    workspacePolicyActivationRecord: {
      findFirst: async () => ({
        organizationId: ids.organization,
        workspaceId: ids.workspace,
        idempotencyKey: 'replay',
        requestHash: 'e'.repeat(64),
        policySnapshot: storedPolicy,
        aggregateRevision: 1,
        authorizationEpoch: 8,
      }),
      create: async () => {
        writes += 1;
        throw new Error('unexpected');
      },
    },
    workspaceIdentity: {
      updateMany: async () => {
        writes += 1;
        return { count: 0 };
      },
    },
    $transaction: (work) => work(database),
  };
  const service = new WorkspaceDataModePolicyActivationService(
    new PrismaWorkspacePolicyAtomicTransactionAdapter(database, activationEffects),
    activationAuthorization,
  );
  const first = await service.activate(context('replay'), input());
  assert.deepEqual(first, { accepted: false, code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(writes, 0);
});

void test('[DSO-027] Prisma exact replay of a committed activation does not increment epoch twice', async () => {
  let receipt: Readonly<Record<string, unknown>> | null = null;
  let pointer: Readonly<Record<string, unknown>> | null = null;
  let versionWrites = 0;
  let iamWrites = 0;
  const database: WorkspacePolicyActivationDatabaseClientV1 = {
    deviceDataModePolicyRecord: {
      create: async ({ data }) => {
        versionWrites += 1;
        return data;
      },
      findFirst: async () => null,
    },
    workspaceDataModePolicyRecord: {
      findFirst: async () => pointer,
      create: async ({ data }) => {
        pointer = data;
        return data;
      },
      updateMany: async () => ({ count: 0 }),
    },
    workspacePolicyActivationRecord: {
      findFirst: async () => receipt,
      create: async ({ data }) => {
        receipt = data;
        return data;
      },
    },
    workspaceIdentity: {
      updateMany: async () => {
        iamWrites += 1;
        return { count: 1 };
      },
    },
    $transaction: (work) => work(database),
  };
  const service = new WorkspaceDataModePolicyActivationService(
    new PrismaWorkspacePolicyAtomicTransactionAdapter(database, activationEffects),
    activationAuthorization,
  );

  const first = await service.activate(context('exact-replay'), input());
  const second = await service.activate(context('exact-replay'), input());

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (second.accepted) assert.equal(second.value.replayed, true);
  assert.equal(versionWrites, 1);
  assert.equal(iamWrites, 1);
});

function raceDatabase() {
  let receipt: Readonly<Record<string, unknown>> | null = null;
  let initialReceiptReads = 0;
  let releaseInitialReads: (() => void) | undefined;
  const initialReadsComplete = new Promise<void>((resolve) => {
    releaseInitialReads = resolve;
  });
  let releaseReceipt: (() => void) | undefined;
  const receiptCommitted = new Promise<void>((resolve) => {
    releaseReceipt = resolve;
  });
  let versionAttempts = 0;
  let iamWrites = 0;
  let auditWrites = 0;
  let outboxWrites = 0;
  const database: WorkspacePolicyActivationDatabaseClientV1 = {
    deviceDataModePolicyRecord: {
      create: async ({ data }) => {
        versionAttempts += 1;
        if (versionAttempts === 1) return data;
        await receiptCommitted;
        throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
      },
      findFirst: async () => null,
    },
    workspaceDataModePolicyRecord: {
      findFirst: async () => null,
      create: async ({ data }) => data,
      updateMany: async () => ({ count: 0 }),
    },
    workspacePolicyActivationRecord: {
      findFirst: async () => {
        if (receipt !== null) return receipt;
        initialReceiptReads += 1;
        if (initialReceiptReads === 2) releaseInitialReads?.();
        await initialReadsComplete;
        return null;
      },
      create: async ({ data }) => {
        receipt = data;
        releaseReceipt?.();
        return data;
      },
    },
    workspaceIdentity: {
      updateMany: async () => {
        iamWrites += 1;
        return { count: 1 };
      },
    },
    $transaction: (work) => work(database),
  };
  const effects = {
    forTransaction: () => ({
      audit: {
        appendActivation: async () => {
          auditWrites += 1;
        },
      },
      outbox: {
        appendPolicyChanged: async () => {
          outboxWrites += 1;
        },
      },
    }),
  };
  return {
    service: new WorkspaceDataModePolicyActivationService(
      new PrismaWorkspacePolicyAtomicTransactionAdapter(database, effects),
      activationAuthorization,
    ),
    counts: () => ({ iamWrites, auditWrites, outboxWrites }),
  };
}

void test('[DSO-027] concurrent identical activation race rereads exact receipt and replays once', async () => {
  const fixture = raceDatabase();
  const results = await Promise.all([
    fixture.service.activate(context('concurrent-identical'), input()),
    fixture.service.activate(context('concurrent-identical'), input()),
  ]);

  assert.ok(results.every((result) => result.accepted));
  assert.equal(results.filter((result) => result.accepted && result.value.replayed).length, 1);
  assert.deepEqual(fixture.counts(), { iamWrites: 1, auditWrites: 1, outboxWrites: 1 });
});

void test('[DSO-027] concurrent same-key mismatched request conflicts after scoped receipt reread', async () => {
  const fixture = raceDatabase();
  const alternate = {
    ...input(),
    policy: policy('00000000-0000-4000-8000-000000000499', 'f'.repeat(64)),
  };
  const results = await Promise.all([
    fixture.service.activate(context('concurrent-mismatch'), input()),
    fixture.service.activate(context('concurrent-mismatch'), alternate),
  ]);

  assert.equal(results.filter((result) => result.accepted).length, 1);
  assert.equal(
    results.filter((result) => !result.accepted && result.code === 'IDEMPOTENCY_CONFLICT').length,
    1,
  );
  assert.deepEqual(fixture.counts(), { iamWrites: 1, auditWrites: 1, outboxWrites: 1 });
});

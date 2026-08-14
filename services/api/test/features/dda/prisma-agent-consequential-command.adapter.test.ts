import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentToolRegistryV1 } from '../../../src/features/dda/agent/application/agent-tool-registry.js';
import type {
  AgentCommandAuditOutcomeV1,
  AgentConsequentialCommandInputV1,
} from '../../../src/features/dda/agent/application/agent-consequential-command.port.js';
import { canonicalAgentInputFingerprintV1 } from '../../../src/features/dda/agent/application/agent-consequential-command.port.js';
import {
  PrismaAgentConsequentialCommandAdapter,
  type DdaAgentConsequentialCommandDatabaseClientV1,
  type DdaAgentConsequentialCommandRowV1,
} from '../../../src/features/dda/agent/adapter/prisma-agent-consequential-command.adapter.js';
import type { IamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000101',
  workspace: '00000000-0000-4000-8000-000000000102',
  otherWorkspace: '00000000-0000-4000-8000-000000000103',
  actor: '00000000-0000-4000-8000-000000000104',
  otherActor: '00000000-0000-4000-8000-000000000109',
  correlation: '00000000-0000-4000-8000-000000000105',
  command: '00000000-0000-4000-8000-000000000106',
  evidence: '00000000-0000-4000-8000-000000000107',
});

const descriptor = new AgentToolRegistryV1().resolve('dashboard.applyConfirmed');
assert.equal(descriptor.accepted, true);
if (!descriptor.accepted) throw new Error('mutation descriptor missing');
const mutationDescriptor = descriptor.value;

const result = Object.freeze({
  accepted: true as const,
  value: Object.freeze({
    commandId: ids.command,
    revision: 2,
    evidenceRefs: Object.freeze([{ evidenceId: ids.evidence, kind: 'SOURCE' as const }]),
  }),
});

function context(
  workspaceId: string = ids.workspace,
  actorId: string = ids.actor,
): IamTenantContextV1 {
  return Object.freeze({
    tenantScope: Object.freeze({
      scopeType: 'workspace' as const,
      organizationId: ids.organization,
      workspaceId,
    }),
    actorId,
    correlationId: ids.correlation,
    idempotencyKey: 'turn-idempotency-key',
    authorizationEpoch: 1,
    mfaReenrollmentRequired: false,
  }) as unknown as IamTenantContextV1;
}

function commandInput(
  overrides: Partial<AgentConsequentialCommandInputV1> = {},
): AgentConsequentialCommandInputV1 {
  const input = Object.freeze({
    previewCommandId: ids.command,
    userConfirmation: true,
    expectedVersion: 2,
    revision: 1,
    idempotencyKey: 'command-idempotency-key',
  });
  return {
    context: context(),
    descriptor: mutationDescriptor,
    input,
    idempotencyKey: input.idempotencyKey,
    inputFingerprint: canonicalAgentInputFingerprintV1(input),
    correlationId: ids.correlation,
    audit: () => Promise.resolve(true),
    perform: () => Promise.resolve(result),
    ...overrides,
  };
}

function p2002(): Error & { readonly code: 'P2002' } {
  const error = new Error('unique constraint') as Error & { code: 'P2002' };
  error.code = 'P2002';
  return error;
}

class SharedFakeDdaDatabase {
  public readonly rows = new Map<string, DdaAgentConsequentialCommandRowV1>();
  private transactionTail: Promise<void> = Promise.resolve();
  private nextId = 200;

  public readonly client: DdaAgentConsequentialCommandDatabaseClientV1 = {
    agentConsequentialCommandRecord: {
      create: ({ data }) =>
        Promise.resolve().then(() => {
          const key = this.key(data);
          if (this.rows.has(key)) throw p2002();
          const now = data.createdAt;
          const row: DdaAgentConsequentialCommandRowV1 = {
            id: data.id,
            tenantScopeKey: data.tenantScopeKey,
            scopeType: data.scopeType,
            organizationId: data.organizationId,
            workspaceId: data.workspaceId,
            projectId: data.projectId,
            actorId: data.actorId,
            toolName: data.toolName,
            idempotencyKey: data.idempotencyKey,
            inputFingerprint: data.inputFingerprint,
            correlationId: data.correlationId,
            state: data.state,
            ownerToken: data.ownerToken,
            leaseExpiresAt: data.leaseExpiresAt,
            auditIntentAt: data.auditIntentAt,
            auditAttemptedAt: data.auditAttemptedAt,
            auditSucceededAt: data.auditSucceededAt,
            auditFailureCode: data.auditFailureCode,
            resultReferenceId: data.resultReferenceId,
            resultDocument: data.resultDocument,
            failureCode: data.failureCode,
            reconciliationRequiredAt: data.reconciliationRequiredAt,
            createdAt: now,
            updatedAt: now,
            completedAt: data.completedAt,
          };
          this.rows.set(key, row);
          return row;
        }),
      findFirst: ({ where }) =>
        Promise.resolve().then(() => {
          for (const row of this.rows.values()) {
            if (this.matches(row, where)) return row;
          }
          return null;
        }),
      updateMany: ({ where, data }) =>
        Promise.resolve().then(() => {
          let count = 0;
          for (const [key, row] of this.rows.entries()) {
            if (!this.matches(row, where)) continue;
            const next = {
              ...row,
              ...data,
              updatedAt: new Date(),
            } as DdaAgentConsequentialCommandRowV1;
            this.rows.set(key, next);
            count += 1;
          }
          return { count };
        }),
    },
    $transaction: async (callback) => this.transaction(callback),
  };

  public seed(row: DdaAgentConsequentialCommandRowV1): void {
    this.rows.set(this.key(row), row);
  }

  public freshId(): string {
    this.nextId += 1;
    return `00000000-0000-4000-8000-${String(this.nextId).padStart(12, '0')}`;
  }

  private async transaction<T>(
    callback: (client: DdaAgentConsequentialCommandDatabaseClientV1) => Promise<T>,
  ): Promise<T> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await callback(this.client);
    } finally {
      release();
    }
  }

  private key(value: {
    readonly tenantScopeKey: string;
    readonly actorId: string;
    readonly toolName: string;
    readonly idempotencyKey: string;
  }): string {
    return [value.tenantScopeKey, value.actorId, value.toolName, value.idempotencyKey].join('|');
  }

  private matches(row: DdaAgentConsequentialCommandRowV1, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, expected]) => {
      const actual = row[key as keyof DdaAgentConsequentialCommandRowV1];
      return actual instanceof Date && expected instanceof Date
        ? actual.getTime() === expected.getTime()
        : actual === expected;
    });
  }
}

function auditLog(
  log: AgentCommandAuditOutcomeV1[],
): (outcome: AgentCommandAuditOutcomeV1) => Promise<boolean> {
  return (outcome) => {
    log.push(outcome);
    return Promise.resolve(true);
  };
}

void test('[DDA-060] durable command replays across adapter restart, isolates tenants, and rejects fingerprint reuse', async () => {
  const storage = new SharedFakeDdaDatabase();
  let effects = 0;
  const audit: AgentCommandAuditOutcomeV1[] = [];
  const perform = () => {
    effects += 1;
    return Promise.resolve(result);
  };
  const first = new PrismaAgentConsequentialCommandAdapter(storage.client);
  const firstResult = await first.execute(commandInput({ perform, audit: auditLog(audit) }));
  assert.deepEqual(firstResult, result);
  assert.equal(effects, 1);
  assert.deepEqual(audit, ['ATTEMPTED', 'SUCCEEDED']);

  const restarted = new PrismaAgentConsequentialCommandAdapter(storage.client);
  const replay = await restarted.execute(
    commandInput({
      perform: () => {
        effects += 1;
        return Promise.resolve(result);
      },
    }),
  );
  assert.deepEqual(replay, result);
  assert.equal(effects, 1);

  const conflict = await restarted.execute(
    commandInput({
      input: { ...commandInput().input, revision: 99 },
      inputFingerprint: canonicalAgentInputFingerprintV1({
        ...commandInput().input,
        revision: 99,
      }),
      perform,
    }),
  );
  assert.deepEqual(conflict, { accepted: false, code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(effects, 1);

  const otherTenant = await restarted.execute(
    commandInput({
      context: context(ids.otherWorkspace),
      perform,
    }),
  );
  assert.deepEqual(otherTenant, result);
  assert.equal(effects, 2);

  const otherActor = await restarted.execute(
    commandInput({
      context: context(ids.workspace, ids.otherActor),
      perform,
    }),
  );
  assert.deepEqual(otherActor, result);
  assert.equal(effects, 3);
});

void test('[DDA-060] concurrent reserve admits one side effect and later replays the committed result', async () => {
  const storage = new SharedFakeDdaDatabase();
  let effects = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const perform = () => {
    effects += 1;
    return gate.then(() => result);
  };
  const left = new PrismaAgentConsequentialCommandAdapter(storage.client);
  const right = new PrismaAgentConsequentialCommandAdapter(storage.client);
  const leftPromise = left.execute(commandInput({ perform }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  const rightResult = await right.execute(commandInput({ perform }));
  assert.deepEqual(rightResult, { accepted: false, code: 'PROVIDER_FAILURE' });
  release();
  assert.deepEqual(await leftPromise, result);
  assert.equal(effects, 1);
  assert.deepEqual(await right.execute(commandInput({ perform })), result);
  assert.equal(effects, 1);
});

void test('[DDA-060] expired reservations become explicit reconciliation records and never rerun the mutation', async () => {
  const storage = new SharedFakeDdaDatabase();
  const now = new Date('2026-08-13T01:00:00.000Z');
  const expired = new Date(now.getTime() - 1);
  const seed = commandInput();
  storage.seed({
    id: storage.freshId(),
    tenantScopeKey: 'workspace:' + ids.organization + ':' + ids.workspace,
    scopeType: 'workspace',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    projectId: null,
    actorId: ids.actor,
    toolName: mutationDescriptor.name,
    idempotencyKey: seed.idempotencyKey,
    inputFingerprint: seed.inputFingerprint,
    correlationId: ids.correlation,
    state: 'RESERVED',
    ownerToken: '00000000-0000-4000-8000-000000000108',
    leaseExpiresAt: expired,
    auditIntentAt: expired,
    auditAttemptedAt: expired,
    auditSucceededAt: null,
    auditFailureCode: null,
    resultReferenceId: null,
    resultDocument: null,
    failureCode: null,
    reconciliationRequiredAt: null,
    createdAt: expired,
    updatedAt: expired,
    completedAt: null,
  });
  let effects = 0;
  const adapter = new PrismaAgentConsequentialCommandAdapter(storage.client, { now: () => now });
  const outcome = await adapter.execute(
    commandInput({
      perform: () => {
        effects += 1;
        return Promise.resolve(result);
      },
    }),
  );
  assert.deepEqual(outcome, { accepted: false, code: 'PROVIDER_FAILURE' });
  assert.equal(effects, 0);
  const row = [...storage.rows.values()][0];
  assert.equal(row?.state, 'RECONCILIATION_REQUIRED');
  assert.equal(row?.failureCode, 'LEASE_EXPIRED');
  assert.equal(row?.resultDocument, null);

  const reconciled = await adapter.reconcile({
    ...seed,
    outcome: { state: 'FAILED', failureCode: 'DOWNSTREAM_NOT_COMMITTED' },
  });
  assert.deepEqual(reconciled, { accepted: false, code: 'PROVIDER_FAILURE' });
  assert.equal([...storage.rows.values()][0]?.state, 'FAILED');
  assert.equal([...storage.rows.values()][0]?.failureCode, 'DOWNSTREAM_NOT_COMMITTED');
});

void test('[DDA-060] failed audit blocks the side effect and raw result-shaped data is never persisted', async () => {
  const storage = new SharedFakeDdaDatabase();
  const audit: AgentCommandAuditOutcomeV1[] = [];
  let effects = 0;
  const adapter = new PrismaAgentConsequentialCommandAdapter(storage.client);
  const deniedAudit = await adapter.execute(
    commandInput({
      audit: (outcome) => {
        audit.push(outcome);
        return Promise.resolve(false);
      },
      perform: () => {
        effects += 1;
        return Promise.resolve(result);
      },
    }),
  );
  assert.deepEqual(deniedAudit, { accepted: false, code: 'PROVIDER_FAILURE' });
  assert.deepEqual(audit, ['ATTEMPTED']);
  assert.equal(effects, 0);

  const rawStorage = new SharedFakeDdaDatabase();
  const rawAdapter = new PrismaAgentConsequentialCommandAdapter(rawStorage.client);
  const raw = await rawAdapter.execute(
    commandInput({
      audit: auditLog([]),
      perform: () =>
        Promise.resolve({
          accepted: true as const,
          value: {
            commandId: ids.command,
            revision: 2,
            evidenceRefs: [],
            rows: [{ amount: 12345, secret: 'sk-live-secret-shaped' }],
          },
        }),
    }),
  );
  assert.deepEqual(raw, { accepted: false, code: 'PROVIDER_FAILURE' });
  assert.equal([...rawStorage.rows.values()][0]?.resultDocument, null);
});

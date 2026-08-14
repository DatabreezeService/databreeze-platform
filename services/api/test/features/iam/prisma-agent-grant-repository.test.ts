import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaAgentGrantRepositoryAdapter,
  type AgentGrantDatabaseClientV1,
  type AgentGrantDatabaseRowV1,
} from '../../../src/features/iam/adapter/prisma-agent-grant-repository.adapter.js';
import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { AccessPresetService } from '../../../src/features/iam/application/access-preset.service.js';
import { AgentGrantService } from '../../../src/features/iam/application/agent-grant.service.js';
import type {
  WorkspaceAgentGrantRecordV1,
  WorkspaceDatasetRestrictionRecordV1,
} from '../../../src/features/iam/application/agent-grant-repository.port.js';
import {
  createIamTenantContextV1,
  type IamTenantContextV1,
} from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000801',
  otherOrganization: '00000000-0000-4000-8000-000000000802',
  workspace: '00000000-0000-4000-8000-000000000803',
  siblingWorkspace: '00000000-0000-4000-8000-000000000804',
  member: '00000000-0000-4000-8000-000000000805',
  otherMember: '00000000-0000-4000-8000-000000000806',
  grant: '00000000-0000-4000-8000-000000000807',
  datasetA: '00000000-0000-4000-8000-00000000080a',
  datasetB: '00000000-0000-4000-8000-00000000080b',
  datasetC: '00000000-0000-4000-8000-00000000080c',
  correlation: '00000000-0000-4000-8000-000000000808',
};

const updatedAt = '2026-08-13T00:00:00.000Z';
const laterUpdatedAt = '2026-08-13T00:01:00.000Z';

type Where = Readonly<Record<string, unknown>>;
type Data = Readonly<Record<string, unknown>>;

interface RestrictionRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly memberId: string;
  readonly memberScopeType: string;
  readonly deniedDatasetIds: unknown;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface FakeStateV1 {
  grants: Map<string, AgentGrantDatabaseRowV1>;
  restrictions: Map<string, RestrictionRowV1>;
  workspaceEpochs: Map<string, number>;
  workspaces: Set<string>;
}

interface FakeClientV1 extends AgentGrantDatabaseClientV1 {
  readonly workspaceDatasetRestriction: {
    findMany(input: { readonly where: Where }): Promise<readonly RestrictionRowV1[]>;
    create(input: { readonly data: Data }): Promise<RestrictionRowV1>;
    updateMany(input: {
      readonly where: Where;
      readonly data: Data;
    }): Promise<{ readonly count: number }>;
  };
}

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
}

function scopeKey(organizationId: string, workspaceId: string): string {
  return `${organizationId}:${workspaceId}`;
}

function memberKey(organizationId: string, workspaceId: string, memberId: string): string {
  return `${scopeKey(organizationId, workspaceId)}:${memberId}`;
}

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function cloneState(state: FakeStateV1): FakeStateV1 {
  return {
    grants: new Map(
      [...state.grants].map(([key, row]) => [key, { ...row, updatedAt: new Date(row.updatedAt) }]),
    ),
    restrictions: new Map(
      [...state.restrictions].map(([key, row]) => [
        key,
        {
          ...row,
          deniedDatasetIds: cloneJson(row.deniedDatasetIds),
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
        },
      ]),
    ),
    workspaceEpochs: new Map(state.workspaceEpochs),
    workspaces: new Set(state.workspaces),
  };
}

function emptyState(): FakeStateV1 {
  return {
    grants: new Map(),
    restrictions: new Map(),
    workspaceEpochs: new Map(),
    workspaces: new Set(),
  };
}

function p2002(): Error & { readonly code: 'P2002' } {
  return Object.assign(new Error('unique constraint'), { code: 'P2002' as const });
}

class DurableFakePrismaV1 {
  public state: FakeStateV1;
  public restrictionReadOverride: readonly RestrictionRowV1[] | undefined;
  public restrictionReadError: Error | undefined;
  public transactionCount = 0;

  public constructor(state: FakeStateV1 = emptyState()) {
    this.state = state;
  }

  public ensureWorkspace(organizationId: string, workspaceId: string, epoch = 1): void {
    const key = scopeKey(organizationId, workspaceId);
    this.state.workspaces.add(key);
    this.state.workspaceEpochs.set(key, epoch);
  }

  public client(): FakeClientV1 {
    return {
      workspaceAgentGrant: {
        findFirst: async ({ where }) => {
          await Promise.resolve();
          for (const row of this.state.grants.values()) {
            if (matches(row as unknown as Record<string, unknown>, where)) return row;
          }
          return null;
        },
        create: async ({ data }) => {
          await Promise.resolve();
          const row = data as unknown as AgentGrantDatabaseRowV1;
          const key = memberKey(row.organizationId, row.workspaceId, row.memberId);
          if (this.state.grants.has(key)) throw p2002();
          const created = { ...row, updatedAt: new Date(row.updatedAt) };
          this.state.grants.set(key, created);
          return created;
        },
        updateMany: async ({ where, data }) => {
          await Promise.resolve();
          let count = 0;
          for (const [key, row] of this.state.grants) {
            if (!matches(row as unknown as Record<string, unknown>, where)) continue;
            this.state.grants.set(key, {
              ...row,
              ...(data as Partial<AgentGrantDatabaseRowV1>),
              updatedAt: new Date((data['updatedAt'] as Date | undefined) ?? row.updatedAt),
            });
            count += 1;
          }
          return { count };
        },
      },
      workspaceDatasetRestriction: {
        findMany: async ({ where }) => {
          await Promise.resolve();
          if (this.restrictionReadError) throw this.restrictionReadError;
          if (this.restrictionReadOverride !== undefined) return this.restrictionReadOverride;
          return [...this.state.restrictions.values()].filter((row) =>
            matches(row as unknown as Record<string, unknown>, where),
          );
        },
        create: async ({ data }) => {
          await Promise.resolve();
          const row = data as unknown as RestrictionRowV1;
          const key = memberKey(row.organizationId, row.workspaceId, row.memberId);
          if (this.state.restrictions.has(key)) throw p2002();
          if ([...this.state.restrictions.values()].some((candidate) => candidate.id === row.id)) {
            throw p2002();
          }
          const created = {
            ...row,
            deniedDatasetIds: cloneJson(row.deniedDatasetIds),
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt),
          };
          this.state.restrictions.set(key, created);
          return created;
        },
        updateMany: async ({ where, data }) => {
          await Promise.resolve();
          let count = 0;
          for (const [key, row] of this.state.restrictions) {
            if (!matches(row as unknown as Record<string, unknown>, where)) continue;
            this.state.restrictions.set(key, {
              ...row,
              ...(data as Partial<RestrictionRowV1>),
              deniedDatasetIds: cloneJson(data['deniedDatasetIds'] ?? row.deniedDatasetIds),
              updatedAt: new Date((data['updatedAt'] as Date | undefined) ?? row.updatedAt),
            });
            count += 1;
          }
          return { count };
        },
      },
      workspaceIdentity: {
        findFirst: async ({ where }) => {
          await Promise.resolve();
          const organizationId = where['organizationId'];
          const workspaceId = where['id'];
          if (
            typeof organizationId !== 'string' ||
            typeof workspaceId !== 'string' ||
            !this.state.workspaces.has(scopeKey(organizationId, workspaceId))
          ) {
            return null;
          }
          return {
            authorizationEpoch:
              this.state.workspaceEpochs.get(scopeKey(organizationId, workspaceId)) ?? 1,
          };
        },
        updateMany: async ({ where, data }) => {
          await Promise.resolve();
          const organizationId = where['organizationId'];
          const workspaceId = where['id'];
          const key =
            typeof organizationId === 'string' && typeof workspaceId === 'string'
              ? scopeKey(organizationId, workspaceId)
              : undefined;
          if (key === undefined || !this.state.workspaces.has(key)) return { count: 0 };
          const current = this.state.workspaceEpochs.get(key) ?? 1;
          if (where['authorizationEpoch'] !== current) return { count: 0 };
          const next = data['authorizationEpoch'];
          if (typeof next !== 'number') return { count: 0 };
          this.state.workspaceEpochs.set(key, next);
          return { count: 1 };
        },
      },
      $transaction: async (work) => {
        this.transactionCount += 1;
        const transaction = new DurableFakePrismaV1(cloneState(this.state));
        transaction.restrictionReadOverride = this.restrictionReadOverride;
        transaction.restrictionReadError = this.restrictionReadError;
        const value = await work(transaction.client());
        this.state = transaction.state;
        return value;
      },
    };
  }
}

function rejectedMessage(outcome: PromiseSettledResult<unknown>): string {
  if (outcome.status !== 'rejected') throw new Error('expected rejected promise');
  return outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
}

function context(
  organizationId = ids.organization,
  workspaceId = ids.workspace,
  idempotencyKey = 'agent-grant-repository-test',
): IamTenantContextV1 {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(organizationId),
      workspaceId: stable(workspaceId),
    },
    actorId: stable(ids.member),
    correlationId: stable(ids.correlation),
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid test context');
  return result.value;
}

function restriction(
  memberId = ids.member,
  deniedDatasetIds: readonly string[] = [ids.datasetA],
  revision = 1,
  timestamp = updatedAt,
): WorkspaceDatasetRestrictionRecordV1 {
  return {
    memberId: stable(memberId),
    deniedDatasetIds: deniedDatasetIds.map(stable),
    revision,
    updatedAt: timestamp as WorkspaceDatasetRestrictionRecordV1['updatedAt'],
  };
}

function grant(): WorkspaceAgentGrantRecordV1 {
  return {
    id: stable(ids.grant),
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
    },
    memberId: stable(ids.member),
    level: 'ANALYZE',
    revision: 1,
    updatedAt: updatedAt as WorkspaceAgentGrantRecordV1['updatedAt'],
  };
}

function validRow(overrides: Partial<RestrictionRowV1> = {}): RestrictionRowV1 {
  return {
    id: ids.grant,
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    memberId: ids.member,
    memberScopeType: 'WORKSPACE',
    deniedDatasetIds: [ids.datasetA],
    revision: 1,
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
    ...overrides,
  };
}

void test('[IAM-024, DSM-018] restrictions persist across adapter instances and exact tenant scopes', async () => {
  const database = new DurableFakePrismaV1();
  database.ensureWorkspace(ids.organization, ids.workspace);
  database.ensureWorkspace(ids.organization, ids.siblingWorkspace);
  database.ensureWorkspace(ids.otherOrganization, ids.workspace);
  const first = new PrismaAgentGrantRepositoryAdapter(database.client());

  await first.saveDatasetRestrictions(
    context(ids.organization, ids.workspace, 'persist-write'),
    restriction(ids.member, [ids.datasetB, ids.datasetA, ids.datasetA]),
    undefined,
  );

  const second = new PrismaAgentGrantRepositoryAdapter(database.client());
  const persisted = await second.findDatasetRestrictions(
    context(ids.organization, ids.workspace, 'persist-read'),
    stable(ids.member),
  );
  assert.ok(persisted);
  assert.deepEqual(persisted.deniedDatasetIds, [stable(ids.datasetA), stable(ids.datasetB)]);
  assert.equal(persisted.revision, 1);

  assert.equal(
    await second.findDatasetRestrictions(
      context(ids.otherOrganization, ids.workspace, 'other-tenant-read'),
      stable(ids.member),
    ),
    undefined,
  );
  assert.equal(
    await second.findDatasetRestrictions(
      context(ids.organization, ids.siblingWorkspace, 'sibling-workspace-read'),
      stable(ids.member),
    ),
    undefined,
  );
});

void test('[IAM-024] restriction CAS lets one concurrent creator and one concurrent update win', async () => {
  const database = new DurableFakePrismaV1();
  database.ensureWorkspace(ids.organization, ids.workspace);
  const first = new PrismaAgentGrantRepositoryAdapter(database.client());
  const second = new PrismaAgentGrantRepositoryAdapter(database.client());
  const writeContext = context(ids.organization, ids.workspace, 'create-race');

  const createOutcomes = await Promise.allSettled([
    first.saveDatasetRestrictions(writeContext, restriction(ids.member, [ids.datasetA]), 1),
    second.saveDatasetRestrictions(writeContext, restriction(ids.member, [ids.datasetB]), 1),
  ]);
  assert.equal(createOutcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(createOutcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
  const createRejection = createOutcomes.find((outcome) => outcome.status === 'rejected');
  assert.ok(createRejection);
  assert.match(rejectedMessage(createRejection), /IAM_REVISION_CONFLICT/u);

  const updateOutcomes = await Promise.allSettled([
    first.saveDatasetRestrictions(
      writeContext,
      restriction(ids.member, [ids.datasetA], 2, laterUpdatedAt),
      1,
    ),
    second.saveDatasetRestrictions(
      writeContext,
      restriction(ids.member, [ids.datasetB], 2, laterUpdatedAt),
      1,
    ),
  ]);
  assert.equal(updateOutcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(updateOutcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
  const updateRejection = updateOutcomes.find((outcome) => outcome.status === 'rejected');
  assert.ok(updateRejection);
  assert.match(rejectedMessage(updateRejection), /IAM_REVISION_CONFLICT/u);
});

void test('[IAM-024] Prisma transaction commits grant, restriction, and authorization epoch together', async () => {
  const database = new DurableFakePrismaV1();
  database.ensureWorkspace(ids.organization, ids.workspace);
  const adapter = new PrismaAgentGrantRepositoryAdapter(database.client());

  const nextEpoch = await adapter.withTransaction(
    context(ids.organization, ids.workspace, 'transaction-commit'),
    async (transaction) => {
      await transaction.saveGrant(
        context(ids.organization, ids.workspace, 'transaction-grant'),
        grant(),
        undefined,
      );
      await transaction.saveDatasetRestrictions(
        context(ids.organization, ids.workspace, 'transaction-restriction'),
        restriction(ids.member, [ids.datasetC]),
        undefined,
      );
      return transaction.bumpAuthorizationEpoch(
        context(ids.organization, ids.workspace, 'transaction-epoch'),
      );
    },
  );

  assert.equal(nextEpoch, 2);
  assert.equal(database.transactionCount, 1);
  assert.equal(database.state.grants.size, 1);
  assert.equal(database.state.restrictions.size, 1);
  assert.equal(database.state.workspaceEpochs.get(scopeKey(ids.organization, ids.workspace)), 2);
  const reloaded = new PrismaAgentGrantRepositoryAdapter(database.client());
  const persisted = await reloaded.findDatasetRestrictions(
    context(ids.organization, ids.workspace, 'transaction-reload'),
    stable(ids.member),
  );
  assert.deepEqual(persisted?.deniedDatasetIds, [stable(ids.datasetC)]);
});

void test('[IAM-024] Prisma transaction rollback preserves previous durable grant, restriction, and epoch', async () => {
  const database = new DurableFakePrismaV1();
  database.ensureWorkspace(ids.organization, ids.workspace, 7);
  const adapter = new PrismaAgentGrantRepositoryAdapter(database.client());
  await adapter.saveDatasetRestrictions(
    context(ids.organization, ids.workspace, 'rollback-seed'),
    restriction(ids.member, [ids.datasetA]),
    undefined,
  );

  await assert.rejects(
    adapter.withTransaction(
      context(ids.organization, ids.workspace, 'transaction-rollback'),
      async (transaction) => {
        await transaction.saveGrant(
          context(ids.organization, ids.workspace, 'rollback-grant'),
          grant(),
          undefined,
        );
        await transaction.saveDatasetRestrictions(
          context(ids.organization, ids.workspace, 'rollback-restriction'),
          restriction(ids.member, [ids.datasetB], 2, laterUpdatedAt),
          1,
        );
        await transaction.bumpAuthorizationEpoch(
          context(ids.organization, ids.workspace, 'rollback-epoch'),
        );
        throw new Error('ROLLBACK_SENTINEL');
      },
    ),
    /ROLLBACK_SENTINEL/u,
  );

  assert.equal(database.state.grants.size, 0);
  assert.equal(database.state.workspaceEpochs.get(scopeKey(ids.organization, ids.workspace)), 7);
  const persisted = await adapter.findDatasetRestrictions(
    context(ids.organization, ids.workspace, 'rollback-reload'),
    stable(ids.member),
  );
  assert.deepEqual(persisted?.deniedDatasetIds, [stable(ids.datasetA)]);
  assert.equal(persisted?.revision, 1);
});

void test('[IAM-024, DSM-018] corrupt or unavailable restriction reads fail closed instead of becoming missing', async () => {
  const database = new DurableFakePrismaV1();
  database.ensureWorkspace(ids.organization, ids.workspace);
  const adapter = new PrismaAgentGrantRepositoryAdapter(database.client());
  const readContext = context(ids.organization, ids.workspace, 'corrupt-read');

  for (const [label, row] of [
    ['wrong scope', validRow({ organizationId: ids.otherOrganization })],
    ['invalid row UUID', validRow({ memberId: 'not-a-uuid' })],
    ['invalid denied UUID', validRow({ deniedDatasetIds: ['not-a-uuid'] })],
    ['duplicate denied UUID', validRow({ deniedDatasetIds: [ids.datasetA, ids.datasetA] })],
    ['invalid revision', validRow({ revision: 0 })],
    ['invalid timestamp', validRow({ updatedAt: new Date('invalid') })],
  ] as const) {
    database.restrictionReadOverride = [row];
    await assert.rejects(
      adapter.findDatasetRestrictions(readContext, stable(ids.member)),
      /IAM_PERSISTED_DATASET_RESTRICTION_INVALID/u,
      label,
    );
  }

  database.restrictionReadOverride = [validRow(), validRow({ id: ids.otherMember })];
  await assert.rejects(
    adapter.findDatasetRestrictions(readContext, stable(ids.member)),
    /IAM_PERSISTED_DATASET_RESTRICTION_INVALID/u,
    'duplicate scope rows',
  );

  database.restrictionReadOverride = undefined;
  database.restrictionReadError = new Error('DB_DOWN');
  await assert.rejects(
    adapter.findDatasetRestrictions(readContext, stable(ids.member)),
    /DB_DOWN/u,
  );
});

void test('[IAM-024, DSM-018] authorization reports persistence failure instead of allowing a corrupt restriction read', async () => {
  const database = new DurableFakePrismaV1();
  database.ensureWorkspace(ids.organization, ids.workspace);
  database.restrictionReadOverride = [validRow({ deniedDatasetIds: ['not-a-uuid'] })];
  const memberships = new InMemoryIamRepositoryAdapter();
  memberships.seed([
    {
      id: stable(ids.member),
      principalId: stable(ids.member),
      scope: {
        scopeType: 'workspace',
        organizationId: stable(ids.organization),
        workspaceId: stable(ids.workspace),
      },
      roleId: 'analyst',
      status: 'ACTIVE',
      revision: 1,
    },
  ]);
  const grants = new AgentGrantService(
    new PrismaAgentGrantRepositoryAdapter(database.client()),
    memberships,
    new AccessPresetService(),
  );

  const decision = await grants.authorize({
    context: context(ids.organization, ids.workspace, 'corrupt-authorization'),
    memberId: ids.member,
    requestedLevel: 'ANALYZE',
    resourceIds: [ids.datasetA],
  });
  assert.deepEqual(decision, { accepted: false, code: 'UNAVAILABLE' });
});

void test('[IAM-024] restriction writes enforce a bound and stable canonical ordering', async () => {
  const database = new DurableFakePrismaV1();
  database.ensureWorkspace(ids.organization, ids.workspace);
  const adapter = new PrismaAgentGrantRepositoryAdapter(database.client());
  const tooMany = Array.from(
    { length: 201 },
    (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
  );

  await assert.rejects(
    adapter.saveDatasetRestrictions(
      context(ids.organization, ids.workspace, 'max-bound'),
      restriction(ids.member, tooMany),
      undefined,
    ),
    /IAM_INVALID_DATASET_RESTRICTIONS/u,
  );

  await adapter.saveDatasetRestrictions(
    context(ids.organization, ids.workspace, 'canonical-write'),
    restriction(ids.member, [ids.datasetC, ids.datasetA, ids.datasetC, ids.datasetB]),
    undefined,
  );
  const persisted = await adapter.findDatasetRestrictions(
    context(ids.organization, ids.workspace, 'canonical-read'),
    stable(ids.member),
  );
  assert.deepEqual(persisted?.deniedDatasetIds, [
    stable(ids.datasetA),
    stable(ids.datasetB),
    stable(ids.datasetC),
  ]);
});

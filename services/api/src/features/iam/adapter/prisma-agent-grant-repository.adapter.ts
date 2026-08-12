import {
  isAgentGrantLevelV1,
  type AgentGrantLevelV1,
} from '@databreeze/domain/permissions/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  tenantScopeContainsV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  AgentGrantRepositoryPortV1,
  AgentGrantTransactionPortV1,
  WorkspaceAgentGrantRecordV1,
  WorkspaceDatasetRestrictionRecordV1,
} from '../application/agent-grant-repository.port.js';
import type { IamTenantContextV1 } from '../application/tenant-context.js';

export interface AgentGrantDatabaseRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly memberId: string;
  readonly level: string;
  readonly revision: number;
  readonly updatedAt: Date;
}

interface AgentGrantDelegateV1 {
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<AgentGrantDatabaseRowV1 | null>;
  create(input: {
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<AgentGrantDatabaseRowV1>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
}

interface WorkspaceIdentityDelegateV1 {
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly select?: Readonly<Record<string, boolean>>;
  }): Promise<{ readonly authorizationEpoch: number } | null>;
}

export interface AgentGrantDatabaseClientV1 {
  readonly workspaceAgentGrant: AgentGrantDelegateV1;
  readonly workspaceIdentity: WorkspaceIdentityDelegateV1;
  $transaction<TValue>(
    work: (transaction: AgentGrantDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function timestamp(value: Date): StrictUtcTimestampV1 {
  const parsed = parseStrictUtcTimestampV1(value.toISOString());
  if (!parsed.accepted) throw new Error('IAM_INVALID_TIMESTAMP');
  return parsed.value;
}

function grantFromRow(row: AgentGrantDatabaseRowV1): WorkspaceAgentGrantRecordV1 {
  const id = parseStableIdentifierV1(row.id);
  const memberId = parseStableIdentifierV1(row.memberId);
  const organizationId = parseStableIdentifierV1(row.organizationId);
  const workspaceId = parseStableIdentifierV1(row.workspaceId);
  if (!id.accepted || !memberId.accepted || !organizationId.accepted || !workspaceId.accepted) {
    throw new Error('IAM_INVALID_IDENTIFIER');
  }
  if (!isAgentGrantLevelV1(row.level)) throw new Error('IAM_INVALID_LEVEL');
  return Object.freeze({
    id: id.value,
    tenantScope: Object.freeze({
      scopeType: 'workspace' as const,
      organizationId: organizationId.value,
      workspaceId: workspaceId.value,
    }),
    memberId: memberId.value,
    level: row.level as AgentGrantLevelV1,
    revision: row.revision,
    updatedAt: timestamp(row.updatedAt),
  });
}

function workspaceFilter(context: IamTenantContextV1): Readonly<Record<string, unknown>> | undefined {
  if (context.tenantScope.scopeType !== 'workspace' || !context.tenantScope.workspaceId) {
    return undefined;
  }
  return {
    organizationId: context.tenantScope.organizationId,
    workspaceId: context.tenantScope.workspaceId,
  };
}

/** Prisma adapter for IAM-024 workspace agent grants. Dataset restrictions stay in-memory until a later migration. */
export class PrismaAgentGrantRepositoryAdapter implements AgentGrantRepositoryPortV1 {
  private readonly restrictionStore = new Map<string, WorkspaceDatasetRestrictionRecordV1>();

  public constructor(private readonly db: AgentGrantDatabaseClientV1) {}

  private restrictionKey(context: IamTenantContextV1, memberId: StableIdentifierV1): string | undefined {
    const filter = workspaceFilter(context);
    if (!filter) return undefined;
    return `${filter['organizationId'] as string}:${filter['workspaceId'] as string}:${memberId}`;
  }

  public async findGrant(
    context: IamTenantContextV1,
    memberId: StableIdentifierV1,
  ): Promise<WorkspaceAgentGrantRecordV1 | undefined> {
    const filter = workspaceFilter(context);
    if (!filter) return undefined;
    const row = await this.db.workspaceAgentGrant.findFirst({
      where: { ...filter, memberId },
    });
    if (!row) return undefined;
    const grant = grantFromRow(row);
    return tenantScopeContainsV1(context.tenantScope, grant.tenantScope) ? grant : undefined;
  }

  public async saveGrant(
    context: IamTenantContextV1,
    grant: WorkspaceAgentGrantRecordV1,
    expectedRevision: number | undefined,
  ): Promise<void> {
    const filter = workspaceFilter(context);
    if (!filter) throw new Error('IAM_SCOPE_DENIED');
    if (!tenantScopeContainsV1(context.tenantScope, grant.tenantScope)) {
      throw new Error('IAM_SCOPE_NARROWING_REQUIRED');
    }
    const existing = await this.db.workspaceAgentGrant.findFirst({
      where: { ...filter, memberId: grant.memberId },
    });
    if (existing) {
      if (expectedRevision !== existing.revision) throw new Error('IAM_REVISION_CONFLICT');
      const updated = await this.db.workspaceAgentGrant.updateMany({
        where: { ...filter, memberId: grant.memberId, revision: existing.revision },
        data: {
          level: grant.level,
          revision: grant.revision,
          updatedAt: new Date(grant.updatedAt),
        },
      });
      if (updated.count !== 1) throw new Error('IAM_REVISION_CONFLICT');
      return;
    }
    if (expectedRevision !== undefined && expectedRevision !== 1) {
      throw new Error('IAM_REVISION_CONFLICT');
    }
    await this.db.workspaceAgentGrant.create({
      data: {
        id: grant.id,
        organizationId: grant.tenantScope.organizationId,
        workspaceId: grant.tenantScope.workspaceId,
        memberId: grant.memberId,
        level: grant.level,
        revision: grant.revision,
        createdAt: new Date(grant.updatedAt),
        updatedAt: new Date(grant.updatedAt),
      },
    });
  }

  public async findDatasetRestrictions(
    context: IamTenantContextV1,
    memberId: StableIdentifierV1,
  ): Promise<WorkspaceDatasetRestrictionRecordV1 | undefined> {
    const key = this.restrictionKey(context, memberId);
    if (!key) return undefined;
    const record = this.restrictionStore.get(key);
    return record
      ? Object.freeze({
          ...record,
          deniedDatasetIds: Object.freeze([...record.deniedDatasetIds]),
        })
      : undefined;
  }

  public async saveDatasetRestrictions(
    context: IamTenantContextV1,
    record: WorkspaceDatasetRestrictionRecordV1,
    expectedRevision: number | undefined,
  ): Promise<void> {
    const key = this.restrictionKey(context, record.memberId);
    if (!key) throw new Error('IAM_SCOPE_DENIED');
    const existing = this.restrictionStore.get(key);
    if (existing) {
      if (expectedRevision !== existing.revision) throw new Error('IAM_REVISION_CONFLICT');
    } else if (expectedRevision !== undefined && expectedRevision !== 1) {
      throw new Error('IAM_REVISION_CONFLICT');
    }
    this.restrictionStore.set(
      key,
      Object.freeze({
        ...record,
        deniedDatasetIds: Object.freeze([...record.deniedDatasetIds]),
      }),
    );
  }

  public async bumpAuthorizationEpoch(context: IamTenantContextV1): Promise<number> {
    const filter = workspaceFilter(context);
    if (!filter) throw new Error('IAM_SCOPE_DENIED');
    const current = await this.db.workspaceIdentity.findFirst({
      where: filter,
      select: { authorizationEpoch: true },
    });
    if (!current) throw new Error('IAM_WORKSPACE_NOT_FOUND');
    const next = current.authorizationEpoch + 1;
    const updated = await this.db.workspaceIdentity.updateMany({
      where: { ...filter, authorizationEpoch: current.authorizationEpoch },
      data: { authorizationEpoch: next },
    });
    if (updated.count !== 1) throw new Error('IAM_REVISION_CONFLICT');
    return next;
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: AgentGrantTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.db.$transaction(async (tx) => {
      const scoped = new PrismaAgentGrantRepositoryAdapter(tx);
      scoped.restrictionStore.clear();
      for (const [key, value] of this.restrictionStore) scoped.restrictionStore.set(key, value);
      const result = await work(scoped);
      this.restrictionStore.clear();
      for (const [key, value] of scoped.restrictionStore) this.restrictionStore.set(key, value);
      return result;
    });
  }
}

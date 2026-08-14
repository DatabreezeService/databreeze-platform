import { randomUUID } from 'node:crypto';

import { isAgentGrantLevelV1 } from '@databreeze/domain/permissions/v1';
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

export interface WorkspaceDatasetRestrictionDatabaseRowV1 {
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

interface WorkspaceDatasetRestrictionDelegateV1 {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly WorkspaceDatasetRestrictionDatabaseRowV1[]>;
  create(input: {
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<WorkspaceDatasetRestrictionDatabaseRowV1>;
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
  readonly workspaceDatasetRestriction: WorkspaceDatasetRestrictionDelegateV1;
  readonly workspaceIdentity: WorkspaceIdentityDelegateV1;
  $transaction<TValue>(
    work: (transaction: AgentGrantDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

const MAX_DENIED_DATASET_IDS = 200;

function timestamp(value: unknown): StrictUtcTimestampV1 {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('IAM_INVALID_TIMESTAMP');
  }
  const parsed = parseStrictUtcTimestampV1(value.toISOString());
  if (!parsed.accepted) throw new Error('IAM_INVALID_TIMESTAMP');
  return parsed.value;
}

function positiveRevision(value: unknown, errorCode: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(errorCode);
  }
  return value;
}

function restrictionIdentifier(value: unknown, errorCode: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error(errorCode);
  return parsed.value;
}

function canonicalDatasetIds(
  value: unknown,
  options: { readonly persisted: boolean },
): readonly StableIdentifierV1[] {
  if (!Array.isArray(value) || value.length > MAX_DENIED_DATASET_IDS) {
    throw new Error(
      options.persisted
        ? 'IAM_PERSISTED_DATASET_RESTRICTION_INVALID'
        : 'IAM_INVALID_DATASET_RESTRICTIONS',
    );
  }

  const normalized: StableIdentifierV1[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const parsed = parseStableIdentifierV1(candidate);
    if (!parsed.accepted || (options.persisted && candidate !== parsed.value)) {
      throw new Error(
        options.persisted
          ? 'IAM_PERSISTED_DATASET_RESTRICTION_INVALID'
          : 'IAM_INVALID_DATASET_RESTRICTIONS',
      );
    }
    if (seen.has(parsed.value)) {
      if (options.persisted) throw new Error('IAM_PERSISTED_DATASET_RESTRICTION_INVALID');
      continue;
    }
    seen.add(parsed.value);
    normalized.push(parsed.value);
  }

  const sorted = [...normalized].sort();
  if (
    options.persisted &&
    normalized.some((valueAtIndex, index) => valueAtIndex !== sorted[index])
  ) {
    throw new Error('IAM_PERSISTED_DATASET_RESTRICTION_INVALID');
  }
  return Object.freeze(sorted);
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
    level: row.level,
    revision: row.revision,
    updatedAt: timestamp(row.updatedAt),
  });
}

function workspaceFilter(
  context: IamTenantContextV1,
): Readonly<{ organizationId: string; workspaceId: string }> | undefined {
  if (context.tenantScope.scopeType !== 'workspace' || !context.tenantScope.workspaceId) {
    return undefined;
  }
  return {
    organizationId: context.tenantScope.organizationId,
    workspaceId: context.tenantScope.workspaceId,
  };
}

function workspaceIdentityFilter(
  context: IamTenantContextV1,
): Readonly<{ organizationId: string; id: string }> | undefined {
  const filter = workspaceFilter(context);
  return filter === undefined
    ? undefined
    : { organizationId: filter.organizationId, id: filter.workspaceId };
}

function uniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}

/** Prisma adapter for IAM-024 workspace agent grants and durable dataset restrictions. */
export class PrismaAgentGrantRepositoryAdapter implements AgentGrantRepositoryPortV1 {
  public constructor(private readonly db: AgentGrantDatabaseClientV1) {}

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
    const filter = workspaceFilter(context);
    if (!filter) throw new Error('IAM_SCOPE_DENIED');
    if (context.workspaceAuthorizationEpoch !== undefined) {
      const currentEpoch = await this.resolveWorkspaceAuthorizationEpoch(context);
      if (currentEpoch !== context.workspaceAuthorizationEpoch) {
        throw new Error('IAM_STALE_AUTHORIZATION');
      }
    }
    const requestedMemberId = restrictionIdentifier(memberId, 'IAM_INVALID_IDENTIFIER');
    const delegate = this.db.workspaceDatasetRestriction;
    if (delegate === undefined || typeof delegate.findMany !== 'function') {
      throw new Error('IAM_DATASET_RESTRICTION_PERSISTENCE_UNAVAILABLE');
    }
    const rows = await delegate.findMany({
      where: { ...filter, memberId: requestedMemberId, memberScopeType: 'WORKSPACE' },
    });
    if (!Array.isArray(rows)) throw new Error('IAM_PERSISTED_DATASET_RESTRICTION_INVALID');
    const records = rows.map((row) => this.restrictionFromRow(row, filter, requestedMemberId));
    if (records.length === 0) return undefined;
    if (records.length !== 1) throw new Error('IAM_PERSISTED_DATASET_RESTRICTION_INVALID');
    return records[0];
  }

  public async saveDatasetRestrictions(
    context: IamTenantContextV1,
    record: WorkspaceDatasetRestrictionRecordV1,
    expectedRevision: number | undefined,
  ): Promise<void> {
    const filter = workspaceFilter(context);
    if (!filter) throw new Error('IAM_SCOPE_DENIED');
    const memberId = restrictionIdentifier(record.memberId, 'IAM_INVALID_IDENTIFIER');
    const deniedDatasetIds = canonicalDatasetIds(record.deniedDatasetIds, { persisted: false });
    const revision = positiveRevision(record.revision, 'IAM_INVALID_REVISION');
    const parsedUpdatedAt = parseStrictUtcTimestampV1(record.updatedAt);
    if (!parsedUpdatedAt.accepted) throw new Error('IAM_INVALID_TIMESTAMP');
    const updatedAt = new Date(parsedUpdatedAt.value);
    const delegate = this.db.workspaceDatasetRestriction;
    if (delegate === undefined || typeof delegate.findMany !== 'function') {
      throw new Error('IAM_DATASET_RESTRICTION_PERSISTENCE_UNAVAILABLE');
    }
    const existing = await this.findDatasetRestrictions(context, memberId);
    if (existing) {
      if (expectedRevision !== existing.revision || revision !== existing.revision + 1) {
        throw new Error('IAM_REVISION_CONFLICT');
      }
      if (typeof delegate.updateMany !== 'function') {
        throw new Error('IAM_DATASET_RESTRICTION_PERSISTENCE_UNAVAILABLE');
      }
      const updated = await delegate.updateMany({
        where: { ...filter, memberId, memberScopeType: 'WORKSPACE', revision: existing.revision },
        data: {
          deniedDatasetIds: [...deniedDatasetIds],
          revision,
          updatedAt,
        },
      });
      if (updated.count !== 1) throw new Error('IAM_REVISION_CONFLICT');
      return;
    }
    if (expectedRevision !== undefined && expectedRevision !== 1) {
      throw new Error('IAM_REVISION_CONFLICT');
    }
    if (revision !== 1) throw new Error('IAM_REVISION_CONFLICT');
    if (typeof delegate.create !== 'function') {
      throw new Error('IAM_DATASET_RESTRICTION_PERSISTENCE_UNAVAILABLE');
    }
    try {
      await delegate.create({
        data: {
          id: randomUUID(),
          organizationId: filter.organizationId,
          workspaceId: filter.workspaceId,
          memberId,
          memberScopeType: 'WORKSPACE',
          deniedDatasetIds: [...deniedDatasetIds],
          revision,
          createdAt: updatedAt,
          updatedAt,
        },
      });
    } catch (error) {
      if (uniqueConstraint(error)) throw new Error('IAM_REVISION_CONFLICT');
      throw error;
    }
  }

  private restrictionFromRow(
    row: unknown,
    filter: Readonly<{ organizationId: string; workspaceId: string }>,
    requestedMemberId: StableIdentifierV1,
  ): WorkspaceDatasetRestrictionRecordV1 {
    if (typeof row !== 'object' || row === null) {
      throw new Error('IAM_PERSISTED_DATASET_RESTRICTION_INVALID');
    }
    const candidate = row as Record<string, unknown>;
    restrictionIdentifier(candidate['id'], 'IAM_PERSISTED_DATASET_RESTRICTION_INVALID');
    const organizationId = restrictionIdentifier(
      candidate['organizationId'],
      'IAM_PERSISTED_DATASET_RESTRICTION_INVALID',
    );
    const workspaceId = restrictionIdentifier(
      candidate['workspaceId'],
      'IAM_PERSISTED_DATASET_RESTRICTION_INVALID',
    );
    const memberId = restrictionIdentifier(
      candidate['memberId'],
      'IAM_PERSISTED_DATASET_RESTRICTION_INVALID',
    );
    if (candidate['memberScopeType'] !== 'WORKSPACE') {
      throw new Error('IAM_PERSISTED_DATASET_RESTRICTION_INVALID');
    }
    if (
      organizationId !== filter.organizationId ||
      workspaceId !== filter.workspaceId ||
      memberId !== requestedMemberId
    ) {
      throw new Error('IAM_PERSISTED_DATASET_RESTRICTION_INVALID');
    }
    const revision = positiveRevision(
      candidate['revision'],
      'IAM_PERSISTED_DATASET_RESTRICTION_INVALID',
    );
    try {
      timestamp(candidate['createdAt']);
    } catch {
      throw new Error('IAM_PERSISTED_DATASET_RESTRICTION_INVALID');
    }
    let updatedAt: StrictUtcTimestampV1;
    try {
      updatedAt = timestamp(candidate['updatedAt']);
    } catch {
      throw new Error('IAM_PERSISTED_DATASET_RESTRICTION_INVALID');
    }
    const deniedDatasetIds = canonicalDatasetIds(candidate['deniedDatasetIds'], {
      persisted: true,
    });
    return Object.freeze({
      memberId,
      deniedDatasetIds,
      revision,
      updatedAt,
    });
  }

  /** WorkspaceIdentity.authorizationEpoch is the effective IAM policy epoch; it is not UserIdentity.securityEpoch. */
  public async bumpAuthorizationEpoch(context: IamTenantContextV1): Promise<number> {
    const filter = workspaceIdentityFilter(context);
    if (!filter) throw new Error('IAM_SCOPE_DENIED');
    const current = await this.db.workspaceIdentity.findFirst({
      where: filter,
      select: { authorizationEpoch: true },
    });
    if (!current) throw new Error('IAM_WORKSPACE_NOT_FOUND');
    if (
      !Number.isSafeInteger(current.authorizationEpoch) ||
      current.authorizationEpoch < 1 ||
      current.authorizationEpoch === Number.MAX_SAFE_INTEGER
    ) {
      throw new Error('IAM_INVALID_AUTHORIZATION_EPOCH');
    }
    const next = current.authorizationEpoch + 1;
    const updated = await this.db.workspaceIdentity.updateMany({
      where: { ...filter, authorizationEpoch: current.authorizationEpoch },
      data: { authorizationEpoch: next },
    });
    if (updated.count !== 1) throw new Error('IAM_REVISION_CONFLICT');
    return next;
  }

  public async resolveWorkspaceAuthorizationEpoch(context: IamTenantContextV1): Promise<number> {
    const filter = workspaceIdentityFilter(context);
    if (!filter) throw new Error('IAM_SCOPE_DENIED');
    const current = await this.db.workspaceIdentity.findFirst({
      where: filter,
      select: { authorizationEpoch: true },
    });
    if (
      !current ||
      !Number.isSafeInteger(current.authorizationEpoch) ||
      current.authorizationEpoch < 1
    ) {
      throw new Error('IAM_INVALID_AUTHORIZATION_EPOCH');
    }
    return current.authorizationEpoch;
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: AgentGrantTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.db.$transaction(async (tx) => {
      const scoped = new PrismaAgentGrantRepositoryAdapter(tx);
      return work(scoped);
    });
  }
}

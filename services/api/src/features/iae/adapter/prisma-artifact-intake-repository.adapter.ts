import {
  createInboxItemV1,
  transitionInboxItemV1,
  updateInboxMetadataV1,
  type InboxItemStateV1,
  type InboxItemV1,
} from '@databreeze/domain/artifact-intake/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ArtifactIntakeRepositoryPortV1,
  ArtifactIntakeTransactionPortV1,
} from '../application/artifact-intake-repository.port.js';

/** Minimal row shape keeps the feature independent of generated Prisma output paths. */
export interface ArtifactIntakeDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly idempotencyKey: string;
  readonly artifactVersionId: string;
  readonly state: string;
  readonly assigneeId?: string | null;
  readonly labels?: unknown;
  readonly priority?: string;
  readonly dueAt?: Date | null;
  readonly createdAt: Date;
  readonly revision: number;
}

export interface ArtifactIntakeDatabaseCreateDataV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly idempotencyKey: string;
  readonly artifactVersionId: string;
  readonly state: InboxItemStateV1;
  readonly assigneeId?: string | null;
  readonly labels?: unknown;
  readonly priority?: string;
  readonly dueAt?: Date | null;
  readonly createdAt: Date;
  readonly revision: number;
}

export interface ArtifactIntakeDatabaseDelegateV1 {
  create(input: {
    readonly data: ArtifactIntakeDatabaseCreateDataV1;
  }): Promise<ArtifactIntakeDatabaseRowV1>;
  findUnique(input: {
    readonly where: { readonly id: string };
  }): Promise<ArtifactIntakeDatabaseRowV1 | null>;
  findFirst(input: {
    readonly where: Readonly<Record<string, string | null>>;
  }): Promise<ArtifactIntakeDatabaseRowV1 | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, string | null>>;
    readonly orderBy: { readonly createdAt: 'desc' };
  }): Promise<readonly ArtifactIntakeDatabaseRowV1[]>;
  update(input: {
    readonly where: { readonly id: string };
    readonly data: {
      readonly state: InboxItemStateV1;
      readonly revision: number;
      readonly assigneeId: string | null;
      readonly labels: unknown;
      readonly priority: string;
      readonly dueAt: Date | null;
    };
  }): Promise<ArtifactIntakeDatabaseRowV1>;
}

export interface ArtifactIntakeDatabaseClientV1 {
  readonly inboxItem: ArtifactIntakeDatabaseDelegateV1;
  $transaction<TValue>(
    work: (transaction: ArtifactIntakeDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function databaseScope(scope: TenantScopeV1): {
  readonly scopeType: TenantScopeV1['scopeType'];
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
} {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  };
}

function domainScope(row: ArtifactIntakeDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function rowToDomain(row: ArtifactIntakeDatabaseRowV1): InboxItemV1 {
  const created = createInboxItemV1({
    inboxItemId: row.id,
    tenantScope: domainScope(row),
    idempotencyKey: row.idempotencyKey,
    artifactVersionId: row.artifactVersionId,
    createdAt: row.createdAt.toISOString(),
  });
  if (
    !created.accepted ||
    ![
      'NEW',
      'ROUTED',
      'NEEDS_REVIEW',
      'PROCESSING',
      'RESOLVED',
      'QUARANTINED',
      'ARCHIVED',
    ].includes(row.state)
  ) {
    throw new Error('IAE_PERSISTED_INBOX_INVALID');
  }
  if (!Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error('IAE_PERSISTED_REVISION_INVALID');
  }
  const metadata = updateInboxMetadataV1(created.value, {
    ...(row.assigneeId === undefined ? {} : { assigneeId: row.assigneeId }),
    ...(row.labels === undefined ? {} : { labels: row.labels }),
    ...(row.priority === undefined ? {} : { priority: row.priority }),
    ...(row.dueAt === undefined || row.dueAt === null ? {} : { dueAt: row.dueAt.toISOString() }),
    expectedRevision: 1,
  });
  if (!metadata.accepted) throw new Error('IAE_PERSISTED_METADATA_INVALID');
  return Object.freeze({
    ...metadata.value,
    state: row.state as InboxItemStateV1,
    revision: row.revision,
  });
}

function domainToCreate(item: InboxItemV1): ArtifactIntakeDatabaseCreateDataV1 {
  const scope = databaseScope(item.tenantScope);
  return {
    ...scope,
    id: item.inboxItemId,
    idempotencyKey: item.idempotencyKey,
    artifactVersionId: item.artifactVersionId,
    state: item.state,
    assigneeId: item.assigneeId ?? null,
    labels: item.labels ?? [],
    priority: item.priority ?? 'NORMAL',
    dueAt: item.dueAt === undefined ? null : new Date(item.dueAt),
    createdAt: new Date(item.createdAt),
    revision: item.revision,
  };
}

/**
 * Prisma applies defaults for metadata columns while older callers may omit
 * those optional fields. Compare the persisted representation semantically so
 * a replay of the same immutable item remains idempotent and state transitions
 * do not fail merely because the database materialized defaults.
 */
function comparable(item: InboxItemV1): string {
  return JSON.stringify({
    schemaVersion: item.schemaVersion,
    inboxItemId: item.inboxItemId,
    tenantScope: item.tenantScope,
    idempotencyKey: item.idempotencyKey,
    artifactVersionId: item.artifactVersionId,
    state: item.state,
    createdAt: item.createdAt,
    revision: item.revision,
    assigneeId: item.assigneeId ?? null,
    labels: item.labels ?? [],
    priority: item.priority ?? 'NORMAL',
    dueAt: item.dueAt ?? null,
  });
}

function visible(context: TenantScopeV1, row: ArtifactIntakeDatabaseRowV1): boolean {
  const candidate = domainScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function exactScopeWhere(scope: TenantScopeV1): Readonly<Record<string, string | null>> {
  const database = databaseScope(scope);
  return {
    organizationId: database.organizationId,
    workspaceId: database.workspaceId,
    projectId: database.projectId,
  };
}

class PrismaArtifactIntakeTransactionAdapter implements ArtifactIntakeTransactionPortV1 {
  public constructor(private readonly client: ArtifactIntakeDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, item: InboxItemV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, item.tenantScope)) {
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    }
    const existing = await this.client.inboxItem.findUnique({ where: { id: item.inboxItemId } });
    if (existing !== null) {
      const current = rowToDomain(existing);
      if (comparable(current) === comparable(item)) return;
      if (context.expectedRevision !== current.revision) {
        throw new Error('IAE_REVISION_CONFLICT');
      }
      if (
        current.artifactVersionId !== item.artifactVersionId ||
        current.idempotencyKey !== item.idempotencyKey ||
        JSON.stringify(current.tenantScope) !== JSON.stringify(item.tenantScope) ||
        item.revision !== current.revision + 1
      ) {
        throw new Error('IAE_IMMUTABLE_INBOX_ITEM');
      }
      if (current.state === item.state) {
        const metadata = updateInboxMetadataV1(current, {
          ...(Object.hasOwn(item, 'assigneeId') || Object.hasOwn(current, 'assigneeId')
            ? { assigneeId: Object.hasOwn(item, 'assigneeId') ? item.assigneeId : null }
            : {}),
          ...(Object.hasOwn(item, 'labels') ? { labels: item.labels } : {}),
          ...(Object.hasOwn(item, 'priority') ? { priority: item.priority } : {}),
          ...(Object.hasOwn(item, 'dueAt') || Object.hasOwn(current, 'dueAt')
            ? { dueAt: Object.hasOwn(item, 'dueAt') ? item.dueAt : null }
            : {}),
          expectedRevision: current.revision,
        });
        if (!metadata.accepted || comparable(metadata.value) !== comparable(item))
          throw new Error('IAE_INVALID_INBOX_METADATA');
      } else {
        const transition = transitionInboxItemV1(current, item.state);
        if (!transition.accepted || comparable(transition.value) !== comparable(item)) {
          throw new Error('IAE_INVALID_INBOX_TRANSITION');
        }
      }
      await this.client.inboxItem.update({
        where: { id: item.inboxItemId },
        data: {
          state: item.state,
          revision: item.revision,
          assigneeId: item.assigneeId ?? null,
          labels: item.labels ?? [],
          priority: item.priority ?? 'NORMAL',
          dueAt: item.dueAt === undefined ? null : new Date(item.dueAt),
        },
      });
      return;
    }
    await this.client.inboxItem.create({ data: domainToCreate(item) });
  }

  public async findByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<InboxItemV1 | undefined> {
    const row = await this.client.inboxItem.findFirst({
      where: { ...exactScopeWhere(context.tenantScope), idempotencyKey },
    });
    return row === null
      ? undefined
      : visible(context.tenantScope, row)
        ? rowToDomain(row)
        : undefined;
  }

  public async find(
    context: IamTenantContextV1,
    inboxItemId: InboxItemV1['inboxItemId'],
  ): Promise<InboxItemV1 | undefined> {
    const row = await this.client.inboxItem.findUnique({ where: { id: inboxItemId } });
    return row === null
      ? undefined
      : visible(context.tenantScope, row)
        ? rowToDomain(row)
        : undefined;
  }

  public async list(context: IamTenantContextV1): Promise<readonly InboxItemV1[]> {
    const rows = await this.client.inboxItem.findMany({
      where: { organizationId: context.tenantScope.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.filter((row) => visible(context.tenantScope, row)).map(rowToDomain);
  }
}

export class PrismaArtifactIntakeRepositoryAdapter implements ArtifactIntakeRepositoryPortV1 {
  public constructor(private readonly client: ArtifactIntakeDatabaseClientV1) {}

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactIntakeTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaArtifactIntakeTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, item: InboxItemV1): Promise<void> {
    return new PrismaArtifactIntakeTransactionAdapter(this.client).save(context, item);
  }

  public findByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<InboxItemV1 | undefined> {
    return new PrismaArtifactIntakeTransactionAdapter(this.client).findByIdempotency(
      context,
      idempotencyKey,
    );
  }

  public find(
    context: IamTenantContextV1,
    inboxItemId: InboxItemV1['inboxItemId'],
  ): Promise<InboxItemV1 | undefined> {
    return new PrismaArtifactIntakeTransactionAdapter(this.client).find(context, inboxItemId);
  }

  public list(context: IamTenantContextV1): Promise<readonly InboxItemV1[]> {
    return new PrismaArtifactIntakeTransactionAdapter(this.client).list(context);
  }
}

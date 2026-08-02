import {
  createArtifactDeletionRequestV1,
  type ArtifactDeletionRequestV1,
} from '@databreeze/domain/artifact-retention/v1';
import {
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ArtifactRetentionRepositoryPortV1,
  ArtifactRetentionTransactionPortV1,
} from '../application/artifact-retention-repository.port.js';

export interface ArtifactRetentionDatabaseRowV1 {
  readonly id: string;
  readonly artifactVersionId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly requestedBy: string;
  readonly requestedAt: Date;
  readonly state: string;
  readonly blockers: unknown;
  readonly authorizedAt: Date | null;
  readonly revision: number;
}

export interface ArtifactRetentionDatabaseCreateDataV1
  extends Omit<ArtifactRetentionDatabaseRowV1, 'authorizedAt'> {
  readonly authorizedAt: Date | null;
}

export interface ArtifactRetentionDatabaseClientV1 {
  readonly artifactDeletionRequestRecord: {
    create(input: {
      readonly data: ArtifactRetentionDatabaseCreateDataV1;
    }): Promise<ArtifactRetentionDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<ArtifactRetentionDatabaseRowV1 | null>;
    update(input: {
      readonly where: { readonly id: string };
      readonly data: {
        readonly state: string;
        readonly blockers: unknown;
        readonly authorizedAt: Date | null;
        readonly revision: number;
      };
    }): Promise<ArtifactRetentionDatabaseRowV1>;
  };
  $transaction<TValue>(
    work: (transaction: ArtifactRetentionDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function rowScope(row: ArtifactRetentionDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function rowToDomain(row: ArtifactRetentionDatabaseRowV1): ArtifactDeletionRequestV1 {
  const created = createArtifactDeletionRequestV1({
    requestId: row.id,
    artifactVersionId: row.artifactVersionId,
    tenantScope: rowScope(row),
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt.toISOString(),
  });
  if (!created.accepted) throw new Error('IAE_PERSISTED_DELETION_REQUEST_INVALID');
  if (!['REQUESTED', 'BLOCKED', 'AUTHORIZED', 'COMPLETED', 'CANCELLED'].includes(row.state))
    throw new Error('IAE_PERSISTED_DELETION_STATE_INVALID');
  if (!Array.isArray(row.blockers) || !row.blockers.every((value) => typeof value === 'string'))
    throw new Error('IAE_PERSISTED_DELETION_BLOCKERS_INVALID');
  if (!Number.isSafeInteger(row.revision) || row.revision < 1)
    throw new Error('IAE_PERSISTED_REVISION_INVALID');
  const authorizedAt = row.authorizedAt?.toISOString();
  const parsedAuthorizedAt = authorizedAt ? parseStrictUtcTimestampV1(authorizedAt) : undefined;
  if (parsedAuthorizedAt && !parsedAuthorizedAt.accepted)
    throw new Error('IAE_PERSISTED_TIMESTAMP_INVALID');
  return Object.freeze({
    ...created.value,
    state: row.state as ArtifactDeletionRequestV1['state'],
    blockers: Object.freeze([...row.blockers]),
    ...(parsedAuthorizedAt?.accepted ? { authorizedAt: parsedAuthorizedAt.value } : {}),
    revision: row.revision,
  });
}

function domainToCreate(request: ArtifactDeletionRequestV1): ArtifactRetentionDatabaseCreateDataV1 {
  return {
    ...databaseScope(request.tenantScope),
    id: request.requestId,
    artifactVersionId: request.artifactVersionId,
    requestedBy: request.requestedBy,
    requestedAt: new Date(request.requestedAt),
    state: request.state,
    blockers: request.blockers,
    authorizedAt: request.authorizedAt ? new Date(request.authorizedAt) : null,
    revision: request.revision,
  };
}

function visible(context: TenantScopeV1, row: ArtifactRetentionDatabaseRowV1): boolean {
  const candidate = rowScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaArtifactRetentionTransactionAdapter implements ArtifactRetentionTransactionPortV1 {
  public constructor(private readonly client: ArtifactRetentionDatabaseClientV1) {}

  public async save(
    context: IamTenantContextV1,
    request: ArtifactDeletionRequestV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, request.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.artifactDeletionRequestRecord.findUnique({
      where: { id: request.requestId },
    });
    if (existing === null) {
      await this.client.artifactDeletionRequestRecord.create({ data: domainToCreate(request) });
      return;
    }
    const current = rowToDomain(existing);
    if (JSON.stringify(current) === JSON.stringify(request)) return;
    if (request.revision !== current.revision + 1) throw new Error('IAE_REVISION_CONFLICT');
    if (
      current.artifactVersionId !== request.artifactVersionId ||
      current.requestedBy !== request.requestedBy ||
      current.requestedAt !== request.requestedAt
    )
      throw new Error('IAE_IMMUTABLE_DELETION_REQUEST');
    await this.client.artifactDeletionRequestRecord.update({
      where: { id: request.requestId },
      data: {
        state: request.state,
        blockers: request.blockers,
        authorizedAt: request.authorizedAt ? new Date(request.authorizedAt) : null,
        revision: request.revision,
      },
    });
  }

  public async find(
    context: IamTenantContextV1,
    requestId: ArtifactDeletionRequestV1['requestId'],
  ): Promise<ArtifactDeletionRequestV1 | undefined> {
    const row = await this.client.artifactDeletionRequestRecord.findUnique({
      where: { id: requestId },
    });
    return row === null
      ? undefined
      : visible(context.tenantScope, row)
        ? rowToDomain(row)
        : undefined;
  }
}

export class PrismaArtifactRetentionRepositoryAdapter implements ArtifactRetentionRepositoryPortV1 {
  public constructor(private readonly client: ArtifactRetentionDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactRetentionTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaArtifactRetentionTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, request: ArtifactDeletionRequestV1): Promise<void> {
    return new PrismaArtifactRetentionTransactionAdapter(this.client).save(context, request);
  }

  public find(
    context: IamTenantContextV1,
    requestId: ArtifactDeletionRequestV1['requestId'],
  ): Promise<ArtifactDeletionRequestV1 | undefined> {
    return new PrismaArtifactRetentionTransactionAdapter(this.client).find(context, requestId);
  }
}

import {
  createProtectedDocumentUnlockRequestV1,
  type ProtectedDocumentUnlockRequestV1,
} from '@databreeze/domain/protected-document/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ProtectedDocumentUnlockRepositoryPortV1,
  ProtectedDocumentUnlockTransactionPortV1,
} from '../application/protected-document-unlock-repository.port.js';

export interface ProtectedDocumentUnlockDatabaseRowV1 {
  readonly id: string;
  readonly artifactVersionId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly deviceId: string | null;
  readonly mode: string;
  readonly state: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly lastFailureCode: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revision: number;
}

export interface ProtectedDocumentUnlockDatabaseCreateDataV1 {
  readonly id: string;
  readonly artifactVersionId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly deviceId: string | null;
  readonly mode: string;
  readonly state: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly lastFailureCode: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revision: number;
}

export interface ProtectedDocumentUnlockDatabaseClientV1 {
  readonly protectedDocumentUnlockRequestRecord: {
    create(input: {
      readonly data: ProtectedDocumentUnlockDatabaseCreateDataV1;
    }): Promise<ProtectedDocumentUnlockDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<ProtectedDocumentUnlockDatabaseRowV1 | null>;
    update(input: {
      readonly where: { readonly id: string };
      readonly data: {
        readonly state: string;
        readonly attemptCount: number;
        readonly lastFailureCode: string | null;
        readonly revision: number;
      };
    }): Promise<ProtectedDocumentUnlockDatabaseRowV1>;
  };
  $transaction<TValue>(
    work: (transaction: ProtectedDocumentUnlockDatabaseClientV1) => Promise<TValue>,
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

function rowScope(row: ProtectedDocumentUnlockDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function rowToDomain(row: ProtectedDocumentUnlockDatabaseRowV1): ProtectedDocumentUnlockRequestV1 {
  const created = createProtectedDocumentUnlockRequestV1({
    requestId: row.id,
    artifactVersionId: row.artifactVersionId,
    tenantScope: rowScope(row),
    ...(row.deviceId === null ? {} : { deviceId: row.deviceId }),
    mode: row.mode,
    maxAttempts: row.maxAttempts,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  });
  if (!created.accepted) throw new Error('IAE_PERSISTED_UNLOCK_INVALID');
  if (
    !['REQUESTED', 'UNLOCKED', 'FAILED', 'EXPIRED'].includes(row.state) ||
    !Number.isSafeInteger(row.attemptCount) ||
    row.attemptCount < 0 ||
    row.attemptCount > row.maxAttempts ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  )
    throw new Error('IAE_PERSISTED_UNLOCK_STATE_INVALID');
  const normalized = {
    ...created.value,
    state: row.state as ProtectedDocumentUnlockRequestV1['state'],
    attemptCount: row.attemptCount,
    revision: row.revision,
  };
  return row.lastFailureCode === null
    ? Object.freeze(normalized)
    : Object.freeze({
        ...normalized,
        lastFailureCode: row.lastFailureCode as NonNullable<
          ProtectedDocumentUnlockRequestV1['lastFailureCode']
        >,
      });
}

function domainToCreate(
  request: ProtectedDocumentUnlockRequestV1,
): ProtectedDocumentUnlockDatabaseCreateDataV1 {
  return {
    ...databaseScope(request.tenantScope),
    id: request.requestId,
    artifactVersionId: request.artifactVersionId,
    deviceId: request.deviceId ?? null,
    mode: request.mode,
    state: request.state,
    attemptCount: request.attemptCount,
    maxAttempts: request.maxAttempts,
    lastFailureCode: request.lastFailureCode ?? null,
    createdAt: new Date(request.createdAt),
    expiresAt: new Date(request.expiresAt),
    revision: request.revision,
  };
}

function visible(context: TenantScopeV1, row: ProtectedDocumentUnlockDatabaseRowV1): boolean {
  const candidate = rowScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaProtectedDocumentUnlockTransactionAdapter
  implements ProtectedDocumentUnlockTransactionPortV1
{
  public constructor(private readonly client: ProtectedDocumentUnlockDatabaseClientV1) {}

  public async save(
    context: IamTenantContextV1,
    request: ProtectedDocumentUnlockRequestV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, request.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.protectedDocumentUnlockRequestRecord.findUnique({
      where: { id: request.requestId },
    });
    if (existing === null) {
      await this.client.protectedDocumentUnlockRequestRecord.create({
        data: domainToCreate(request),
      });
      return;
    }
    const current = rowToDomain(existing);
    if (JSON.stringify(current) === JSON.stringify(request)) return;
    if (request.revision !== current.revision + 1) throw new Error('IAE_UNLOCK_REVISION_CONFLICT');
    if (
      current.artifactVersionId !== request.artifactVersionId ||
      current.requestId !== request.requestId ||
      current.mode !== request.mode ||
      current.deviceId !== request.deviceId ||
      JSON.stringify(current.tenantScope) !== JSON.stringify(request.tenantScope)
    )
      throw new Error('IAE_UNLOCK_IMMUTABLE_IDENTITY');
    await this.client.protectedDocumentUnlockRequestRecord.update({
      where: { id: request.requestId },
      data: {
        state: request.state,
        attemptCount: request.attemptCount,
        lastFailureCode: request.lastFailureCode ?? null,
        revision: request.revision,
      },
    });
  }

  public async find(
    context: IamTenantContextV1,
    requestId: ProtectedDocumentUnlockRequestV1['requestId'],
  ): Promise<ProtectedDocumentUnlockRequestV1 | undefined> {
    const row = await this.client.protectedDocumentUnlockRequestRecord.findUnique({
      where: { id: requestId },
    });
    return row !== null && visible(context.tenantScope, row) ? rowToDomain(row) : undefined;
  }
}

export class PrismaProtectedDocumentUnlockRepositoryAdapter
  implements ProtectedDocumentUnlockRepositoryPortV1
{
  public constructor(private readonly client: ProtectedDocumentUnlockDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ProtectedDocumentUnlockTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaProtectedDocumentUnlockTransactionAdapter(transaction)),
    );
  }

  public save(
    context: IamTenantContextV1,
    request: ProtectedDocumentUnlockRequestV1,
  ): Promise<void> {
    return new PrismaProtectedDocumentUnlockTransactionAdapter(this.client).save(context, request);
  }

  public find(
    context: IamTenantContextV1,
    requestId: ProtectedDocumentUnlockRequestV1['requestId'],
  ): Promise<ProtectedDocumentUnlockRequestV1 | undefined> {
    return new PrismaProtectedDocumentUnlockTransactionAdapter(this.client).find(
      context,
      requestId,
    );
  }
}

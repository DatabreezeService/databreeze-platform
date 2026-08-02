import {
  abortArtifactUploadSessionV1,
  completeArtifactUploadSessionV1,
  createArtifactUploadSessionV1,
  expireArtifactUploadSessionV1,
  recordArtifactUploadPartV1,
  type ArtifactUploadSessionV1,
} from '@databreeze/domain/artifact-upload/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ArtifactUploadRepositoryPortV1,
  ArtifactUploadTransactionPortV1,
} from '../application/artifact-upload-repository.port.js';

export interface ArtifactUploadDatabaseRowV1 {
  readonly id: string;
  readonly artifactId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly expectedSha256: string;
  readonly expectedByteSize: bigint | number;
  readonly mediaType: string;
  readonly partSize: number;
  readonly totalParts: number;
  readonly parts: unknown;
  readonly state: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revision: number;
}

export interface ArtifactUploadDatabaseCreateDataV1 {
  readonly id: string;
  readonly artifactId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly expectedSha256: string;
  readonly expectedByteSize: bigint;
  readonly mediaType: string;
  readonly partSize: number;
  readonly totalParts: number;
  readonly parts: unknown;
  readonly state: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revision: number;
}

export interface ArtifactUploadDatabaseClientV1 {
  readonly artifactUploadSessionRecord: {
    create(input: {
      readonly data: ArtifactUploadDatabaseCreateDataV1;
    }): Promise<ArtifactUploadDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<ArtifactUploadDatabaseRowV1 | null>;
    update(input: {
      readonly where: { readonly id: string };
      readonly data: { readonly parts: unknown; readonly state: string; readonly revision: number };
    }): Promise<ArtifactUploadDatabaseRowV1>;
  };
  $transaction<TValue>(
    work: (transaction: ArtifactUploadDatabaseClientV1) => Promise<TValue>,
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

function rowScope(row: ArtifactUploadDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function rowToDomain(row: ArtifactUploadDatabaseRowV1): ArtifactUploadSessionV1 {
  const expectedByteSize =
    typeof row.expectedByteSize === 'bigint' ? Number(row.expectedByteSize) : row.expectedByteSize;
  if (!Number.isSafeInteger(expectedByteSize) || expectedByteSize < 0)
    throw new Error('IAE_PERSISTED_UPLOAD_SIZE_INVALID');
  const created = createArtifactUploadSessionV1({
    sessionId: row.id,
    artifactId: row.artifactId,
    tenantScope: rowScope(row),
    expectedSha256: row.expectedSha256,
    expectedByteSize,
    mediaType: row.mediaType,
    partSize: row.partSize,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  });
  if (!created.accepted) throw new Error('IAE_PERSISTED_UPLOAD_INVALID');
  if (!Array.isArray(row.parts)) throw new Error('IAE_PERSISTED_UPLOAD_PARTS_INVALID');
  let session = created.value;
  for (const part of row.parts) {
    if (typeof part !== 'object' || part === null || Array.isArray(part))
      throw new Error('IAE_PERSISTED_UPLOAD_PART_INVALID');
    const persistedPart = part as {
      readonly partNumber: unknown;
      readonly contentSha256: unknown;
      readonly byteSize: unknown;
      readonly uploadedAt: unknown;
    };
    const next = recordArtifactUploadPartV1(session, {
      ...persistedPart,
      expectedRevision: session.revision,
    });
    if (!next.accepted) throw new Error('IAE_PERSISTED_UPLOAD_PART_INVALID');
    session = next.value;
  }
  if (row.state === 'COMPLETED') {
    const completed = completeArtifactUploadSessionV1(session, {
      assembledSha256: row.expectedSha256,
      expectedRevision: session.revision,
    });
    if (!completed.accepted) throw new Error('IAE_PERSISTED_UPLOAD_STATE_INVALID');
    session = completed.value;
  } else if (row.state === 'ABORTED') {
    const aborted = abortArtifactUploadSessionV1(session, session.revision);
    if (!aborted.accepted) throw new Error('IAE_PERSISTED_UPLOAD_STATE_INVALID');
    session = aborted.value;
  } else if (row.state === 'EXPIRED') {
    const expired = expireArtifactUploadSessionV1(session, row.expiresAt.toISOString());
    if (!expired.accepted) throw new Error('IAE_PERSISTED_UPLOAD_STATE_INVALID');
    session = expired.value;
  } else if (row.state !== 'OPEN') {
    throw new Error('IAE_PERSISTED_UPLOAD_STATE_INVALID');
  }
  if (session.revision !== row.revision) throw new Error('IAE_PERSISTED_UPLOAD_REVISION_INVALID');
  return session;
}

function domainToCreate(session: ArtifactUploadSessionV1): ArtifactUploadDatabaseCreateDataV1 {
  return {
    ...databaseScope(session.tenantScope),
    id: session.sessionId,
    artifactId: session.artifactId,
    expectedSha256: session.expectedSha256,
    expectedByteSize: BigInt(session.expectedByteSize),
    mediaType: session.mediaType,
    partSize: session.partSize,
    totalParts: session.totalParts,
    parts: session.parts,
    state: session.state,
    createdAt: new Date(session.createdAt),
    expiresAt: new Date(session.expiresAt),
    revision: session.revision,
  };
}

function visible(context: TenantScopeV1, row: ArtifactUploadDatabaseRowV1): boolean {
  const candidate = rowScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaArtifactUploadTransactionAdapter implements ArtifactUploadTransactionPortV1 {
  public constructor(private readonly client: ArtifactUploadDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, session: ArtifactUploadSessionV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, session.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.artifactUploadSessionRecord.findUnique({
      where: { id: session.sessionId },
    });
    if (existing === null) {
      await this.client.artifactUploadSessionRecord.create({ data: domainToCreate(session) });
      return;
    }
    const current = rowToDomain(existing);
    if (JSON.stringify(current) === JSON.stringify(session)) return;
    if (session.revision !== current.revision + 1) throw new Error('IAE_UPLOAD_REVISION_CONFLICT');
    if (
      current.artifactId !== session.artifactId ||
      current.expectedSha256 !== session.expectedSha256 ||
      current.expectedByteSize !== session.expectedByteSize ||
      JSON.stringify(current.tenantScope) !== JSON.stringify(session.tenantScope)
    )
      throw new Error('IAE_UPLOAD_IMMUTABLE_IDENTITY');
    await this.client.artifactUploadSessionRecord.update({
      where: { id: session.sessionId },
      data: { parts: session.parts, state: session.state, revision: session.revision },
    });
  }

  public async find(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
  ): Promise<ArtifactUploadSessionV1 | undefined> {
    const row = await this.client.artifactUploadSessionRecord.findUnique({
      where: { id: sessionId },
    });
    return row !== null && visible(context.tenantScope, row) ? rowToDomain(row) : undefined;
  }
}

export class PrismaArtifactUploadRepositoryAdapter implements ArtifactUploadRepositoryPortV1 {
  public constructor(private readonly client: ArtifactUploadDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactUploadTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaArtifactUploadTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, session: ArtifactUploadSessionV1): Promise<void> {
    return new PrismaArtifactUploadTransactionAdapter(this.client).save(context, session);
  }

  public find(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
  ): Promise<ArtifactUploadSessionV1 | undefined> {
    return new PrismaArtifactUploadTransactionAdapter(this.client).find(context, sessionId);
  }
}

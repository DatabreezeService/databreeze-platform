import {
  createBusinessPartyVersionV1,
  type BusinessPartyResolutionV1,
  type BusinessPartyVersionV1,
} from '@databreeze/domain/reference-entity/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ReferenceEntityRepositoryPortV1,
  ReferenceEntityTransactionPortV1,
} from '../application/reference-entity-repository.port.js';

export interface ReferenceEntityDatabaseRowV1 {
  readonly id: string;
  readonly entityId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly entityType: string;
  readonly displayName: string;
  readonly roles: unknown;
  readonly aliases: unknown;
  readonly externalIdentifiers: unknown;
  readonly status: string;
  readonly visibility: string;
  readonly canonicalHash: string;
  readonly createdAt: Date;
}

export interface ReferenceResolutionDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly actorId: string;
  readonly reason: string;
  readonly evidenceId: string;
  readonly resolvedAt: Date;
}

interface ReferenceEntityCreateDataV1 extends Omit<ReferenceEntityDatabaseRowV1, 'createdAt'> {
  readonly createdAt: Date;
}
interface ReferenceResolutionCreateDataV1
  extends Omit<ReferenceResolutionDatabaseRowV1, 'resolvedAt'> {
  readonly resolvedAt: Date;
}

export interface ReferenceEntityDatabaseClientV1 {
  readonly referenceEntityVersionRecord: {
    create(input: {
      readonly data: ReferenceEntityCreateDataV1;
    }): Promise<ReferenceEntityDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<ReferenceEntityDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, string>>;
      readonly orderBy: { readonly createdAt: 'desc' };
    }): Promise<readonly ReferenceEntityDatabaseRowV1[]>;
  };
  readonly referenceEntityResolutionRecord: {
    create(input: {
      readonly data: ReferenceResolutionCreateDataV1;
    }): Promise<ReferenceResolutionDatabaseRowV1>;
    findMany(input: {
      readonly where: Readonly<Record<string, string>>;
      readonly orderBy: { readonly resolvedAt: 'desc' };
    }): Promise<readonly ReferenceResolutionDatabaseRowV1[]>;
  };
  $transaction<TValue>(
    work: (transaction: ReferenceEntityDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function scopeForRow(
  row: ReferenceEntityDatabaseRowV1 | ReferenceResolutionDatabaseRowV1,
): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function rowToVersion(row: ReferenceEntityDatabaseRowV1): BusinessPartyVersionV1 {
  const parsed = createBusinessPartyVersionV1({
    entityId: row.entityId,
    versionId: row.id,
    tenantScope: scopeForRow(row),
    displayName: row.displayName,
    roles: row.roles,
    aliases: row.aliases,
    externalIdentifiers: row.externalIdentifiers,
    status: row.status,
    visibility: row.visibility,
    canonicalHash: row.canonicalHash,
    createdAt: row.createdAt.toISOString(),
  });
  if (!parsed.accepted) throw new Error('DSM_PERSISTED_REFERENCE_ENTITY_INVALID');
  return parsed.value;
}

function rowToResolution(row: ReferenceResolutionDatabaseRowV1): BusinessPartyResolutionV1 {
  const resolutionId = parseStableIdentifierV1(row.id);
  const sourceEntityId = parseStableIdentifierV1(row.sourceEntityId);
  const targetEntityId = parseStableIdentifierV1(row.targetEntityId);
  const actorId = parseStableIdentifierV1(row.actorId);
  const evidenceId = parseStableIdentifierV1(row.evidenceId);
  const resolvedAt = parseStrictUtcTimestampV1(row.resolvedAt.toISOString());
  if (
    !resolutionId.accepted ||
    !sourceEntityId.accepted ||
    !targetEntityId.accepted ||
    !actorId.accepted ||
    !evidenceId.accepted ||
    !resolvedAt.accepted ||
    row.reason.length === 0 ||
    row.reason.length > 512
  ) {
    throw new Error('DSM_PERSISTED_RESOLUTION_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1,
    resolutionId: resolutionId.value,
    resolutionType: 'MERGE' as const,
    sourceEntityId: sourceEntityId.value,
    targetEntityId: targetEntityId.value,
    actorId: actorId.value,
    reason: row.reason,
    evidenceId: evidenceId.value,
    resolvedAt: resolvedAt.value,
  });
}

function visible(
  context: TenantScopeV1,
  row: ReferenceEntityDatabaseRowV1 | ReferenceResolutionDatabaseRowV1,
): boolean {
  const candidate = scopeForRow(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaReferenceEntityTransactionAdapter implements ReferenceEntityTransactionPortV1 {
  public constructor(private readonly client: ReferenceEntityDatabaseClientV1) {}

  public async saveVersion(
    context: IamTenantContextV1,
    version: BusinessPartyVersionV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, version.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.referenceEntityVersionRecord.findUnique({
      where: { id: version.versionId },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToVersion(existing)) !== JSON.stringify(version))
        throw new Error('DSM_IMMUTABLE_REFERENCE_VERSION');
      return;
    }
    await this.client.referenceEntityVersionRecord.create({
      data: {
        ...databaseScope(version.tenantScope),
        id: version.versionId,
        entityId: version.entityId,
        entityType: version.entityType,
        displayName: version.displayName,
        roles: version.roles,
        aliases: version.aliases,
        externalIdentifiers: version.externalIdentifiers,
        status: version.status,
        visibility: version.visibility,
        canonicalHash: version.canonicalHash,
        createdAt: new Date(version.createdAt),
      },
    });
  }

  public async findVersion(
    context: IamTenantContextV1,
    versionId: BusinessPartyVersionV1['versionId'],
  ): Promise<BusinessPartyVersionV1 | undefined> {
    const row = await this.client.referenceEntityVersionRecord.findUnique({
      where: { id: versionId },
    });
    return row === null
      ? undefined
      : visible(context.tenantScope, row)
        ? rowToVersion(row)
        : undefined;
  }

  public async findLatest(
    context: IamTenantContextV1,
    entityId: BusinessPartyVersionV1['entityId'],
  ): Promise<BusinessPartyVersionV1 | undefined> {
    const versions = await this.listVersions(context, entityId);
    return versions[0];
  }

  public async listVersions(
    context: IamTenantContextV1,
    entityId: BusinessPartyVersionV1['entityId'],
  ): Promise<readonly BusinessPartyVersionV1[]> {
    const rows = await this.client.referenceEntityVersionRecord.findMany({
      where: { entityId, organizationId: context.tenantScope.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.filter((row) => visible(context.tenantScope, row)).map(rowToVersion);
  }

  public async saveResolution(
    context: IamTenantContextV1,
    resolution: BusinessPartyResolutionV1,
  ): Promise<void> {
    const existing = await this.client.referenceEntityResolutionRecord.findMany({
      where: {
        organizationId: context.tenantScope.organizationId,
        sourceEntityId: resolution.sourceEntityId,
      },
      orderBy: { resolvedAt: 'desc' },
    });
    if (existing.some((row) => row.id === resolution.resolutionId)) {
      if (
        JSON.stringify(
          rowToResolution(existing.find((row) => row.id === resolution.resolutionId)!),
        ) !== JSON.stringify(resolution)
      )
        throw new Error('DSM_IMMUTABLE_RESOLUTION');
      return;
    }
    await this.client.referenceEntityResolutionRecord.create({
      data: {
        ...databaseScope(context.tenantScope),
        id: resolution.resolutionId,
        sourceEntityId: resolution.sourceEntityId,
        targetEntityId: resolution.targetEntityId,
        actorId: resolution.actorId,
        reason: resolution.reason,
        evidenceId: resolution.evidenceId,
        resolvedAt: new Date(resolution.resolvedAt),
      },
    });
  }

  public async listResolutions(
    context: IamTenantContextV1,
    entityId: BusinessPartyVersionV1['entityId'],
  ): Promise<readonly BusinessPartyResolutionV1[]> {
    const rows = await this.client.referenceEntityResolutionRecord.findMany({
      where: { organizationId: context.tenantScope.organizationId, sourceEntityId: entityId },
      orderBy: { resolvedAt: 'desc' },
    });
    return rows.filter((row) => visible(context.tenantScope, row)).map(rowToResolution);
  }
}

export class PrismaReferenceEntityRepositoryAdapter implements ReferenceEntityRepositoryPortV1 {
  public constructor(private readonly client: ReferenceEntityDatabaseClientV1) {}
  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ReferenceEntityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaReferenceEntityTransactionAdapter(transaction)),
    );
  }
  public saveVersion(context: IamTenantContextV1, version: BusinessPartyVersionV1): Promise<void> {
    return new PrismaReferenceEntityTransactionAdapter(this.client).saveVersion(context, version);
  }
  public findVersion(
    context: IamTenantContextV1,
    versionId: BusinessPartyVersionV1['versionId'],
  ): Promise<BusinessPartyVersionV1 | undefined> {
    return new PrismaReferenceEntityTransactionAdapter(this.client).findVersion(context, versionId);
  }
  public findLatest(
    context: IamTenantContextV1,
    entityId: BusinessPartyVersionV1['entityId'],
  ): Promise<BusinessPartyVersionV1 | undefined> {
    return new PrismaReferenceEntityTransactionAdapter(this.client).findLatest(context, entityId);
  }
  public listVersions(
    context: IamTenantContextV1,
    entityId: BusinessPartyVersionV1['entityId'],
  ): Promise<readonly BusinessPartyVersionV1[]> {
    return new PrismaReferenceEntityTransactionAdapter(this.client).listVersions(context, entityId);
  }
  public saveResolution(
    context: IamTenantContextV1,
    resolution: BusinessPartyResolutionV1,
  ): Promise<void> {
    return new PrismaReferenceEntityTransactionAdapter(this.client).saveResolution(
      context,
      resolution,
    );
  }
  public listResolutions(
    context: IamTenantContextV1,
    entityId: BusinessPartyVersionV1['entityId'],
  ): Promise<readonly BusinessPartyResolutionV1[]> {
    return new PrismaReferenceEntityTransactionAdapter(this.client).listResolutions(
      context,
      entityId,
    );
  }
}

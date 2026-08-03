import {
  createArtifactLineageV1,
  type ArtifactLineageV1,
} from '@databreeze/domain/artifact-governance/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ArtifactLineageRepositoryPortV1,
  ArtifactLineageTransactionPortV1,
} from '../application/artifact-lineage-repository.port.js';
import {
  isPrismaUniqueConstraintViolationV1,
  prismaUniqueConstraintTargetV1,
} from '../../../platform/prisma-error.js';

export interface ArtifactLineageDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly derivedArtifactVersionId: string;
  readonly sourceVersionIds: unknown;
  readonly processorVersion: string;
  readonly recipeVersion: string | null;
  readonly coordinateLineage: unknown;
}

export interface ArtifactLineageDatabaseClientV1 {
  readonly artifactLineageRecord: {
    create(input: {
      readonly data: ArtifactLineageDatabaseRowV1;
    }): Promise<ArtifactLineageDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string } | { readonly derivedArtifactVersionId: string };
    }): Promise<ArtifactLineageDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: { readonly sourceVersionIds: { readonly array_contains: string } };
      readonly orderBy: { readonly id: 'asc' };
    }): Promise<readonly ArtifactLineageDatabaseRowV1[]>;
  };
  $transaction<TValue>(
    work: (transaction: ArtifactLineageDatabaseClientV1) => Promise<TValue>,
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

function rowScope(row: ArtifactLineageDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function rowToDomain(row: ArtifactLineageDatabaseRowV1): ArtifactLineageV1 {
  const parsed = createArtifactLineageV1({
    lineageId: row.id,
    derivedArtifactVersionId: row.derivedArtifactVersionId,
    tenantScope: rowScope(row),
    sourceArtifactVersionIds: row.sourceVersionIds,
    processorVersion: row.processorVersion,
    ...(row.recipeVersion === null ? {} : { recipeVersion: row.recipeVersion }),
    coordinateLineage: row.coordinateLineage,
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_LINEAGE_INVALID');
  return parsed.value;
}

function domainToCreate(lineage: ArtifactLineageV1): ArtifactLineageDatabaseRowV1 {
  return {
    ...databaseScope(lineage.tenantScope),
    id: lineage.lineageId,
    derivedArtifactVersionId: lineage.derivedArtifactVersionId,
    sourceVersionIds: lineage.sourceArtifactVersionIds,
    processorVersion: lineage.processorVersion,
    recipeVersion: lineage.recipeVersion ?? null,
    coordinateLineage: lineage.coordinateLineage,
  };
}

function visible(context: TenantScopeV1, row: ArtifactLineageDatabaseRowV1): boolean {
  const candidate = rowScope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaArtifactLineageTransactionAdapter implements ArtifactLineageTransactionPortV1 {
  public constructor(private readonly client: ArtifactLineageDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, lineage: ArtifactLineageV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, lineage.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.artifactLineageRecord.findUnique({
      where: { id: lineage.lineageId },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToDomain(existing)) !== JSON.stringify(lineage))
        throw new Error('IAE_IMMUTABLE_LINEAGE');
      return;
    }
    try {
      await this.client.artifactLineageRecord.create({ data: domainToCreate(lineage) });
    } catch (error) {
      if (isPrismaUniqueConstraintViolationV1(error)) {
        const target = prismaUniqueConstraintTargetV1(error);
        if (target?.includes('derivedArtifactVersionId'))
          throw new Error('IAE_DERIVED_LINEAGE_CONFLICT', { cause: error });

        const racedById = await this.client.artifactLineageRecord.findUnique({
          where: { id: lineage.lineageId },
        });
        if (racedById !== null) {
          if (JSON.stringify(rowToDomain(racedById)) !== JSON.stringify(lineage))
            throw new Error('IAE_IMMUTABLE_LINEAGE', { cause: error });
          return;
        }
        if (target?.includes('id')) throw error;

        const racedByDerived = await this.client.artifactLineageRecord.findUnique({
          where: { derivedArtifactVersionId: lineage.derivedArtifactVersionId },
        });
        if (racedByDerived !== null)
          throw new Error('IAE_DERIVED_LINEAGE_CONFLICT', { cause: error });
      }
      throw error;
    }
  }

  public async findByDerived(
    context: IamTenantContextV1,
    derivedArtifactVersionId: ArtifactLineageV1['derivedArtifactVersionId'],
  ): Promise<ArtifactLineageV1 | undefined> {
    const row = await this.client.artifactLineageRecord.findUnique({
      where: { derivedArtifactVersionId },
    });
    return row !== null && visible(context.tenantScope, row) ? rowToDomain(row) : undefined;
  }

  public async listBySource(
    context: IamTenantContextV1,
    sourceArtifactVersionId: ArtifactLineageV1['sourceArtifactVersionIds'][number],
  ): Promise<readonly ArtifactLineageV1[]> {
    const rows = await this.client.artifactLineageRecord.findMany({
      where: { sourceVersionIds: { array_contains: sourceArtifactVersionId } },
      orderBy: { id: 'asc' },
    });
    return rows.filter((row) => visible(context.tenantScope, row)).map(rowToDomain);
  }
}

export class PrismaArtifactLineageRepositoryAdapter implements ArtifactLineageRepositoryPortV1 {
  public constructor(private readonly client: ArtifactLineageDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactLineageTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaArtifactLineageTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, lineage: ArtifactLineageV1): Promise<void> {
    return new PrismaArtifactLineageTransactionAdapter(this.client).save(context, lineage);
  }

  public findByDerived(
    context: IamTenantContextV1,
    derivedArtifactVersionId: ArtifactLineageV1['derivedArtifactVersionId'],
  ): Promise<ArtifactLineageV1 | undefined> {
    return new PrismaArtifactLineageTransactionAdapter(this.client).findByDerived(
      context,
      derivedArtifactVersionId,
    );
  }

  public listBySource(
    context: IamTenantContextV1,
    sourceArtifactVersionId: ArtifactLineageV1['sourceArtifactVersionIds'][number],
  ): Promise<readonly ArtifactLineageV1[]> {
    return new PrismaArtifactLineageTransactionAdapter(this.client).listBySource(
      context,
      sourceArtifactVersionId,
    );
  }
}

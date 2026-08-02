import {
  tenantScopeContainsV1,
  type ArtifactLineageV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ArtifactLineageRepositoryPortV1,
  ArtifactLineageTransactionPortV1,
} from '../application/artifact-lineage-repository.port.js';

function visible(context: TenantScopeV1, record: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, record) || tenantScopeContainsV1(record, context);
}

function clone(lineage: ArtifactLineageV1): ArtifactLineageV1 {
  return Object.freeze({
    ...lineage,
    tenantScope: Object.freeze({ ...lineage.tenantScope }),
    sourceArtifactVersionIds: Object.freeze([...lineage.sourceArtifactVersionIds]),
    coordinateLineage: Object.freeze(
      lineage.coordinateLineage.map((item) => Object.freeze({ ...item })),
    ),
  });
}

/** In-memory governance adapter used until the PostgreSQL repository is wired. */
export class InMemoryArtifactLineageRepositoryAdapter implements ArtifactLineageRepositoryPortV1 {
  private lineages = new Map<string, ArtifactLineageV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, lineage: ArtifactLineageV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, lineage.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = this.lineages.get(lineage.lineageId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(lineage))
      throw new Error('IAE_IMMUTABLE_LINEAGE');
    this.lineages.set(lineage.lineageId, clone(lineage));
  }

  public async findByDerived(
    context: IamTenantContextV1,
    derivedArtifactVersionId: ArtifactLineageV1['derivedArtifactVersionId'],
  ): Promise<ArtifactLineageV1 | undefined> {
    await Promise.resolve();
    const record = [...this.lineages.values()].find(
      (candidate) =>
        candidate.derivedArtifactVersionId === derivedArtifactVersionId &&
        visible(context.tenantScope, candidate.tenantScope),
    );
    return record ? clone(record) : undefined;
  }

  public async listBySource(
    context: IamTenantContextV1,
    sourceArtifactVersionId: ArtifactLineageV1['sourceArtifactVersionIds'][number],
  ): Promise<readonly ArtifactLineageV1[]> {
    await Promise.resolve();
    return [...this.lineages.values()]
      .filter(
        (candidate) =>
          candidate.sourceArtifactVersionIds.includes(sourceArtifactVersionId) &&
          visible(context.tenantScope, candidate.tenantScope),
      )
      .sort((left, right) => left.lineageId.localeCompare(right.lineageId))
      .map(clone);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactLineageTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.lineages);
    try {
      return await work({
        save: this.save.bind(this),
        findByDerived: this.findByDerived.bind(this),
        listBySource: this.listBySource.bind(this),
      });
    } catch (error) {
      this.lineages = before;
      throw error;
    } finally {
      release();
    }
  }
}

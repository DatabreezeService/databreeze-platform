import { tenantScopeContainsV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type { DatasetVersionManifestV1 } from '@databreeze/domain/dataset-governance/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DatasetVersionRepositoryPortV1,
  DatasetVersionTransactionPortV1,
} from '../application/dataset-version-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function clone(version: DatasetVersionManifestV1): DatasetVersionManifestV1 {
  return Object.freeze({
    ...version,
    tenantScope: Object.freeze({ ...version.tenantScope }),
    inputArtifactVersionIds: Object.freeze([...version.inputArtifactVersionIds]),
  });
}

export class InMemoryDatasetVersionRepositoryAdapter implements DatasetVersionRepositoryPortV1 {
  private versions = new Map<string, DatasetVersionManifestV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, version: DatasetVersionManifestV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, version.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = this.versions.get(version.versionId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(version))
      throw new Error('DSM_IMMUTABLE_DATASET_VERSION');
    this.versions.set(version.versionId, clone(version));
  }

  public async find(
    context: IamTenantContextV1,
    versionId: DatasetVersionManifestV1['versionId'],
  ): Promise<DatasetVersionManifestV1 | undefined> {
    await Promise.resolve();
    const version = this.versions.get(versionId);
    return version && visible(context.tenantScope, version.tenantScope)
      ? clone(version)
      : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    datasetId: DatasetVersionManifestV1['datasetId'],
  ): Promise<readonly DatasetVersionManifestV1[]> {
    await Promise.resolve();
    return [...this.versions.values()]
      .filter(
        (version) =>
          version.datasetId === datasetId && visible(context.tenantScope, version.tenantScope),
      )
      .sort((left, right) => left.versionId.localeCompare(right.versionId))
      .map(clone);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetVersionTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.versions);
    try {
      return await work({
        save: this.save.bind(this),
        find: this.find.bind(this),
        list: this.list.bind(this),
      });
    } catch (error) {
      this.versions = before;
      throw error;
    } finally {
      release();
    }
  }
}

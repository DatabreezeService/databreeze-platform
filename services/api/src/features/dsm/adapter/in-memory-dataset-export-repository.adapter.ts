import { tenantScopeContainsV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type { DatasetExportManifestV1 } from '@databreeze/domain/dataset-export/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DatasetExportRepositoryPortV1,
  DatasetExportTransactionPortV1,
} from '../application/dataset-export-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function clone(manifest: DatasetExportManifestV1): DatasetExportManifestV1 {
  return Object.freeze({
    ...manifest,
    tenantScope: Object.freeze({ ...manifest.tenantScope }),
  });
}

export class InMemoryDatasetExportRepositoryAdapter implements DatasetExportRepositoryPortV1 {
  private manifests = new Map<string, DatasetExportManifestV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, manifest: DatasetExportManifestV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, manifest.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = this.manifests.get(manifest.manifestId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(manifest))
      throw new Error('DSM_IMMUTABLE_EXPORT_MANIFEST');
    this.manifests.set(manifest.manifestId, clone(manifest));
  }

  public async find(
    context: IamTenantContextV1,
    manifestId: DatasetExportManifestV1['manifestId'],
  ): Promise<DatasetExportManifestV1 | undefined> {
    await Promise.resolve();
    const manifest = this.manifests.get(manifestId);
    return manifest && visible(context.tenantScope, manifest.tenantScope)
      ? clone(manifest)
      : undefined;
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetExportTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.manifests);
    try {
      return await work({ save: this.save.bind(this), find: this.find.bind(this) });
    } catch (error) {
      this.manifests = before;
      throw error;
    } finally {
      release();
    }
  }
}

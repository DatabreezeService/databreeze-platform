import { tenantScopeContainsV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type { DatasetProfileV1 } from '@databreeze/domain/dataset-profile/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DatasetProfileRepositoryPortV1,
  DatasetProfileTransactionPortV1,
} from '../application/dataset-profile-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function clone(profile: DatasetProfileV1): DatasetProfileV1 {
  return Object.freeze({
    ...profile,
    tenantScope: Object.freeze({ ...profile.tenantScope }),
    excludedScopes: Object.freeze([...profile.excludedScopes]),
    resourceLimits: Object.freeze({ ...profile.resourceLimits }),
  });
}

export class InMemoryDatasetProfileRepositoryAdapter implements DatasetProfileRepositoryPortV1 {
  private profiles = new Map<string, DatasetProfileV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, profile: DatasetProfileV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, profile.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = this.profiles.get(profile.profileId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(profile))
      throw new Error('DSM_IMMUTABLE_DATASET_PROFILE');
    this.profiles.set(profile.profileId, clone(profile));
  }

  public async find(
    context: IamTenantContextV1,
    profileId: DatasetProfileV1['profileId'],
  ): Promise<DatasetProfileV1 | undefined> {
    await Promise.resolve();
    const profile = this.profiles.get(profileId);
    return profile && visible(context.tenantScope, profile.tenantScope)
      ? clone(profile)
      : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    datasetVersionId: DatasetProfileV1['datasetVersionId'],
  ): Promise<readonly DatasetProfileV1[]> {
    await Promise.resolve();
    return [...this.profiles.values()]
      .filter(
        (profile) =>
          profile.datasetVersionId === datasetVersionId &&
          visible(context.tenantScope, profile.tenantScope),
      )
      .sort((left, right) => left.profileId.localeCompare(right.profileId))
      .map(clone);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetProfileTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.profiles);
    try {
      return await work({
        save: this.save.bind(this),
        find: this.find.bind(this),
        list: this.list.bind(this),
      });
    } catch (error) {
      this.profiles = before;
      throw error;
    } finally {
      release();
    }
  }
}

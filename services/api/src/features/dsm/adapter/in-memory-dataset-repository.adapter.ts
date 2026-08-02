import {
  tenantScopeContainsV1,
  type DatasetDefinitionV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';

import type {
  DatasetRepositoryPortV1,
  DatasetTransactionPortV1,
} from '../application/dataset-repository.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function clone(definition: DatasetDefinitionV1): DatasetDefinitionV1 {
  return Object.freeze({
    ...definition,
    tenantScope: Object.freeze({ ...definition.tenantScope }),
    fields: Object.freeze(definition.fields.map((field) => Object.freeze({ ...field }))),
  });
}

/** In-memory DSM adapter with immutable version and tenant ancestry checks. */
export class InMemoryDatasetRepositoryAdapter implements DatasetRepositoryPortV1 {
  private definitions = new Map<string, DatasetDefinitionV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, definition: DatasetDefinitionV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, definition.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = this.definitions.get(definition.versionId);
    if (existing && JSON.stringify(existing) === JSON.stringify(definition)) return;
    if (existing && JSON.stringify(existing) !== JSON.stringify(definition))
      throw new Error('DSM_IMMUTABLE_DEFINITION');
    this.definitions.set(definition.versionId, clone(definition));
  }

  public async find(
    context: IamTenantContextV1,
    versionId: DatasetDefinitionV1['versionId'],
  ): Promise<DatasetDefinitionV1 | undefined> {
    await Promise.resolve();
    const definition = this.definitions.get(versionId);
    return definition && visible(context.tenantScope, definition.tenantScope)
      ? clone(definition)
      : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    datasetId: DatasetDefinitionV1['datasetId'],
  ): Promise<readonly DatasetDefinitionV1[]> {
    await Promise.resolve();
    return [...this.definitions.values()]
      .filter(
        (definition) =>
          definition.datasetId === datasetId &&
          visible(context.tenantScope, definition.tenantScope),
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(clone);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.definitions);
    try {
      return await work({
        save: this.save.bind(this),
        find: this.find.bind(this),
        list: this.list.bind(this),
      });
    } catch (error) {
      this.definitions = before;
      throw error;
    } finally {
      release();
    }
  }
}

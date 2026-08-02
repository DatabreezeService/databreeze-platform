import {
  tenantScopeContainsV1,
  type MappingDefinitionV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  MappingRepositoryPortV1,
  MappingTransactionPortV1,
} from '../application/mapping-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function clone(definition: MappingDefinitionV1): MappingDefinitionV1 {
  return Object.freeze({
    ...definition,
    tenantScope: Object.freeze({ ...definition.tenantScope }),
    steps: Object.freeze(definition.steps.map((step) => Object.freeze({ ...step }))),
  });
}

export class InMemoryMappingRepositoryAdapter implements MappingRepositoryPortV1 {
  private definitions = new Map<string, MappingDefinitionV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, definition: MappingDefinitionV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, definition.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = this.definitions.get(definition.versionId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(definition))
      throw new Error('DSM_IMMUTABLE_MAPPING');
    this.definitions.set(definition.versionId, clone(definition));
  }

  public async find(context: IamTenantContextV1, versionId: StableIdentifierV1): Promise<MappingDefinitionV1 | undefined> {
    await Promise.resolve();
    const definition = this.definitions.get(versionId);
    return definition && visible(context.tenantScope, definition.tenantScope) ? clone(definition) : undefined;
  }

  public async list(context: IamTenantContextV1, datasetId: StableIdentifierV1): Promise<readonly MappingDefinitionV1[]> {
    await Promise.resolve();
    return [...this.definitions.values()]
      .filter((definition) => definition.datasetId === datasetId && visible(context.tenantScope, definition.tenantScope))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(clone);
  }

  public async withTransaction<TValue>(context: IamTenantContextV1, work: (transaction: MappingTransactionPortV1) => Promise<TValue>): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const before = new Map(this.definitions);
    try {
      return await work({ save: this.save.bind(this), find: this.find.bind(this), list: this.list.bind(this) });
    } catch (error) {
      this.definitions = before;
      throw error;
    } finally {
      release();
    }
  }
}

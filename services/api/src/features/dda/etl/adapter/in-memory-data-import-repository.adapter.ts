import { tenantScopesEqualV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DataImportRecordV1,
  DataImportRepositoryPortV1,
} from '../application/data-import-repository.port.js';

function clone(record: DataImportRecordV1): DataImportRecordV1 {
  return structuredClone(record);
}

export class InMemoryDataImportRepositoryAdapter implements DataImportRepositoryPortV1 {
  private readonly records = new Map<string, DataImportRecordV1>();

  public async save(
    record: DataImportRecordV1,
    expectedRevision?: number,
  ): Promise<DataImportRecordV1> {
    await Promise.resolve();
    const existing = this.records.get(record.importId);
    if (existing !== undefined && !tenantScopesEqualV1(existing.tenantScope, record.tenantScope)) {
      throw new Error('DDA_DATA_IMPORT_SCOPE_CONFLICT');
    }
    if (
      expectedRevision !== undefined &&
      (existing === undefined || existing.revision !== expectedRevision)
    ) {
      throw new Error('DDA_IMPORT_REVISION_CONFLICT');
    }
    const saved = clone(record);
    this.records.set(record.importId, saved);
    return clone(saved);
  }

  public async findById(
    importId: string,
    tenantScope: TenantScopeV1,
  ): Promise<DataImportRecordV1 | undefined> {
    await Promise.resolve();
    const record = this.records.get(importId);
    return record !== undefined && tenantScopesEqualV1(record.tenantScope, tenantScope)
      ? clone(record)
      : undefined;
  }

  public async list(
    tenantScope: TenantScopeV1,
    limit: number,
  ): Promise<readonly DataImportRecordV1[]> {
    await Promise.resolve();
    return [...this.records.values()]
      .filter((record) => tenantScopesEqualV1(record.tenantScope, tenantScope))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map(clone);
  }
}

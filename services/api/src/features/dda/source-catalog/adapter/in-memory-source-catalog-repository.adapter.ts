import {
  tenantScopeContainsV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  SourceCatalogRecordV1,
  SourceCatalogRepositoryPortV1,
} from '../application/source-catalog-repository.port.js';

function clone(record: SourceCatalogRecordV1): SourceCatalogRecordV1 {
  return Object.freeze({
    ...record,
    ...(record.deniedPrincipalIds
      ? { deniedPrincipalIds: Object.freeze([...record.deniedPrincipalIds]) }
      : {}),
    ...(record.evidenceOverlay ? { evidenceOverlay: Object.freeze({ ...record.evidenceOverlay }) } : {}),
  });
}

function visible(context: IamTenantContextV1, record: SourceCatalogRecordV1): boolean {
  if (context.tenantScope.scopeType !== 'workspace') return false;
  if (record.organizationId !== context.tenantScope.organizationId) return false;
  if (record.workspaceId !== context.tenantScope.workspaceId) return false;
  return tenantScopeContainsV1(context.tenantScope, {
    scopeType: 'workspace',
    organizationId: record.organizationId,
    workspaceId: record.workspaceId,
  });
}

function authorized(context: IamTenantContextV1, record: SourceCatalogRecordV1): boolean {
  return !(record.deniedPrincipalIds ?? []).includes(context.actorId);
}

/** Deterministic local adapter for DDA-052 source catalog records. */
export class InMemorySourceCatalogRepositoryAdapter implements SourceCatalogRepositoryPortV1 {
  private records: SourceCatalogRecordV1[] = [];

  public seed(records: readonly SourceCatalogRecordV1[]): void {
    this.records = records.map((record) => clone(record));
  }

  public async listByDataset(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly SourceCatalogRecordV1[]> {
    await Promise.resolve();
    return this.records
      .filter(
        (record) =>
          visible(context, record) &&
          authorized(context, record) &&
          record.dsmDatasetId === datasetId,
      )
      .map((record) => clone(record));
  }

  public async findSource(
    context: IamTenantContextV1,
    sourceId: StableIdentifierV1,
  ): Promise<SourceCatalogRecordV1 | undefined> {
    await Promise.resolve();
    const record = this.records.find((item) => item.id === sourceId);
    if (!record || !visible(context, record) || !authorized(context, record)) return undefined;
    return clone(record);
  }
}

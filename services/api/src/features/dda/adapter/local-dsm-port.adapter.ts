import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { DdaDsmPortV1 } from '../application/foundation-ports.js';

interface LocalDsmDatabaseClientV1 {
  readonly datasetVersionRecord: {
    findFirst(input: {
      readonly where: Record<string, unknown>;
    }): Promise<{ readonly id: string } | null>;
  };
  readonly analysisPlanRecord: {
    findFirst(input: { readonly where: Record<string, unknown> }): Promise<{
      readonly id: string;
    } | null>;
  };
}

function scopeWhere(scope: TenantScopeV1): Record<string, unknown> {
  if (scope.scopeType === 'project') {
    return {
      scopeType: scope.scopeType,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
    };
  }
  if (scope.scopeType === 'workspace') {
    return {
      scopeType: scope.scopeType,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: null,
    };
  }
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: null,
    projectId: null,
  };
}

/** Local-only DSM lookup backed by the published dataset version and analysis plan rows. */
export class LocalDsmPortAdapterV1 implements DdaDsmPortV1 {
  readonly #client: LocalDsmDatabaseClientV1;

  public constructor(client: LocalDsmDatabaseClientV1) {
    this.#client = client;
  }

  public async requireDatasetVersion(reference: {
    readonly id: string;
    readonly tenantScope: TenantScopeV1;
  }): Promise<void> {
    const row = await this.#client.datasetVersionRecord.findFirst({
      where: { id: reference.id, ...scopeWhere(reference.tenantScope) },
    });
    if (row === null || row.id !== reference.id) throw new Error('DDA_AUTHORITY_MISSING');
  }

  public async requireSemanticVersion(reference: {
    readonly id: string;
    readonly tenantScope: TenantScopeV1;
  }): Promise<void> {
    const row = await this.#client.analysisPlanRecord.findFirst({
      where: { semanticVersionId: reference.id, ...scopeWhere(reference.tenantScope) },
    });
    if (row === null) throw new Error('DDA_AUTHORITY_MISSING');
  }

  public async requireMetricVersion(reference: {
    readonly id: string;
    readonly tenantScope: TenantScopeV1;
  }): Promise<void> {
    const row = await this.#client.analysisPlanRecord.findFirst({
      where: { metricVersionId: reference.id, ...scopeWhere(reference.tenantScope) },
    });
    if (row === null) throw new Error('DDA_AUTHORITY_MISSING');
  }
}

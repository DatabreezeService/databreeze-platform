import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  BoundInputChangeKindV1,
  DependencyRepositoryPortV1,
  MaterializationDefinitionBindingV1,
} from '../application/dependency-repository.port.js';

export interface MaterializationBindingRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly dashboardId: string;
  readonly dashboardVersionId: string;
  readonly widgetId: string;
  readonly analysisPlanVersionId: string;
  readonly datasetVersionId: string;
  readonly semanticVersionId: string;
  readonly metricVersionId: string;
  readonly permissionProjectionVersionId: string;
  readonly parameterHash: string;
  readonly locale: string;
  readonly timezone: string;
  readonly engineVersion: string;
  readonly adapterVersion: string;
  readonly effectivePolicyVersionId: string;
  readonly processorId: string;
  readonly deleted: boolean;
}

export interface DependencyProcessedEventRowV1 {
  readonly eventId: string;
  readonly sequence: number;
}

export interface DependencySequenceRowV1 {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly highestSequence: number;
}

export interface DdaDependencyDatabaseClientV1 {
  readonly materializationDefinitionRecord: {
    findMany(input: {
      readonly where: {
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
        readonly deleted: boolean;
      };
    }): Promise<readonly MaterializationBindingRowV1[]>;
  };
  readonly dependencyProcessedEventRecord: {
    upsert(input: {
      readonly where: { readonly eventId: string };
      readonly create: DependencyProcessedEventRowV1;
      readonly update: { readonly sequence: number };
    }): Promise<DependencyProcessedEventRowV1>;
    findFirst(input: {
      readonly where: { readonly eventId: string };
    }): Promise<DependencyProcessedEventRowV1 | null>;
  };
  readonly dependencySequenceRecord: {
    upsert(input: {
      readonly where: {
        readonly organizationId_workspaceId_projectId: {
          readonly organizationId: string;
          readonly workspaceId: string;
          readonly projectId: string;
        };
      };
      readonly create: DependencySequenceRowV1;
      readonly update: { readonly highestSequence: number };
    }): Promise<DependencySequenceRowV1>;
    findFirst(input: {
      readonly where: {
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<DependencySequenceRowV1 | null>;
  };
}

function requireProjectScope(tenantScope: TenantScopeV1): TenantScopeV1 & {
  readonly scopeType: 'project';
  readonly workspaceId: string;
  readonly projectId: string;
} {
  if (tenantScope.scopeType !== 'project' || !tenantScope.workspaceId || !tenantScope.projectId) {
    throw new Error('TENANT_SCOPE_REQUIRED');
  }
  return tenantScope;
}

function matchesReference(
  binding: MaterializationDefinitionBindingV1,
  changeKind: BoundInputChangeKindV1,
  referenceId: string,
): boolean {
  switch (changeKind) {
    case 'DATASET_VERSION':
      return binding.datasetVersionId === referenceId;
    case 'SEMANTIC_VERSION':
      return binding.semanticVersionId === referenceId;
    case 'METRIC_VERSION':
      return binding.metricVersionId === referenceId;
    case 'PARAMETER':
      return binding.materializationDefinitionId === referenceId;
    case 'DASHBOARD_VERSION':
      return binding.dashboardVersionId === referenceId;
    case 'PERMISSION_PROJECTION':
      return binding.permissionProjectionVersionId === referenceId;
    default:
      return false;
  }
}

function rowToBinding(row: MaterializationBindingRowV1): MaterializationDefinitionBindingV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsed.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  return Object.freeze({
    materializationDefinitionId: row.id,
    tenantScope: parsed.value,
    dashboardId: row.dashboardId,
    dashboardVersionId: row.dashboardVersionId,
    widgetId: row.widgetId,
    analysisPlanVersionId: row.analysisPlanVersionId,
    datasetVersionId: row.datasetVersionId,
    semanticVersionId: row.semanticVersionId,
    metricVersionId: row.metricVersionId,
    permissionProjectionVersionId: row.permissionProjectionVersionId,
    parameterHash: row.parameterHash,
    locale: row.locale,
    timezone: row.timezone,
    engineVersion: row.engineVersion,
    adapterVersion: row.adapterVersion,
    effectivePolicyVersionId: row.effectivePolicyVersionId,
    processorId: row.processorId,
    deleted: row.deleted,
  });
}

export class PrismaDependencyRepositoryAdapter implements DependencyRepositoryPortV1 {
  public constructor(private readonly client: DdaDependencyDatabaseClientV1) {}

  public async findBindingsByReference(
    tenantScope: TenantScopeV1,
    changeKind: BoundInputChangeKindV1,
    referenceId: string,
  ): Promise<readonly MaterializationDefinitionBindingV1[]> {
    const scope = requireProjectScope(tenantScope);
    const rows = await this.client.materializationDefinitionRecord.findMany({
      where: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        deleted: false,
      },
    });
    return Object.freeze(
      rows.map(rowToBinding).filter((binding) => matchesReference(binding, changeKind, referenceId)),
    );
  }

  public async isReferenceOwnedByOtherTenant(
    tenantScope: TenantScopeV1,
    changeKind: BoundInputChangeKindV1,
    referenceId: string,
  ): Promise<boolean> {
    requireProjectScope(tenantScope);
    const owned = await this.findBindingsByReference(tenantScope, changeKind, referenceId);
    return owned.length === 0;
  }

  public async rememberProcessedEvent(eventId: string, sequence: number): Promise<void> {
    await this.client.dependencyProcessedEventRecord.upsert({
      where: { eventId },
      create: { eventId, sequence },
      update: { sequence },
    });
  }

  public async findProcessedEvent(
    eventId: string,
  ): Promise<{ readonly eventId: string; readonly sequence: number } | undefined> {
    const row = await this.client.dependencyProcessedEventRecord.findFirst({
      where: { eventId },
    });
    return row === null ? undefined : Object.freeze({ eventId: row.eventId, sequence: row.sequence });
  }

  public async highestSequence(tenantScope: TenantScopeV1): Promise<number> {
    const scope = requireProjectScope(tenantScope);
    const row = await this.client.dependencySequenceRecord.findFirst({
      where: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    return row?.highestSequence ?? 0;
  }

  public async advanceSequence(tenantScope: TenantScopeV1, sequence: number): Promise<void> {
    const scope = requireProjectScope(tenantScope);
    await this.client.dependencySequenceRecord.upsert({
      where: {
        organizationId_workspaceId_projectId: {
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
        },
      },
      create: {
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        highestSequence: sequence,
      },
      update: { highestSequence: sequence },
    });
  }
}

import {
  createDdaAnalysisPlanV1,
  type DdaAnalysisPlanV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { AnalysisPlanRepositoryPortV1 } from '../application/analysis-plan-repository.port.js';

export interface AnalysisPlanRecordRowV1 {
  readonly id: string;
  readonly planId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly datasetVersionId: string;
  readonly semanticVersionId: string;
  readonly metricVersionId: string;
  readonly permissionProjectionVersionId: string;
  readonly planDocument: unknown;
  readonly planHash: string;
  readonly createdAt: Date;
}

export interface AnalysisPlanRecordCreateV1 {
  readonly id: string;
  readonly planId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly datasetVersionId: string;
  readonly semanticVersionId: string;
  readonly metricVersionId: string;
  readonly permissionProjectionVersionId: string;
  readonly planDocument: unknown;
  readonly planHash: string;
  readonly createdAt: Date;
}

export interface DdaAnalysisPlanDatabaseClientV1 {
  readonly analysisPlanRecord: {
    upsert(input: {
      readonly where: { readonly id: string };
      readonly create: AnalysisPlanRecordCreateV1;
      readonly update: Omit<AnalysisPlanRecordCreateV1, 'id' | 'createdAt'>;
    }): Promise<AnalysisPlanRecordRowV1>;
    findFirst(input: {
      readonly where: {
        readonly id: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<AnalysisPlanRecordRowV1 | null>;
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

function scopeColumns(tenantScope: TenantScopeV1) {
  const scoped = requireProjectScope(tenantScope);
  return {
    scopeType: scoped.scopeType,
    organizationId: scoped.organizationId,
    workspaceId: scoped.workspaceId,
    projectId: scoped.projectId,
  } as const;
}

function rowToPlan(row: AnalysisPlanRecordRowV1): DdaAnalysisPlanV1 {
  const parsedScope = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsedScope.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  const document =
    row.planDocument && typeof row.planDocument === 'object' && !Array.isArray(row.planDocument)
      ? (row.planDocument as Record<string, unknown>)
      : null;
  if (document === null) throw new Error('DDA_PERSISTED_PLAN_INVALID');
  const created = createDdaAnalysisPlanV1({
    planId: row.planId,
    planVersionId: row.id,
    tenantScope: parsedScope.value,
    datasetVersionId: row.datasetVersionId,
    semanticVersionId: row.semanticVersionId,
    metricVersionId: row.metricVersionId,
    permissionProjectionVersionId: row.permissionProjectionVersionId,
    dimensions: document['dimensions'],
    filters: document['filters'],
    timeRange: document['timeRange'],
    timeGrain: document['timeGrain'],
    joins: document['joins'],
    units: document['units'],
    parameters: document['parameters'],
    output: document['output'],
    assumptions: document['assumptions'],
    estimate: document['estimate'],
    planHash: row.planHash,
    createdAt: row.createdAt.toISOString(),
  });
  if (!created.accepted) throw new Error('DDA_PERSISTED_PLAN_INVALID');
  return created.value;
}

export class PrismaAnalysisPlanRepositoryAdapter implements AnalysisPlanRepositoryPortV1 {
  public constructor(private readonly client: DdaAnalysisPlanDatabaseClientV1) {}

  public async save(plan: DdaAnalysisPlanV1): Promise<void> {
    const scope = scopeColumns(plan.tenantScope);
    const planDocument = Object.freeze({
      dimensions: plan.dimensions,
      filters: plan.filters,
      timeRange: plan.timeRange,
      timeGrain: plan.timeGrain,
      joins: plan.joins,
      units: plan.units,
      parameters: plan.parameters,
      output: plan.output,
      assumptions: plan.assumptions,
      estimate: plan.estimate,
    });
    const data: AnalysisPlanRecordCreateV1 = {
      id: plan.planVersionId,
      planId: plan.planId,
      ...scope,
      datasetVersionId: plan.datasetVersionId,
      semanticVersionId: plan.semanticVersionId,
      metricVersionId: plan.metricVersionId,
      permissionProjectionVersionId: plan.permissionProjectionVersionId,
      planDocument,
      planHash: plan.planHash,
      createdAt: new Date(plan.createdAt),
    };
    await this.client.analysisPlanRecord.upsert({
      where: { id: plan.planVersionId },
      create: data,
      update: {
        planId: data.planId,
        ...scope,
        datasetVersionId: data.datasetVersionId,
        semanticVersionId: data.semanticVersionId,
        metricVersionId: data.metricVersionId,
        permissionProjectionVersionId: data.permissionProjectionVersionId,
        planDocument: data.planDocument,
        planHash: data.planHash,
      },
    });
  }

  public async findByVersionId(
    tenantScope: TenantScopeV1,
    planVersionId: string,
  ): Promise<DdaAnalysisPlanV1 | undefined> {
    const scope = scopeColumns(tenantScope);
    const row = await this.client.analysisPlanRecord.findFirst({
      where: {
        id: planVersionId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
    });
    return row === null ? undefined : rowToPlan(row);
  }
}

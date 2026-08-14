import {
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  DashboardWorkspaceHistoryCursorProblemV1,
  decodeDashboardWorkspaceHistoryCursorV1,
  encodeDashboardWorkspaceHistoryCursorV1,
  type DashboardWorkspaceHistoryCandidateV1,
  type DashboardWorkspaceHistoryPortV1,
} from '../application/dashboard-workspace-history.port.js';
import type { DashboardAuthorizationPortV1 } from '../application/dashboard-authorization.port.js';
import type { AnalysisCatalogAuthorityPortV1 } from '../../analyst/application/analysis-catalog.port.js';
import { AnalysisCatalogResolverServiceV1 } from '../../analyst/application/analysis-catalog-resolver.service.js';
import type { AnalysisPlanRepositoryPortV1 } from '../../application/analysis-plan-repository.port.js';

export interface DashboardWorkspaceHistoryDashboardRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly titleVi: string;
  readonly titleEn: string;
  readonly status: string;
  readonly updatedAt: Date;
}

export interface DashboardWorkspaceHistoryAnalysisRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly createdAt: Date;
}

interface DashboardWorkspaceHistoryDashboardDelegateV1 {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: readonly Readonly<Record<string, 'asc' | 'desc'>>[];
  }): Promise<readonly DashboardWorkspaceHistoryDashboardRowV1[]>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<DashboardWorkspaceHistoryDashboardRowV1 | null>;
}

interface DashboardWorkspaceHistoryAnalysisDelegateV1 {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: readonly Readonly<Record<string, 'asc' | 'desc'>>[];
  }): Promise<readonly DashboardWorkspaceHistoryAnalysisRowV1[]>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<DashboardWorkspaceHistoryAnalysisRowV1 | null>;
}

/** Narrow metadata-only Prisma surface; plan documents and dashboard layouts are deliberately absent. */
export interface DdaDashboardWorkspaceHistoryDatabaseClientV1 {
  readonly dashboardRecord: DashboardWorkspaceHistoryDashboardDelegateV1;
  readonly analysisPlanRecord: DashboardWorkspaceHistoryAnalysisDelegateV1;
}

function projectScopeColumns(scope: TenantScopeV1): Readonly<Record<string, string>> | undefined {
  if (scope.scopeType !== 'project') return undefined;
  return {
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
  };
}

function rowScope(row: {
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
}): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  return parsed.accepted ? parsed.value : undefined;
}

function dashboardStatus(status: string): DashboardWorkspaceHistoryCandidateV1['safeStatus'] {
  if (status === 'ARCHIVED') return 'STALE';
  if (status === 'DRAFT' || status === 'PUBLISHED') return 'CURRENT';
  return 'BLOCKED';
}

function dashboardCandidate(
  row: DashboardWorkspaceHistoryDashboardRowV1,
  scope: TenantScopeV1,
): DashboardWorkspaceHistoryCandidateV1 | undefined {
  const persistedScope = rowScope(row);
  if (!persistedScope || !tenantScopesEqualV1(scope, persistedScope)) return undefined;
  const safeStatus = dashboardStatus(row.status);
  return Object.freeze({
    kind: 'DASHBOARD',
    subjectId: row.id,
    title: Object.freeze({ vi: row.titleVi, en: row.titleEn }),
    updatedAt: row.updatedAt.toISOString(),
    ...(safeStatus === undefined ? {} : { safeStatus }),
  });
}

function analysisCandidate(
  row: DashboardWorkspaceHistoryAnalysisRowV1,
  scope: TenantScopeV1,
): DashboardWorkspaceHistoryCandidateV1 | undefined {
  const persistedScope = rowScope(row);
  if (!persistedScope || !tenantScopesEqualV1(scope, persistedScope)) return undefined;
  return Object.freeze({
    kind: 'ANALYSIS',
    subjectId: row.id,
    title: Object.freeze({
      vi: 'Ph\u00e2n t\u00edch \u0111\u00e3 l\u01b0u',
      en: 'Saved analysis',
    }),
    updatedAt: row.createdAt.toISOString(),
    safeStatus: 'CURRENT',
  });
}

function compareCandidates(
  left: DashboardWorkspaceHistoryCandidateV1,
  right: DashboardWorkspaceHistoryCandidateV1,
): number {
  return (
    right.updatedAt.localeCompare(left.updatedAt) || left.subjectId.localeCompare(right.subjectId)
  );
}

function afterCursor(
  candidate: DashboardWorkspaceHistoryCandidateV1,
  cursor: { readonly updatedAt: string; readonly subjectId: string },
): boolean {
  return (
    candidate.updatedAt < cursor.updatedAt ||
    (candidate.updatedAt === cursor.updatedAt && candidate.subjectId > cursor.subjectId)
  );
}

/** DDA-026/DDA-033: tenant-scoped metadata history with a fresh scoped subject lookup. */
export class PrismaDashboardWorkspaceHistoryAdapter implements DashboardWorkspaceHistoryPortV1 {
  public constructor(
    private readonly db: DdaDashboardWorkspaceHistoryDatabaseClientV1,
    private readonly authorization?: DashboardAuthorizationPortV1,
    private readonly analysisCatalogAuthority?: AnalysisCatalogAuthorityPortV1,
    private readonly analysisPlans?: AnalysisPlanRepositoryPortV1,
  ) {}

  public async list(input: {
    readonly tenantScope: TenantScopeV1;
    readonly cursor?: string;
    readonly limit: number;
  }) {
    const scope = projectScopeColumns(input.tenantScope);
    if (scope === undefined) return Object.freeze({ items: Object.freeze([]) });
    const cursor = input.cursor
      ? decodeDashboardWorkspaceHistoryCursorV1(input.tenantScope, input.cursor)
      : undefined;
    if (input.cursor !== undefined && cursor === undefined) {
      throw new DashboardWorkspaceHistoryCursorProblemV1();
    }
    const [dashboardRows, analysisRows] = await Promise.all([
      this.db.dashboardRecord.findMany({
        where: scope,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.analysisPlanRecord.findMany({
        where: scope,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    ]);
    const ordered = [
      ...dashboardRows
        .map((row) => dashboardCandidate(row, input.tenantScope))
        .filter(
          (candidate): candidate is DashboardWorkspaceHistoryCandidateV1 => candidate !== undefined,
        ),
      ...analysisRows
        .map((row) => analysisCandidate(row, input.tenantScope))
        .filter(
          (candidate): candidate is DashboardWorkspaceHistoryCandidateV1 => candidate !== undefined,
        ),
    ].sort(compareCandidates);
    const start = cursor ? ordered.findIndex((candidate) => afterCursor(candidate, cursor)) : 0;
    const offset = start < 0 ? ordered.length : start;
    const items = ordered.slice(offset, offset + Math.min(input.limit, 50));
    const last = items[items.length - 1];
    return Object.freeze({
      items: Object.freeze(items),
      ...(last !== undefined && offset + items.length < ordered.length
        ? {
            nextCursor: encodeDashboardWorkspaceHistoryCursorV1(input.tenantScope, {
              updatedAt: last.updatedAt,
              subjectId: last.subjectId,
            }),
          }
        : {}),
    });
  }

  public async reauthorize(input: {
    readonly context?: import('../../../iam/application/tenant-context.js').IamTenantContextV1;
    readonly tenantScope: TenantScopeV1;
    readonly actorId: string;
    readonly kind: DashboardWorkspaceHistoryCandidateV1['kind'];
    readonly subjectId: string;
  }) {
    const scope = projectScopeColumns(input.tenantScope);
    if (scope === undefined) return 'DENIED' as const;
    const row =
      input.kind === 'DASHBOARD'
        ? await this.db.dashboardRecord.findFirst({ where: { ...scope, id: input.subjectId } })
        : await this.db.analysisPlanRecord.findFirst({ where: { ...scope, id: input.subjectId } });
    if (row === null) return 'DENIED' as const;
    const persistedScope = rowScope(row);
    if (!persistedScope || !tenantScopesEqualV1(input.tenantScope, persistedScope)) {
      return 'DENIED' as const;
    }
    if (input.kind === 'ANALYSIS') {
      if (
        input.context === undefined ||
        this.analysisCatalogAuthority === undefined ||
        this.analysisPlans === undefined
      ) {
        return 'DENIED' as const;
      }
      const plan = await this.analysisPlans.findByVersionId(input.tenantScope, input.subjectId);
      if (plan === undefined) return 'DENIED' as const;
      const resolved = await new AnalysisCatalogResolverServiceV1(
        this.analysisCatalogAuthority,
      ).resolve(input.context, {
        datasetVersionId: plan.datasetVersionId,
        semanticVersionId: plan.semanticVersionId,
        metricVersionId: plan.metricVersionId,
        permissionProjectionVersionId: plan.permissionProjectionVersionId,
      });
      return resolved.accepted ? ('ALLOWED' as const) : ('DENIED' as const);
    }
    if (this.authorization === undefined) return 'UNAVAILABLE' as const;
    try {
      const decision =
        input.context === undefined
          ? await this.authorization.authorizeDashboardAction({
              tenantScope: input.tenantScope,
              actorId: input.actorId,
              dashboardId: input.subjectId,
              action: 'VIEW',
            })
          : await this.authorization.authorizeDashboardAction({
              context: input.context,
              tenantScope: input.tenantScope,
              actorId: input.actorId,
              dashboardId: input.subjectId,
              action: 'VIEW',
            });
      return decision.allowed ? ('ALLOWED' as const) : ('DENIED' as const);
    } catch {
      return 'UNAVAILABLE' as const;
    }
  }
}

import {
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { DdaDashboardChartProposal } from '@databreeze/contracts/v3';

import type {
  DashboardProposalRecordV1,
  DashboardProposalRepositoryPortV1,
  DashboardProposalStateV1,
} from '../application/dashboard-proposal-repository.port.js';

export interface DashboardProposalRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly dashboardId: string;
  readonly parentVersionId: string;
  readonly analysisPlanVersionId: string;
  readonly expectedRevision: number;
  readonly state: string;
  readonly proposalDocument: unknown;
  readonly actorId: string;
  readonly acceptedVersionId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DdaDashboardProposalDatabaseClientV1 {
  readonly dashboardProposalRecord: {
    create(input: { readonly data: Record<string, unknown> }): Promise<DashboardProposalRowV1>;
    findFirst(input: {
      readonly where: Readonly<Record<string, unknown>>;
    }): Promise<DashboardProposalRowV1 | null>;
    update(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<DashboardProposalRowV1>;
  };
}

function scopeColumns(scope: TenantScopeV1): {
  readonly scopeType: 'project';
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
} {
  if (scope.scopeType !== 'project') throw new Error('TENANT_SCOPE_REQUIRED');
  return scope;
}

function parseRowScope(row: DashboardProposalRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsed.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function state(value: string): DashboardProposalStateV1 {
  if (value === 'PROPOSED' || value === 'ACCEPTED' || value === 'EXPIRED' || value === 'REJECTED')
    return value;
  throw new Error('DDA_PERSISTED_PROPOSAL_STATE_INVALID');
}

function record(row: DashboardProposalRowV1): DashboardProposalRecordV1 {
  const tenantScope = parseRowScope(row);
  return Object.freeze({
    tenantScope,
    actorId: row.actorId,
    proposal: row.proposalDocument as DdaDashboardChartProposal,
    state: state(row.state),
    ...(row.acceptedVersionId === null ? {} : { acceptedVersionId: row.acceptedVersionId }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** Prisma adapter deliberately persists only the bounded preview document and scope metadata. */
export class PrismaDashboardProposalRepositoryAdapter implements DashboardProposalRepositoryPortV1 {
  public constructor(private readonly client: DdaDashboardProposalDatabaseClientV1) {}

  public async save(input: DashboardProposalRecordV1): Promise<void> {
    const scope = scopeColumns(input.tenantScope);
    const proposal = input.proposal;
    await this.client.dashboardProposalRecord.create({
      data: {
        id: proposal.proposalId,
        scopeType: scope.scopeType,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        dashboardId: proposal.dashboardId,
        parentVersionId: proposal.parentVersionId,
        analysisPlanVersionId: proposal.analysisPlanVersionId,
        expectedRevision: proposal.expectedRevision,
        state: input.state,
        proposalDocument: proposal,
        actorId: input.actorId,
        acceptedVersionId: input.acceptedVersionId ?? null,
        createdAt: new Date(input.createdAt),
        updatedAt: new Date(input.updatedAt ?? input.createdAt),
      },
    });
  }

  public async findById(
    tenantScope: TenantScopeV1,
    proposalId: string,
  ): Promise<DashboardProposalRecordV1 | undefined> {
    const scope = scopeColumns(tenantScope);
    const row = await this.client.dashboardProposalRecord.findFirst({
      where: { ...scope, id: proposalId },
    });
    if (row === null) return undefined;
    const parsed = record(row);
    return tenantScopesEqualV1(parsed.tenantScope, tenantScope) ? parsed : undefined;
  }

  public async markAccepted(
    tenantScope: TenantScopeV1,
    proposalId: string,
    acceptedVersionId: string,
  ): Promise<boolean> {
    const current = await this.findById(tenantScope, proposalId);
    if (current === undefined || current.state !== 'PROPOSED') return false;
    const scope = scopeColumns(tenantScope);
    await this.client.dashboardProposalRecord.update({
      where: { ...scope, id: proposalId },
      data: { state: 'ACCEPTED', acceptedVersionId, updatedAt: new Date() },
    });
    return true;
  }

  public async markProposed(tenantScope: TenantScopeV1, proposalId: string): Promise<boolean> {
    const current = await this.findById(tenantScope, proposalId);
    if (current === undefined || current.state !== 'ACCEPTED') return false;
    const scope = scopeColumns(tenantScope);
    await this.client.dashboardProposalRecord.update({
      where: { ...scope, id: proposalId },
      data: { state: 'PROPOSED', acceptedVersionId: null, updatedAt: new Date() },
    });
    return true;
  }
}

import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  EtlProposalRecordV1,
  EtlProposalRepositoryPortV1,
  EtlProposalStateV1,
  EtlReviewContextV1,
} from '../application/etl-proposal-repository.port.js';
import type {
  EtlAcceptanceReservationInputV1,
  EtlAcceptanceReservationResultV1,
  EtlAcceptanceReconciliationInputV1,
  EtlAcceptanceReconciliationResultV1,
  EtlAcceptanceValueV1,
} from '../application/etl-acceptance-idempotency.port.js';
import {
  PrismaEtlAcceptanceCommandRepositoryAdapter,
  type DdaEtlAcceptanceCommandDatabaseClientV1,
} from './prisma-etl-acceptance-command-repository.adapter.js';

export interface EtlProposalRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly revision: number;
  readonly state: string;
  readonly blockingReasons: unknown;
  readonly planDocument: unknown;
  readonly reviewDocument: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EtlProposalCreateV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly revision: number;
  readonly state: string;
  readonly blockingReasons: unknown;
  readonly planDocument: unknown;
  readonly reviewDocument: unknown;
  readonly createdAt: Date;
}

export interface DdaEtlProposalDatabaseClientV1 {
  readonly etlProposalRecord: {
    upsert(input: {
      readonly where: { readonly id: string };
      readonly create: EtlProposalCreateV1;
      readonly update: Omit<EtlProposalCreateV1, 'id' | 'createdAt'>;
    }): Promise<EtlProposalRowV1>;
    findFirst(input: {
      readonly where: {
        readonly id: string;
        readonly organizationId?: string;
        readonly workspaceId?: string;
        readonly projectId?: string;
      };
    }): Promise<EtlProposalRowV1 | null>;
    updateMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<{ readonly count: number }>;
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

function recordTenantScope(record: EtlProposalRecordV1): TenantScopeV1 | undefined {
  const candidate =
    record.tenantScope ??
    (record.plan as { readonly tenantScope?: unknown } | undefined)?.tenantScope;
  const parsed = parseTenantScopeV1(candidate);
  return parsed.accepted ? parsed.value : undefined;
}

function scopeWhere(tenantScope: TenantScopeV1 | undefined): {
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
} {
  if (tenantScope === undefined) return {};
  if (tenantScope.scopeType === 'organization') {
    return { organizationId: tenantScope.organizationId };
  }
  if (tenantScope.scopeType === 'workspace') {
    return {
      organizationId: tenantScope.organizationId,
      workspaceId: tenantScope.workspaceId,
    };
  }
  return {
    organizationId: tenantScope.organizationId,
    workspaceId: tenantScope.workspaceId,
    projectId: tenantScope.projectId,
  };
}

function rowToRecord(row: EtlProposalRowV1): EtlProposalRecordV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsed.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  if (!Array.isArray(row.blockingReasons)) throw new Error('DDA_PERSISTED_ETL_INVALID');
  const blockingReasons = row.blockingReasons.map((item: unknown) => {
    if (typeof item !== 'string') throw new Error('DDA_PERSISTED_ETL_INVALID');
    return item;
  });
  return Object.freeze({
    proposalId: row.id,
    revision: row.revision,
    state: row.state as EtlProposalStateV1,
    blockingReasons: Object.freeze(blockingReasons),
    plan: row.planDocument,
    review: row.reviewDocument as EtlReviewContextV1,
    createdAt: row.createdAt.toISOString(),
    tenantScope: parsed.value,
  });
}

export class PrismaEtlProposalRepositoryAdapter implements EtlProposalRepositoryPortV1 {
  private readonly acceptanceCommands: PrismaEtlAcceptanceCommandRepositoryAdapter;

  public constructor(private readonly client: DdaEtlProposalDatabaseClientV1) {
    this.acceptanceCommands = new PrismaEtlAcceptanceCommandRepositoryAdapter(
      client as unknown as DdaEtlAcceptanceCommandDatabaseClientV1,
    );
  }

  public async save(record: EtlProposalRecordV1): Promise<EtlProposalRecordV1> {
    const recordScope = recordTenantScope(record);
    if (!recordScope) throw new Error('TENANT_SCOPE_REQUIRED');
    const scope = requireProjectScope(recordScope);
    const data: EtlProposalCreateV1 = {
      id: record.proposalId,
      scopeType: scope.scopeType,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      revision: record.revision,
      state: record.state,
      blockingReasons: record.blockingReasons,
      planDocument: record.plan,
      reviewDocument: record.review,
      createdAt: new Date(record.createdAt),
    };
    const existing = await this.client.etlProposalRecord.findFirst({
      where: { id: record.proposalId },
    });
    if (existing !== null) {
      const existingScope = parseTenantScopeV1({
        scopeType: existing.scopeType,
        organizationId: existing.organizationId,
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
      });
      if (!existingScope.accepted || !tenantScopesEqualV1(scope, existingScope.value)) {
        throw new Error('TENANT_SCOPE_MISMATCH');
      }
    }
    const row = await this.client.etlProposalRecord.upsert({
      where: { id: record.proposalId },
      create: data,
      update: {
        scopeType: data.scopeType,
        organizationId: data.organizationId,
        workspaceId: data.workspaceId,
        projectId: data.projectId,
        revision: data.revision,
        state: data.state,
        blockingReasons: data.blockingReasons,
        planDocument: data.planDocument,
        reviewDocument: data.reviewDocument,
      },
    });
    return rowToRecord(row);
  }

  public async findById(
    proposalId: string,
    tenantScope?: TenantScopeV1,
  ): Promise<EtlProposalRecordV1 | undefined> {
    const row = await this.client.etlProposalRecord.findFirst({
      where: { id: proposalId, ...scopeWhere(tenantScope) },
    });
    if (row === null) return undefined;
    const record = rowToRecord(row);
    if (tenantScope && !tenantScopeContainsV1(tenantScope, record.tenantScope!)) return undefined;
    return record;
  }

  public update(record: EtlProposalRecordV1): Promise<EtlProposalRecordV1> {
    return this.save(record);
  }

  public reserveAcceptance(
    input: EtlAcceptanceReservationInputV1,
  ): Promise<EtlAcceptanceReservationResultV1> {
    return this.acceptanceCommands.reserveAcceptance(input);
  }

  public completeAcceptance(
    reservationId: string,
    value: EtlAcceptanceValueV1,
  ): Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly code: 'DDA_ETL_COMMAND_UNAVAILABLE' }
  > {
    return this.acceptanceCommands.completeAcceptance(reservationId, value);
  }

  public releaseAcceptance(reservationId: string): Promise<void> {
    return this.acceptanceCommands.releaseAcceptance(reservationId);
  }

  public reconcileAbandonedAcceptance(
    input: EtlAcceptanceReconciliationInputV1,
  ): Promise<EtlAcceptanceReconciliationResultV1> {
    return this.acceptanceCommands.reconcileAbandonedAcceptance(input);
  }
}

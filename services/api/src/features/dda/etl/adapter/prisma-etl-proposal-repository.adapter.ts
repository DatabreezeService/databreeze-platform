import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  EtlProposalRecordV1,
  EtlProposalRepositoryPortV1,
  EtlProposalStateV1,
  EtlReviewContextV1,
} from '../application/etl-proposal-repository.port.js';

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
      readonly where: { readonly id: string };
    }): Promise<EtlProposalRowV1 | null>;
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

function rowToRecord(row: EtlProposalRowV1): EtlProposalRecordV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  });
  if (!parsed.accepted) throw new Error('DDA_PERSISTED_SCOPE_INVALID');
  if (!Array.isArray(row.blockingReasons) || row.blockingReasons.some((item) => typeof item !== 'string')) {
    throw new Error('DDA_PERSISTED_ETL_INVALID');
  }
  return Object.freeze({
    proposalId: row.id,
    revision: row.revision,
    state: row.state as EtlProposalStateV1,
    blockingReasons: Object.freeze([...row.blockingReasons]),
    plan: row.planDocument,
    review: row.reviewDocument as EtlReviewContextV1,
    createdAt: row.createdAt.toISOString(),
    tenantScope: parsed.value,
  });
}

export class PrismaEtlProposalRepositoryAdapter implements EtlProposalRepositoryPortV1 {
  public constructor(private readonly client: DdaEtlProposalDatabaseClientV1) {}

  public async save(record: EtlProposalRecordV1): Promise<EtlProposalRecordV1> {
    if (!record.tenantScope) throw new Error('TENANT_SCOPE_REQUIRED');
    const scope = requireProjectScope(record.tenantScope);
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

  public async findById(proposalId: string): Promise<EtlProposalRecordV1 | undefined> {
    const row = await this.client.etlProposalRecord.findFirst({ where: { id: proposalId } });
    return row === null ? undefined : rowToRecord(row);
  }

  public update(record: EtlProposalRecordV1): Promise<EtlProposalRecordV1> {
    return this.save(record);
  }
}

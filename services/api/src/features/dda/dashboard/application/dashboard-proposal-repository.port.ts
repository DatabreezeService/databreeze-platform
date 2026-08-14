import type { DdaDashboardChartProposal } from '@databreeze/contracts/v3';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export const DASHBOARD_PROPOSAL_REPOSITORY_PORT = Symbol('DASHBOARD_PROPOSAL_REPOSITORY_PORT');

export type DashboardProposalStateV1 = 'PROPOSED' | 'ACCEPTED' | 'EXPIRED' | 'REJECTED';

/** Preview metadata only. The proposal document never contains source rows, evidence, prompts, or provider payloads. */
export interface DashboardProposalRecordV1 {
  readonly tenantScope: TenantScopeV1;
  readonly actorId: string;
  readonly proposal: DdaDashboardChartProposal;
  readonly state: DashboardProposalStateV1;
  readonly acceptedVersionId?: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export interface DashboardProposalRepositoryPortV1 {
  save(record: DashboardProposalRecordV1): Promise<void>;
  findById(
    tenantScope: TenantScopeV1,
    proposalId: string,
  ): Promise<DashboardProposalRecordV1 | undefined>;
  markAccepted(
    tenantScope: TenantScopeV1,
    proposalId: string,
    acceptedVersionId: string,
  ): Promise<boolean>;
  /** Compensating transition used when a pre-acceptance reservation cannot commit its version. */
  markProposed?(tenantScope: TenantScopeV1, proposalId: string): Promise<boolean>;
}

/* eslint-disable @typescript-eslint/require-await -- in-memory adapter mirrors the durable async repository port. */

import { tenantScopesEqualV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DashboardProposalRecordV1,
  DashboardProposalRepositoryPortV1,
} from '../application/dashboard-proposal-repository.port.js';

export type { DashboardProposalRecordV1 } from '../application/dashboard-proposal-repository.port.js';

function key(scope: TenantScopeV1, proposalId: string): string {
  return `${JSON.stringify(scope)}:${proposalId}`;
}

/** Test/local-only proposal metadata store with explicit tenant-keyed lookups. */
export class InMemoryDashboardProposalRepositoryAdapter
  implements DashboardProposalRepositoryPortV1
{
  readonly #records = new Map<string, DashboardProposalRecordV1>();

  public async save(record: DashboardProposalRecordV1): Promise<void> {
    const now = new Date().toISOString();
    const stored = Object.freeze({
      ...record,
      proposal: Object.freeze(record.proposal),
      ...(record.updatedAt === undefined ? { updatedAt: now } : {}),
    });
    this.#records.set(key(record.tenantScope, record.proposal.proposalId), stored);
  }

  public async findById(
    tenantScope: TenantScopeV1,
    proposalId: string,
  ): Promise<DashboardProposalRecordV1 | undefined> {
    const found = this.#records.get(key(tenantScope, proposalId));
    if (found === undefined || !tenantScopesEqualV1(found.tenantScope, tenantScope))
      return undefined;
    return found;
  }

  public async markAccepted(
    tenantScope: TenantScopeV1,
    proposalId: string,
    acceptedVersionId: string,
  ): Promise<boolean> {
    const found = await this.findById(tenantScope, proposalId);
    if (found === undefined || found.state !== 'PROPOSED') return false;
    this.#records.set(
      key(tenantScope, proposalId),
      Object.freeze({
        ...found,
        state: 'ACCEPTED' as const,
        acceptedVersionId,
        updatedAt: new Date().toISOString(),
      }),
    );
    return true;
  }

  public async markProposed(tenantScope: TenantScopeV1, proposalId: string): Promise<boolean> {
    const found = await this.findById(tenantScope, proposalId);
    if (found === undefined || found.state !== 'ACCEPTED') return false;
    const { acceptedVersionId: _acceptedVersionId, ...withoutAcceptedVersion } = found;
    void _acceptedVersionId;
    this.#records.set(
      key(tenantScope, proposalId),
      Object.freeze({
        ...withoutAcceptedVersion,
        state: 'PROPOSED' as const,
        updatedAt: new Date().toISOString(),
      }),
    );
    return true;
  }

  public async listForTenant(
    tenantScope: TenantScopeV1,
  ): Promise<readonly DashboardProposalRecordV1[]> {
    return Object.freeze(
      [...this.#records.values()].filter((record) =>
        tenantScopesEqualV1(record.tenantScope, tenantScope),
      ),
    );
  }
}

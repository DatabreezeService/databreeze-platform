import {
  parseTenantScopeV1,
  tenantScopesEqualV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  EtlProposalRecordV1,
  EtlProposalRepositoryPortV1,
} from '../application/etl-proposal-repository.port.js';
import type {
  EtlAcceptanceReservationInputV1,
  EtlAcceptanceReservationResultV1,
  EtlAcceptanceReconciliationInputV1,
  EtlAcceptanceReconciliationResultV1,
  EtlAcceptanceValueV1,
} from '../application/etl-acceptance-idempotency.port.js';

type AcceptanceCommandV1 =
  | {
      readonly kind: 'PENDING';
      readonly reservationId: string;
      readonly input: EtlAcceptanceReservationInputV1;
    }
  | {
      readonly kind: 'COMPLETED';
      readonly input: EtlAcceptanceReservationInputV1;
      readonly value: EtlAcceptanceValueV1;
    };

function recordTenantScope(record: EtlProposalRecordV1): TenantScopeV1 | undefined {
  const candidate =
    record.tenantScope ??
    (record.plan as { readonly tenantScope?: unknown } | undefined)?.tenantScope;
  const parsed = parseTenantScopeV1(candidate);
  return parsed.accepted ? parsed.value : undefined;
}

export class InMemoryEtlProposalRepositoryAdapter implements EtlProposalRepositoryPortV1 {
  private readonly records = new Map<string, EtlProposalRecordV1>();
  private readonly acceptanceCommands = new Map<string, AcceptanceCommandV1>();

  public save(record: EtlProposalRecordV1): Promise<EtlProposalRecordV1> {
    const existing = this.records.get(record.proposalId);
    const nextScope = recordTenantScope(record);
    if (existing && nextScope) {
      const existingScope = recordTenantScope(existing);
      if (!existingScope || !tenantScopesEqualV1(nextScope, existingScope)) {
        throw new Error('TENANT_SCOPE_MISMATCH');
      }
    }
    const persisted = Object.freeze({
      ...record,
      ...(nextScope === undefined ? {} : { tenantScope: nextScope }),
    });
    this.records.set(record.proposalId, persisted);
    return Promise.resolve(this.records.get(record.proposalId)!);
  }

  public findById(
    proposalId: string,
    tenantScope?: TenantScopeV1,
  ): Promise<EtlProposalRecordV1 | undefined> {
    const found = this.records.get(proposalId);
    if (!found || tenantScope === undefined) return Promise.resolve(found);
    const foundScope = recordTenantScope(found);
    return Promise.resolve(
      foundScope && tenantScopeContainsV1(tenantScope, foundScope) ? found : undefined,
    );
  }

  public async update(record: EtlProposalRecordV1): Promise<EtlProposalRecordV1> {
    return this.save(record);
  }

  public reserveAcceptance(
    input: EtlAcceptanceReservationInputV1,
  ): Promise<EtlAcceptanceReservationResultV1> {
    const proposal = this.records.get(input.proposalId);
    if (!proposal) return Promise.resolve({ accepted: false, code: 'DDA_ETL_NOT_FOUND' });
    const proposalScope = recordTenantScope(proposal);
    if (!proposalScope || !tenantScopeContainsV1(input.tenantScope, proposalScope)) {
      return Promise.resolve({ accepted: false, code: 'DDA_ETL_NOT_FOUND' });
    }
    const key = acceptanceCommandKey(input);
    const existing = this.acceptanceCommands.get(key);
    if (existing) {
      if (existing.input.payloadFingerprint !== input.payloadFingerprint) {
        return Promise.resolve({ accepted: false, code: 'DDA_ETL_COMMAND_CONFLICT' });
      }
      if (existing.kind === 'COMPLETED') {
        return Promise.resolve({
          accepted: true,
          value: { kind: 'REPLAY', acceptance: existing.value },
        });
      }
      return Promise.resolve({ accepted: false, code: 'DDA_ETL_COMMAND_CONFLICT' });
    }

    if (proposal.revision !== input.expectedRevision) {
      return Promise.resolve({ accepted: false, code: 'DDA_ETL_REVISION_CONFLICT' });
    }
    if (proposal.state !== 'READY_FOR_ACCEPTANCE' || proposal.blockingReasons.length > 0) {
      return Promise.resolve({ accepted: false, code: 'DDA_ETL_STALE_PROPOSAL' });
    }

    for (const command of this.acceptanceCommands.values()) {
      if (
        command.kind === 'PENDING' &&
        command.input.proposalId === input.proposalId &&
        command.input.expectedRevision === input.expectedRevision &&
        tenantScopesEqualV1(command.input.tenantScope, input.tenantScope)
      ) {
        return Promise.resolve({ accepted: false, code: 'DDA_ETL_REVISION_CONFLICT' });
      }
    }

    const reservationId = `${input.proposalId}:${input.expectedRevision}:${this.acceptanceCommands.size + 1}`;
    this.acceptanceCommands.set(key, Object.freeze({ kind: 'PENDING', reservationId, input }));
    return Promise.resolve({ accepted: true, value: { kind: 'RESERVED', reservationId } });
  }

  public completeAcceptance(
    reservationId: string,
    value: EtlAcceptanceValueV1,
  ): Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly code: 'DDA_ETL_COMMAND_UNAVAILABLE' }
  > {
    for (const [key, command] of this.acceptanceCommands) {
      if (command.kind !== 'PENDING' || command.reservationId !== reservationId) continue;
      const proposal = this.records.get(command.input.proposalId);
      if (
        !proposal ||
        proposal.revision !== command.input.expectedRevision ||
        proposal.state !== 'READY_FOR_ACCEPTANCE'
      ) {
        return Promise.resolve({ accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' });
      }
      this.records.set(
        proposal.proposalId,
        Object.freeze({
          ...proposal,
          state: 'ACCEPTED' as const,
          revision: proposal.revision + 1,
        }),
      );
      this.acceptanceCommands.set(
        key,
        Object.freeze({ kind: 'COMPLETED', input: command.input, value }),
      );
      return Promise.resolve({ accepted: true });
    }
    return Promise.resolve({ accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' });
  }

  public releaseAcceptance(reservationId: string): Promise<void> {
    for (const [key, command] of this.acceptanceCommands) {
      if (command.kind === 'PENDING' && command.reservationId === reservationId) {
        this.acceptanceCommands.delete(key);
        break;
      }
    }
    return Promise.resolve();
  }

  public reconcileAbandonedAcceptance(
    input: EtlAcceptanceReconciliationInputV1,
  ): Promise<EtlAcceptanceReconciliationResultV1> {
    const command = this.acceptanceCommands.get(acceptanceCommandKey(input));
    if (
      !command ||
      command.kind !== 'PENDING' ||
      command.reservationId !== input.reservationId ||
      command.input.payloadFingerprint !== input.payloadFingerprint
    ) {
      return Promise.resolve({ accepted: false, code: 'DDA_ETL_COMMAND_CONFLICT' });
    }
    // The process-local adapter has no durable lease or transaction boundary to reconcile.
    return Promise.resolve({ accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' });
  }
}

function acceptanceCommandKey(input: EtlAcceptanceReservationInputV1): string {
  return JSON.stringify({
    tenantScope: input.tenantScope,
    proposalId: input.proposalId,
    commandKey: input.commandKey,
  });
}

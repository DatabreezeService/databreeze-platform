import {
  evaluateEntitlementV1,
  reserveUsageV1,
  type EntitlementErrorCodeV1,
} from '@databreeze/domain/entitlements/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import {
  entitlementTransactionForDatabase,
  type EntitlementDatabaseClientV1,
} from './prisma-entitlement-repository.adapter.js';
import {
  resultUsageSettlementBindingTransactionForDatabase,
  type ResultUsageSettlementBindingDatabaseClientV1,
} from './prisma-result-usage-settlement-binding-repository.adapter.js';
import type {
  EntitlementAdmissionParticipantInputV1,
  EntitlementAdmissionParticipantResultV1,
  EntitlementAdmissionParticipantV1,
} from '../application/entitlement-admission-participant.port.js';

type SharedEntitlementDatabaseClientV1 = EntitlementDatabaseClientV1 &
  ResultUsageSettlementBindingDatabaseClientV1;

function database(transaction: unknown): SharedEntitlementDatabaseClientV1 {
  if (
    typeof transaction !== 'object' ||
    transaction === null ||
    !('entitlementSnapshotRecord' in transaction) ||
    !('usageLedgerEntryRecord' in transaction) ||
    !('usageReservationRecord' in transaction) ||
    !('resultUsageSettlementBindingRecord' in transaction)
  )
    throw new Error('BUA_ENTITLEMENT_ADMISSION_TRANSACTION_UNAVAILABLE');
  return transaction as SharedEntitlementDatabaseClientV1;
}

function rejected(code: EntitlementErrorCodeV1): EntitlementAdmissionParticipantResultV1 {
  return Object.freeze({ accepted: false, code });
}

function validBinding(input: EntitlementAdmissionParticipantInputV1): boolean {
  const binding = input.binding;
  const entitlement = input.entitlement;
  const parsedBindingId = parseStableIdentifierV1(binding.bindingId);
  const parsedJobId = parseStableIdentifierV1(binding.jobId);
  const parsedReservationId = parseStableIdentifierV1(binding.reservationId);
  const parsedContext = parseTenantScopeV1(entitlement.tenantScope);
  const parsedCreatedAt = parseStrictUtcTimestampV1(binding.createdAt);
  const parsedExpiresAt = parseStrictUtcTimestampV1(binding.expiresAt);
  const parsedNow = parseStrictUtcTimestampV1(entitlement.now);
  if (
    !parsedBindingId.accepted ||
    !parsedJobId.accepted ||
    !parsedReservationId.accepted ||
    !parsedContext.accepted ||
    !parsedCreatedAt.accepted ||
    !parsedExpiresAt.accepted ||
    !parsedNow.accepted ||
    !tenantScopesEqualV1(parsedContext.value, binding.tenantScope) ||
    binding.reservationId !== entitlement.reservationId ||
    binding.admissionIdempotencyKey !== entitlement.idempotencyKey ||
    binding.state !== 'PREPARED' ||
    binding.revision !== 1 ||
    binding.createdAt !== entitlement.now ||
    Date.parse(binding.expiresAt) <= Date.parse(binding.createdAt) ||
    Date.parse(binding.expiresAt) - Date.parse(binding.createdAt) > 24 * 60 * 60 * 1_000 ||
    !/^[0-9a-f]{64}$/u.test(binding.entitlementDecisionSubjectHash)
  )
    return false;
  return true;
}

/**
 * Prisma implementation used only by a root coordinator that already owns the serializable
 * JRA transaction. It never opens a nested transaction and never creates an entitlement
 * reservation after a job has reached completion.
 */
export class PrismaEntitlementAdmissionParticipantAdapter
  implements EntitlementAdmissionParticipantV1
{
  public async admit(
    transaction: unknown,
    context: IamTenantContextV1,
    input: EntitlementAdmissionParticipantInputV1,
  ): Promise<EntitlementAdmissionParticipantResultV1> {
    if (!validBinding(input)) return rejected('INVALID_STATE');
    const client = database(transaction);
    const entitlement = entitlementTransactionForDatabase(client);
    const snapshotId = parseStableIdentifierV1(input.entitlement.snapshotId);
    if (!snapshotId.accepted) return rejected('INVALID_IDENTIFIER');
    const snapshot = await entitlement.findSnapshot(context, snapshotId.value);
    if (!snapshot) return rejected('ENTITLEMENT_NOT_FOUND');
    const granted = evaluateEntitlementV1(
      snapshot,
      input.entitlement.now,
      input.entitlement.feature,
    );
    if (!granted.accepted) return granted;
    const current = await entitlement.listUsageState(context);
    const existingEntry = current.entries.find(
      (entry) => entry.reservationId === input.entitlement.reservationId,
    );
    if (
      existingEntry !== undefined &&
      existingEntry.idempotencyKey !== input.entitlement.idempotencyKey
    )
      return rejected('IDEMPOTENCY_CONFLICT');
    const reserved = reserveUsageV1(snapshot, current, input.entitlement);
    if (!reserved.accepted) return reserved;
    if (
      reserved.value.reservation.reservationId !== input.binding.reservationId ||
      reserved.value.reservation.metric !== input.binding.meter ||
      reserved.value.reservation.reservedUnits !== input.binding.maximumAdmittedUnits ||
      !tenantScopesEqualV1(reserved.value.reservation.tenantScope, input.binding.tenantScope)
    )
      return rejected('IDEMPOTENCY_CONFLICT');
    await entitlement.persistUsageState(context, reserved.value.state);
    await resultUsageSettlementBindingTransactionForDatabase(client).save(context, input.binding);
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        snapshot,
        state: reserved.value.state,
        reservation: reserved.value.reservation,
        binding: input.binding,
      }),
    });
  }
}

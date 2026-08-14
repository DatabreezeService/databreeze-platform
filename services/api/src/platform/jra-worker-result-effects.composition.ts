import { appendAuditEventV1 } from '@databreeze/domain/audit/v1';
import { finalizeUsageV1 } from '@databreeze/domain/entitlements/v1';
import {
  parseStableIdentifierV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import { createHash } from 'node:crypto';

import {
  auditTransactionForDatabase,
  type AuditDatabaseClientV1,
} from '../features/aud/adapter/prisma-audit-repository.adapter.js';
import { Sha256AuditDigestAdapter } from '../features/aud/adapter/sha256-audit-digest.adapter.js';
import {
  entitlementTransactionForDatabase,
  type EntitlementDatabaseClientV1,
} from '../features/bua/adapter/prisma-entitlement-repository.adapter.js';
import {
  resultUsageSettlementBindingTransactionForDatabase,
  type ResultUsageSettlementBindingDatabaseClientV1,
} from '../features/bua/adapter/prisma-result-usage-settlement-binding-repository.adapter.js';
import { createIamTenantContextV1 } from '../features/iam/application/tenant-context.js';
import type {
  JraWorkerDatabaseClientV1,
  WorkerResultFinalizationEffectV1,
  WorkerResultFinalizationEffectsPortV1,
} from '../features/jra/worker/prisma-worker-adapter.js';

type EffectsDatabaseClientV1 = JraWorkerDatabaseClientV1 &
  AuditDatabaseClientV1 &
  EntitlementDatabaseClientV1 &
  ResultUsageSettlementBindingDatabaseClientV1;

function effectsDatabase(transaction: JraWorkerDatabaseClientV1): EffectsDatabaseClientV1 {
  const candidate = transaction as unknown as Readonly<Record<string, unknown>>;
  for (const delegate of [
    'auditEventRecord',
    'auditSealRecord',
    'usageLedgerEntryRecord',
    'usageReservationRecord',
    'resultUsageSettlementBindingRecord',
  ]) {
    if (typeof candidate[delegate] !== 'object' || candidate[delegate] === null)
      throw new Error('WORKER_RESULT_FINALIZATION_EFFECTS_TRANSACTION_UNAVAILABLE');
  }
  return transaction as EffectsDatabaseClientV1;
}

function deterministicIdentifier(...parts: readonly string[]): StableIdentifierV1 {
  const hex = createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 32);
  const value = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('WORKER_RESULT_FINALIZATION_EFFECT_ID_INVALID');
  return parsed.value;
}

function settlementUnits(
  formula: 'COMMITTED_OUTPUT_BYTES' | 'SUCCESSFUL_JOB_UNIT',
  effect: WorkerResultFinalizationEffectV1,
): number {
  return formula === 'COMMITTED_OUTPUT_BYTES' ? effect.outputBytes : 1;
}

/**
 * Plan 407 Task 7: canonical BUA settlement and AUD append inside the exact JRA transaction.
 * No reservation, meter, formula, quantity authority, scope, epoch, or revision is invented here.
 */
export class PrismaWorkerResultFinalizationEffects
  implements WorkerResultFinalizationEffectsPortV1
{
  public async commit(
    transaction: JraWorkerDatabaseClientV1,
    effect: WorkerResultFinalizationEffectV1,
  ): Promise<void> {
    const database = effectsDatabase(transaction);
    const idempotencyKey = `worker-result:${effect.submissionId}`;
    const parsedContext = createIamTenantContextV1({
      tenantScope: effect.tenantScope,
      actorId: effect.actorId,
      correlationId: effect.correlationId,
      idempotencyKey,
      authorizationEpoch: effect.authorizationEpoch,
    });
    if (!parsedContext.accepted)
      throw new Error('WORKER_RESULT_FINALIZATION_EFFECT_CONTEXT_INVALID');
    const context = parsedContext.value;

    const bindingTransaction = resultUsageSettlementBindingTransactionForDatabase(database);
    const binding = await bindingTransaction.find(context, effect.resultUsageSettlementBindingId);
    if (
      binding === undefined ||
      binding.state !== 'PREPARED' ||
      binding.jobId !== effect.jobId ||
      !tenantScopesEqualV1(binding.tenantScope, effect.tenantScope) ||
      Date.parse(binding.expiresAt) < Date.parse(effect.occurredAt)
    )
      throw new Error('BUA_RESULT_USAGE_SETTLEMENT_REJECTED');

    const committedUnits = settlementUnits(binding.settlementFormula, effect);
    if (
      !Number.isSafeInteger(committedUnits) ||
      committedUnits < 1 ||
      committedUnits > binding.maximumAdmittedUnits
    )
      throw new Error('BUA_RESULT_USAGE_SETTLEMENT_REJECTED');

    const entitlementTransaction = entitlementTransactionForDatabase(database);
    const usageState = await entitlementTransaction.listUsageState(context);
    const reservation = usageState.reservations.find(
      (candidate) => candidate.reservationId === binding.reservationId,
    );
    if (
      reservation === undefined ||
      reservation.status !== 'ACTIVE' ||
      reservation.metric !== binding.meter ||
      !tenantScopesEqualV1(reservation.tenantScope, binding.tenantScope) ||
      reservation.reservedUnits < committedUnits
    )
      throw new Error('BUA_RESULT_USAGE_SETTLEMENT_REJECTED');

    const finalized = finalizeUsageV1(usageState, {
      reservationId: binding.reservationId,
      releaseEntryId: deterministicIdentifier(
        'bua-release',
        binding.bindingId,
        effect.submissionId,
      ),
      commitEntryId: deterministicIdentifier('bua-commit', binding.bindingId, effect.submissionId),
      committedUnits,
      now: effect.occurredAt,
      idempotencyKey: `result-settlement:${binding.bindingId}:${effect.submissionId}`,
    });
    if (!finalized.accepted) throw new Error('BUA_RESULT_USAGE_SETTLEMENT_REJECTED');

    const digest = new Sha256AuditDigestAdapter();
    const auditTransaction = auditTransactionForDatabase(database, digest);
    const existingAudit = await auditTransaction.listEventsForScope(context, effect.tenantScope);
    const appended = appendAuditEventV1(
      { events: existingAudit },
      {
        eventId: deterministicIdentifier('aud-job-completed', effect.jobId, effect.submissionId),
        action: 'job.completed',
        tenantScope: effect.tenantScope,
        actor: { actorType: 'SERVICE_ACCOUNT', actorId: effect.actorId },
        entityType: 'job',
        entityId: effect.jobId,
        entityRevision: effect.jobRevision,
        occurredAt: effect.occurredAt,
        correlationId: effect.correlationId,
        idempotencyKey,
        summary: { outcome: 'SUCCEEDED', revision: effect.jobRevision },
      },
      digest,
    );
    if (!appended.accepted)
      throw new Error(`AUD_WORKER_RESULT_FINALIZATION_REJECTED:${appended.code}`);

    await entitlementTransaction.persistUsageState(context, finalized.value);
    await bindingTransaction.markSettled(context, binding.bindingId, binding.revision);
    await auditTransaction.appendEvent(context, appended.value.event);
  }
}

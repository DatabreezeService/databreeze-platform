import {
  tenantScopeContainsV1,
  type EntitlementPlanV1,
  type EntitlementSnapshotV1,
  type TenantScopeV1,
  type UsageLedgerEntryV1,
  type UsageLedgerStateV1,
  type UsageReservationV1,
} from '@databreeze/domain/v1';

import type {
  EntitlementRepositoryPortV1,
  EntitlementTransactionPortV1,
} from '../application/entitlement-repository.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import {
  sameEntitlementPlanV1,
  sameEntitlementSnapshotV1,
  sameUsageEntryV1,
  sameUsageReservationExceptStatusV1,
  sameUsageReservationV1,
} from '../application/entitlement-equality.js';

function visibleInScope(context: TenantScopeV1, record: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, record) || tenantScopeContainsV1(record, context);
}

function scopeAllowsMutation(context: IamTenantContextV1, record: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, record);
}

function snapshotScope(snapshot: EntitlementSnapshotV1): TenantScopeV1 {
  return snapshot.workspaceId
    ? {
        scopeType: 'workspace',
        organizationId: snapshot.organizationId,
        workspaceId: snapshot.workspaceId,
      }
    : { scopeType: 'organization', organizationId: snapshot.organizationId };
}

function clonePlan(plan: EntitlementPlanV1): EntitlementPlanV1 {
  return Object.freeze({
    ...plan,
    features: Object.freeze([...plan.features]),
    quotas: Object.freeze(plan.quotas.map((quota) => Object.freeze({ ...quota }))),
  });
}

function cloneSnapshot(snapshot: EntitlementSnapshotV1): EntitlementSnapshotV1 {
  return Object.freeze({
    ...snapshot,
    features: Object.freeze([...snapshot.features]),
    quotas: Object.freeze(snapshot.quotas.map((quota) => Object.freeze({ ...quota }))),
  });
}

function cloneEntry(entry: UsageLedgerEntryV1): UsageLedgerEntryV1 {
  return Object.freeze({ ...entry, tenantScope: Object.freeze({ ...entry.tenantScope }) });
}

function cloneReservation(reservation: UsageReservationV1): UsageReservationV1 {
  return Object.freeze({
    ...reservation,
    tenantScope: Object.freeze({ ...reservation.tenantScope }),
  });
}

function cloneState(state: UsageLedgerStateV1): UsageLedgerStateV1 {
  return Object.freeze({
    entries: Object.freeze(state.entries.map(cloneEntry)),
    reservations: Object.freeze(state.reservations.map(cloneReservation)),
  });
}

function sameReservationExceptStatus(left: UsageReservationV1, right: UsageReservationV1): boolean {
  return sameUsageReservationExceptStatusV1(left, right);
}

function validReservationTransition(
  current: UsageReservationV1,
  next: UsageReservationV1,
): boolean {
  return current.status === 'ACTIVE' && (next.status === 'FINALIZED' || next.status === 'RELEASED');
}

/** In-memory adapter with append-only usage and immutable plan/snapshot semantics. */
export class InMemoryEntitlementRepositoryAdapter implements EntitlementRepositoryPortV1 {
  private plans = new Map<string, EntitlementPlanV1>();
  private snapshots = new Map<string, EntitlementSnapshotV1>();
  private entries = new Map<string, UsageLedgerEntryV1>();
  private reservations = new Map<string, UsageReservationV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  async savePlan(plan: EntitlementPlanV1): Promise<void> {
    await Promise.resolve();
    const existing = this.plans.get(plan.planCode);
    if (existing && !sameEntitlementPlanV1(existing, plan)) throw new Error('BUA_IMMUTABLE_PLAN');
    this.plans.set(plan.planCode, clonePlan(plan));
  }

  async findPlan(planCode: EntitlementPlanV1['planCode']): Promise<EntitlementPlanV1 | undefined> {
    await Promise.resolve();
    const plan = this.plans.get(planCode);
    return plan ? clonePlan(plan) : undefined;
  }

  async saveSnapshot(context: IamTenantContextV1, snapshot: EntitlementSnapshotV1): Promise<void> {
    await Promise.resolve();
    if (!scopeAllowsMutation(context, snapshotScope(snapshot)))
      throw new Error('BUA_SCOPE_NARROWING_REQUIRED');
    const existing = this.snapshots.get(snapshot.snapshotId);
    if (existing && !sameEntitlementSnapshotV1(existing, snapshot))
      throw new Error('BUA_IMMUTABLE_SNAPSHOT');
    this.snapshots.set(snapshot.snapshotId, cloneSnapshot(snapshot));
  }

  async findSnapshot(
    context: IamTenantContextV1,
    snapshotId: EntitlementSnapshotV1['snapshotId'],
  ): Promise<EntitlementSnapshotV1 | undefined> {
    await Promise.resolve();
    const snapshot = this.snapshots.get(snapshotId);
    return snapshot && visibleInScope(context.tenantScope, snapshotScope(snapshot))
      ? cloneSnapshot(snapshot)
      : undefined;
  }

  async listUsageState(context: IamTenantContextV1): Promise<UsageLedgerStateV1> {
    await Promise.resolve();
    return cloneState({
      entries: [...this.entries.values()]
        .filter((entry) => visibleInScope(context.tenantScope, entry.tenantScope))
        .sort((left, right) => left.sequence - right.sequence),
      reservations: [...this.reservations.values()].filter((reservation) =>
        visibleInScope(context.tenantScope, reservation.tenantScope),
      ),
    });
  }

  async persistUsageState(context: IamTenantContextV1, state: UsageLedgerStateV1): Promise<void> {
    await Promise.resolve();
    if (
      new Set(state.entries.map((entry) => entry.entryId)).size !== state.entries.length ||
      new Set(state.reservations.map((reservation) => reservation.reservationId)).size !==
        state.reservations.length
    )
      throw new Error('BUA_USAGE_STATE_CONFLICT');
    for (const entry of state.entries) {
      const existing = this.entries.get(entry.entryId);
      if (existing) {
        if (!sameUsageEntryV1(existing, entry)) throw new Error('BUA_IMMUTABLE_USAGE_ENTRY');
        if (visibleInScope(context.tenantScope, entry.tenantScope)) continue;
      }
      if (!scopeAllowsMutation(context, entry.tenantScope))
        throw new Error('BUA_SCOPE_NARROWING_REQUIRED');
      const sameMetric = [...this.entries.values()].filter(
        (item) =>
          item.metric === entry.metric &&
          tenantScopeContainsV1(item.tenantScope, entry.tenantScope) &&
          tenantScopeContainsV1(entry.tenantScope, item.tenantScope),
      );
      const nextSequence = Math.max(0, ...sameMetric.map((item) => item.sequence)) + 1;
      if (entry.sequence !== nextSequence) throw new Error('BUA_SEQUENCE_CONFLICT');
      if ([...this.entries.values()].some((item) => item.idempotencyKey === entry.idempotencyKey))
        throw new Error('BUA_IDEMPOTENCY_CONFLICT');
      this.entries.set(entry.entryId, cloneEntry(entry));
    }
    for (const reservation of state.reservations) {
      const existing = this.reservations.get(reservation.reservationId);
      if (existing) {
        if (sameUsageReservationV1(existing, reservation)) {
          if (visibleInScope(context.tenantScope, reservation.tenantScope)) continue;
        } else if (
          !sameReservationExceptStatus(existing, reservation) ||
          existing.revision + 1 !== reservation.revision ||
          !validReservationTransition(existing, reservation)
        ) {
          throw new Error('BUA_RESERVATION_CONFLICT');
        }
      }
      if (!scopeAllowsMutation(context, reservation.tenantScope))
        throw new Error('BUA_SCOPE_NARROWING_REQUIRED');
      if (!existing) {
        this.reservations.set(reservation.reservationId, cloneReservation(reservation));
        continue;
      }
      if (
        existing.revision + 1 !== reservation.revision ||
        !sameReservationExceptStatus(existing, reservation) ||
        !validReservationTransition(existing, reservation)
      )
        throw new Error('BUA_RESERVATION_CONFLICT');
      this.reservations.set(reservation.reservationId, cloneReservation(reservation));
    }
  }

  async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: EntitlementTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const beforePlans = new Map(this.plans);
    const beforeSnapshots = new Map(this.snapshots);
    const beforeEntries = new Map(this.entries);
    const beforeReservations = new Map(this.reservations);
    try {
      return await work({
        savePlan: this.savePlan.bind(this),
        findPlan: this.findPlan.bind(this),
        saveSnapshot: this.saveSnapshot.bind(this),
        findSnapshot: this.findSnapshot.bind(this),
        listUsageState: this.listUsageState.bind(this),
        persistUsageState: this.persistUsageState.bind(this),
      });
    } catch (error) {
      this.plans = beforePlans;
      this.snapshots = beforeSnapshots;
      this.entries = beforeEntries;
      this.reservations = beforeReservations;
      throw error;
    } finally {
      release();
    }
  }
}

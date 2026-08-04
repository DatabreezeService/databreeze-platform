import type {
  EntitlementLeaseV1,
  EntitlementPlanV1,
  EntitlementQuotaV1,
  EntitlementSnapshotV1,
  UsageLedgerEntryV1,
  UsageReservationV1,
} from '@databreeze/domain/entitlements/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

function sameScope(left: TenantScopeV1, right: TenantScopeV1): boolean {
  return (
    left.scopeType === right.scopeType &&
    left.organizationId === right.organizationId &&
    ('workspaceId' in left ? left.workspaceId : undefined) ===
      ('workspaceId' in right ? right.workspaceId : undefined) &&
    ('projectId' in left ? left.projectId : undefined) ===
      ('projectId' in right ? right.projectId : undefined)
  );
}

function sameQuotas(
  left: readonly EntitlementQuotaV1[],
  right: readonly EntitlementQuotaV1[],
): boolean {
  if (left.length !== right.length) return false;
  const normalize = (quotas: readonly EntitlementQuotaV1[]) =>
    [...quotas].sort((a, b) => a.metric.localeCompare(b.metric));
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft.every(
    (quota, index) =>
      quota.metric === normalizedRight[index]?.metric &&
      quota.limit === normalizedRight[index]?.limit,
  );
}

function sameFeatures(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((feature, index) => feature === normalizedRight[index]);
}

export function sameEntitlementPlanV1(left: EntitlementPlanV1, right: EntitlementPlanV1): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.planCode === right.planCode &&
    left.displayNameKey === right.displayNameKey &&
    left.providerIndependent === right.providerIndependent &&
    sameFeatures(left.features, right.features) &&
    sameQuotas(left.quotas, right.quotas)
  );
}

export function sameEntitlementSnapshotV1(
  left: EntitlementSnapshotV1,
  right: EntitlementSnapshotV1,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.snapshotId === right.snapshotId &&
    left.organizationId === right.organizationId &&
    left.workspaceId === right.workspaceId &&
    left.planCode === right.planCode &&
    left.status === right.status &&
    left.revision === right.revision &&
    left.securityEpoch === right.securityEpoch &&
    left.effectiveAt === right.effectiveAt &&
    left.expiresAt === right.expiresAt &&
    sameFeatures(left.features, right.features) &&
    sameQuotas(left.quotas, right.quotas)
  );
}

/** Compares the immutable lease value without relying on object key insertion order. */
export function sameEntitlementLeaseV1(
  left: EntitlementLeaseV1,
  right: EntitlementLeaseV1,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.leaseId === right.leaseId &&
    sameScope(left.tenantScope, right.tenantScope) &&
    left.snapshotRevision === right.snapshotRevision &&
    left.securityEpoch === right.securityEpoch &&
    left.issuedAt === right.issuedAt &&
    left.expiresAt === right.expiresAt &&
    left.payload === right.payload &&
    left.signature === right.signature
  );
}

export function sameUsageEntryV1(left: UsageLedgerEntryV1, right: UsageLedgerEntryV1): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.entryId === right.entryId &&
    sameScope(left.tenantScope, right.tenantScope) &&
    left.metric === right.metric &&
    left.bucket === right.bucket &&
    left.deltaUnits === right.deltaUnits &&
    left.sequence === right.sequence &&
    left.reservationId === right.reservationId &&
    left.idempotencyKey === right.idempotencyKey &&
    left.occurredAt === right.occurredAt
  );
}

export function sameUsageReservationV1(
  left: UsageReservationV1,
  right: UsageReservationV1,
): boolean {
  return (
    left.reservationId === right.reservationId &&
    sameScope(left.tenantScope, right.tenantScope) &&
    left.metric === right.metric &&
    left.reservedUnits === right.reservedUnits &&
    left.status === right.status &&
    left.createdAt === right.createdAt &&
    left.revision === right.revision
  );
}

export function sameUsageReservationExceptStatusV1(
  left: UsageReservationV1,
  right: UsageReservationV1,
): boolean {
  return (
    left.reservationId === right.reservationId &&
    sameScope(left.tenantScope, right.tenantScope) &&
    left.metric === right.metric &&
    left.reservedUnits === right.reservedUnits &&
    left.createdAt === right.createdAt
  );
}

export function validUsageReservationTransitionV1(
  current: UsageReservationV1,
  next: UsageReservationV1,
): boolean {
  return current.status === 'ACTIVE' && (next.status === 'FINALIZED' || next.status === 'RELEASED');
}

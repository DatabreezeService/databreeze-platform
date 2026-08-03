import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** BUA-001..BUA-022: provider-independent plans, leases, reservations, and usage. */
export const ENTITLEMENT_SCHEMA_VERSION_V1 = 1 as const;
export const OFFLINE_LEASE_MAX_SECONDS_V1 = 24 * 60 * 60;

export type PlanCodeV1 = 'free' | 'development' | 'admin_granted';
export type EntitlementStatusV1 = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
export type UsageMetricV1 =
  | 'artifact_bytes'
  | 'processing_seconds'
  | 'job_count'
  | 'member_count'
  | 'ocr_pages';
export type UsageBucketV1 = 'RESERVED' | 'COMMITTED';
export type ReservationStatusV1 = 'ACTIVE' | 'FINALIZED' | 'RELEASED';

export interface EntitlementQuotaV1 {
  readonly metric: UsageMetricV1;
  readonly limit: number;
}

export interface EntitlementPlanV1 {
  readonly schemaVersion: typeof ENTITLEMENT_SCHEMA_VERSION_V1;
  readonly planCode: PlanCodeV1;
  readonly displayNameKey: string;
  readonly features: readonly string[];
  readonly quotas: readonly EntitlementQuotaV1[];
  readonly providerIndependent: true;
}

export interface EntitlementSnapshotV1 {
  readonly schemaVersion: typeof ENTITLEMENT_SCHEMA_VERSION_V1;
  readonly snapshotId: StableIdentifierV1;
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId?: StableIdentifierV1;
  readonly planCode: PlanCodeV1;
  readonly status: EntitlementStatusV1;
  readonly revision: number;
  readonly securityEpoch: number;
  readonly effectiveAt: StrictUtcTimestampV1;
  readonly expiresAt?: StrictUtcTimestampV1;
  readonly features: readonly string[];
  readonly quotas: readonly EntitlementQuotaV1[];
}

export interface UsageLedgerEntryV1 {
  readonly schemaVersion: typeof ENTITLEMENT_SCHEMA_VERSION_V1;
  readonly entryId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly metric: UsageMetricV1;
  readonly bucket: UsageBucketV1;
  readonly deltaUnits: number;
  readonly sequence: number;
  readonly reservationId?: StableIdentifierV1;
  readonly idempotencyKey: string;
  readonly occurredAt: StrictUtcTimestampV1;
}

export interface UsageReservationV1 {
  readonly reservationId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly metric: UsageMetricV1;
  readonly reservedUnits: number;
  readonly status: ReservationStatusV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly revision: number;
}

export interface UsageLedgerStateV1 {
  readonly entries: readonly UsageLedgerEntryV1[];
  readonly reservations: readonly UsageReservationV1[];
}

export interface EntitlementLeaseV1 {
  readonly schemaVersion: typeof ENTITLEMENT_SCHEMA_VERSION_V1;
  readonly leaseId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly snapshotRevision: number;
  readonly securityEpoch: number;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly payload: string;
  readonly signature: string;
}

export interface LeaseSignatureVerifierV1 {
  verify(payload: string, signature: string): boolean;
}

export interface LeaseSignatureIssuerV1 {
  sign(payload: string): string;
}

export type EntitlementErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TEXT'
  | 'INVALID_PLAN'
  | 'INVALID_QUOTA'
  | 'INVALID_METRIC'
  | 'INVALID_UNITS'
  | 'INVALID_STATE'
  | 'ENTITLEMENT_SUSPENDED'
  | 'ENTITLEMENT_EXPIRED'
  | 'ENTITLEMENT_NOT_FOUND'
  | 'FEATURE_NOT_GRANTED'
  | 'QUOTA_EXCEEDED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'LEASE_INVALID'
  | 'LEASE_STALE';

export type EntitlementResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: EntitlementErrorCodeV1 };

const plans = new Set<PlanCodeV1>(['free', 'development', 'admin_granted']);
const metrics = new Set<UsageMetricV1>([
  'artifact_bytes',
  'processing_seconds',
  'job_count',
  'member_count',
  'ocr_pages',
]);
function rejected(code: EntitlementErrorCodeV1): EntitlementResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stableId(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function scope(input: unknown): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function positiveInteger(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

function scopeKey(value: TenantScopeV1): string {
  if (value.scopeType === 'organization') return `organization:${value.organizationId}`;
  if (value.scopeType === 'workspace')
    return `workspace:${value.organizationId}:${value.workspaceId}`;
  return `project:${value.organizationId}:${value.workspaceId}:${value.projectId}`;
}

function sameScope(left: TenantScopeV1, right: TenantScopeV1): boolean {
  return scopeKey(left) === scopeKey(right);
}

function quotaFor(snapshot: EntitlementSnapshotV1, metric: UsageMetricV1): number | undefined {
  return snapshot.quotas.find((quota) => quota.metric === metric)?.limit;
}

function usageTotal(
  state: UsageLedgerStateV1,
  tenantScope: TenantScopeV1,
  metric: UsageMetricV1,
  bucket: UsageBucketV1,
): number {
  return state.entries
    .filter(
      (entry) =>
        sameScope(entry.tenantScope, tenantScope) &&
        entry.metric === metric &&
        entry.bucket === bucket,
    )
    .reduce((total, entry) => total + entry.deltaUnits, 0);
}

function snapshotAllows(
  snapshot: EntitlementSnapshotV1,
  now: StrictUtcTimestampV1,
): EntitlementErrorCodeV1 | undefined {
  if (snapshot.status === 'SUSPENDED') return 'ENTITLEMENT_SUSPENDED';
  if (snapshot.status === 'EXPIRED') return 'ENTITLEMENT_EXPIRED';
  if (snapshot.expiresAt && Date.parse(now) >= Date.parse(snapshot.expiresAt))
    return 'ENTITLEMENT_EXPIRED';
  return undefined;
}

function validSnapshotStatus(input: unknown): input is EntitlementStatusV1 {
  return input === 'ACTIVE' || input === 'SUSPENDED' || input === 'EXPIRED';
}

/** Create an immutable organization/workspace entitlement snapshot from a governed plan. */
export function createEntitlementSnapshotV1(input: {
  readonly snapshotId: unknown;
  readonly tenantScope: unknown;
  readonly plan: unknown;
  readonly status: unknown;
  readonly revision: unknown;
  readonly securityEpoch: unknown;
  readonly effectiveAt: unknown;
  readonly expiresAt?: unknown;
}): EntitlementResultV1<EntitlementSnapshotV1> {
  const snapshotId = stableId(input.snapshotId);
  const tenantScope = scope(input.tenantScope);
  const plan = input.plan;
  const revision = positiveInteger(input.revision);
  const securityEpoch = positiveInteger(input.securityEpoch);
  const effectiveAt = timestamp(input.effectiveAt);
  const expiresAt = input.expiresAt === undefined ? undefined : timestamp(input.expiresAt);
  if (!snapshotId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope || tenantScope.scopeType === 'project') return rejected('INVALID_SCOPE');
  if (
    typeof plan !== 'object' ||
    plan === null ||
    (plan as Partial<EntitlementPlanV1>).schemaVersion !== ENTITLEMENT_SCHEMA_VERSION_V1 ||
    (plan as Partial<EntitlementPlanV1>).providerIndependent !== true
  )
    return rejected('INVALID_PLAN');
  const normalizedPlan = createPlanV1({
    planCode: (plan as Partial<EntitlementPlanV1>).planCode,
    displayNameKey: (plan as Partial<EntitlementPlanV1>).displayNameKey,
    features: (plan as Partial<EntitlementPlanV1>).features,
    quotas: (plan as Partial<EntitlementPlanV1>).quotas,
  });
  if (!normalizedPlan.accepted) return rejected('INVALID_PLAN');
  if (!validSnapshotStatus(input.status)) return rejected('INVALID_STATE');
  if (!revision || !securityEpoch) return rejected('INVALID_STATE');
  if (!effectiveAt || (input.expiresAt !== undefined && !expiresAt))
    return rejected('INVALID_TIMESTAMP');
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(effectiveAt))
    return rejected('INVALID_TIMESTAMP');
  const typedPlan = normalizedPlan.value;
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: ENTITLEMENT_SCHEMA_VERSION_V1,
      snapshotId,
      organizationId: tenantScope.organizationId,
      ...(tenantScope.scopeType === 'workspace' ? { workspaceId: tenantScope.workspaceId } : {}),
      planCode: typedPlan.planCode,
      status: input.status,
      revision,
      securityEpoch,
      effectiveAt,
      ...(expiresAt ? { expiresAt } : {}),
      features: Object.freeze([...typedPlan.features]),
      quotas: Object.freeze(typedPlan.quotas.map((quota) => Object.freeze({ ...quota }))),
    }),
  });
}

function canonicalLease(input: Omit<EntitlementLeaseV1, 'payload' | 'signature'>): string {
  return JSON.stringify({
    schemaVersion: input.schemaVersion,
    leaseId: input.leaseId,
    tenantScope: input.tenantScope,
    snapshotRevision: input.snapshotRevision,
    securityEpoch: input.securityEpoch,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
}

/** Issue a bounded, signed offline entitlement lease tied to a snapshot revision and epoch. */
export function createEntitlementLeaseV1(
  snapshot: EntitlementSnapshotV1,
  input: { readonly leaseId: unknown; readonly issuedAt: unknown; readonly expiresAt: unknown },
  signer: LeaseSignatureIssuerV1,
): EntitlementResultV1<EntitlementLeaseV1> {
  const leaseId = stableId(input.leaseId);
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = timestamp(input.expiresAt);
  const snapshotScope: TenantScopeV1 = snapshot.workspaceId
    ? { scopeType: 'workspace', organizationId: snapshot.organizationId, workspaceId: snapshot.workspaceId }
    : { scopeType: 'organization', organizationId: snapshot.organizationId };
  if (!leaseId) return rejected('INVALID_IDENTIFIER');
  if (!issuedAt || !expiresAt) return rejected('INVALID_TIMESTAMP');
  const blocked = snapshotAllows(snapshot, issuedAt);
  if (blocked) return rejected(blocked);
  if (
    !Number.isFinite(Date.parse(issuedAt)) ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(issuedAt) < Date.parse(snapshot.effectiveAt) ||
    Date.parse(expiresAt) <= Date.parse(issuedAt) ||
    Date.parse(expiresAt) - Date.parse(issuedAt) > OFFLINE_LEASE_MAX_SECONDS_V1 * 1_000 ||
    (snapshot.expiresAt !== undefined && Date.parse(expiresAt) > Date.parse(snapshot.expiresAt))
  )
    return rejected('LEASE_INVALID');
  const unsigned: Omit<EntitlementLeaseV1, 'payload' | 'signature'> = {
    schemaVersion: ENTITLEMENT_SCHEMA_VERSION_V1,
    leaseId,
    tenantScope: snapshotScope,
    snapshotRevision: snapshot.revision,
    securityEpoch: snapshot.securityEpoch,
    issuedAt,
    expiresAt,
  };
  const payload = canonicalLease(unsigned);
  const signature = text(signer.sign(payload), 2048);
  if (!signature) return rejected('LEASE_INVALID');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({ ...unsigned, payload, signature }),
  });
}

export function createPlanV1(input: {
  readonly planCode: unknown;
  readonly displayNameKey: unknown;
  readonly features: unknown;
  readonly quotas: unknown;
}): EntitlementResultV1<EntitlementPlanV1> {
  const planCode = input.planCode;
  const displayNameKey = text(input.displayNameKey, 120);
  if (typeof planCode !== 'string' || !plans.has(planCode as PlanCodeV1))
    return rejected('INVALID_PLAN');
  if (!displayNameKey) return rejected('INVALID_TEXT');
  if (!Array.isArray(input.features) || input.features.some((value) => !text(value, 120)))
    return rejected('INVALID_TEXT');
  if (!Array.isArray(input.quotas)) return rejected('INVALID_QUOTA');
  const quotas: EntitlementQuotaV1[] = [];
  for (const item of input.quotas) {
    if (typeof item !== 'object' || item === null) return rejected('INVALID_QUOTA');
    const metric = (item as Record<string, unknown>)['metric'];
    const limit = (item as Record<string, unknown>)['limit'];
    if (typeof metric !== 'string' || !metrics.has(metric as UsageMetricV1))
      return rejected('INVALID_METRIC');
    const normalizedLimit = positiveInteger(limit);
    if (!normalizedLimit) return rejected('INVALID_QUOTA');
    if (quotas.some((quota) => quota.metric === metric)) return rejected('INVALID_QUOTA');
    quotas.push(Object.freeze({ metric: metric as UsageMetricV1, limit: normalizedLimit }));
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: ENTITLEMENT_SCHEMA_VERSION_V1,
      planCode: planCode as PlanCodeV1,
      displayNameKey,
      features: Object.freeze(input.features as string[]),
      quotas: Object.freeze(quotas),
      providerIndependent: true,
    }),
  });
}

export function evaluateEntitlementV1(
  snapshot: EntitlementSnapshotV1,
  nowInput: unknown,
  feature: unknown,
): EntitlementResultV1<true> {
  const now = timestamp(nowInput);
  const featureKey = text(feature, 120);
  if (!now) return rejected('INVALID_TIMESTAMP');
  if (!featureKey) return rejected('INVALID_TEXT');
  const blocked = snapshotAllows(snapshot, now);
  if (blocked) return rejected(blocked);
  return snapshot.features.includes(featureKey)
    ? Object.freeze({ accepted: true, value: true })
    : rejected('FEATURE_NOT_GRANTED');
}

export function reserveUsageV1(
  snapshot: EntitlementSnapshotV1,
  state: UsageLedgerStateV1,
  input: {
    readonly reservationId: unknown;
    readonly entryId: unknown;
    readonly tenantScope: unknown;
    readonly metric: unknown;
    readonly requestedUnits: unknown;
    readonly idempotencyKey: unknown;
    readonly now: unknown;
  },
): EntitlementResultV1<{
  readonly state: UsageLedgerStateV1;
  readonly reservation: UsageReservationV1;
}> {
  const reservationId = stableId(input.reservationId);
  const entryId = stableId(input.entryId);
  const tenantScope = scope(input.tenantScope);
  const metric = input.metric;
  const requestedUnits = positiveInteger(input.requestedUnits);
  const idempotencyKey = text(input.idempotencyKey, 200);
  const now = timestamp(input.now);
  if (!reservationId || !entryId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (typeof metric !== 'string' || !metrics.has(metric as UsageMetricV1))
    return rejected('INVALID_METRIC');
  if (!requestedUnits) return rejected('INVALID_UNITS');
  if (!idempotencyKey) return rejected('INVALID_TEXT');
  if (!now) return rejected('INVALID_TIMESTAMP');
  const blocked = snapshotAllows(snapshot, now);
  if (blocked) return rejected(blocked);
  const existingReservation = state.reservations.find(
    (reservation) => reservation.reservationId === reservationId,
  );
  if (existingReservation) {
    return existingReservation.reservedUnits === requestedUnits &&
      existingReservation.metric === metric &&
      sameScope(existingReservation.tenantScope, tenantScope)
      ? Object.freeze({
          accepted: true,
          value: Object.freeze({ state, reservation: existingReservation }),
        })
      : rejected('IDEMPOTENCY_CONFLICT');
  }
  const existingEntry = state.entries.find((entry) => entry.idempotencyKey === idempotencyKey);
  if (existingEntry) return rejected('IDEMPOTENCY_CONFLICT');
  const limit = quotaFor(snapshot, metric as UsageMetricV1);
  if (limit === undefined) return rejected('QUOTA_EXCEEDED');
  const used = usageTotal(state, tenantScope, metric as UsageMetricV1, 'COMMITTED');
  const reserved = usageTotal(state, tenantScope, metric as UsageMetricV1, 'RESERVED');
  if (used + reserved + requestedUnits > limit) return rejected('QUOTA_EXCEEDED');
  const sequence =
    state.entries.filter(
      (entry) => sameScope(entry.tenantScope, tenantScope) && entry.metric === metric,
    ).length + 1;
  const entry: UsageLedgerEntryV1 = Object.freeze({
    schemaVersion: ENTITLEMENT_SCHEMA_VERSION_V1,
    entryId,
    tenantScope,
    metric: metric as UsageMetricV1,
    bucket: 'RESERVED',
    deltaUnits: requestedUnits,
    sequence,
    reservationId,
    idempotencyKey,
    occurredAt: now,
  });
  const reservation: UsageReservationV1 = Object.freeze({
    reservationId,
    tenantScope,
    metric: metric as UsageMetricV1,
    reservedUnits: requestedUnits,
    status: 'ACTIVE',
    createdAt: now,
    revision: 1,
  });
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      state: Object.freeze({
        entries: Object.freeze([...state.entries, entry]),
        reservations: Object.freeze([...state.reservations, reservation]),
      }),
      reservation,
    }),
  });
}

export function finalizeUsageV1(
  state: UsageLedgerStateV1,
  input: {
    readonly reservationId: unknown;
    readonly releaseEntryId: unknown;
    readonly commitEntryId: unknown;
    readonly committedUnits: unknown;
    readonly now: unknown;
    readonly idempotencyKey: unknown;
  },
): EntitlementResultV1<UsageLedgerStateV1> {
  return settleReservationV1(state, input, 'FINALIZED');
}

export function releaseUsageV1(
  state: UsageLedgerStateV1,
  input: {
    readonly reservationId: unknown;
    readonly releaseEntryId: unknown;
    readonly now: unknown;
    readonly idempotencyKey: unknown;
  },
): EntitlementResultV1<UsageLedgerStateV1> {
  return settleReservationV1(state, input, 'RELEASED');
}

function settleReservationV1(
  state: UsageLedgerStateV1,
  input: {
    readonly reservationId: unknown;
    readonly releaseEntryId: unknown;
    readonly commitEntryId?: unknown;
    readonly committedUnits?: unknown;
    readonly now: unknown;
    readonly idempotencyKey: unknown;
  },
  targetStatus: 'FINALIZED' | 'RELEASED',
): EntitlementResultV1<UsageLedgerStateV1> {
  const reservationId = stableId(input.reservationId);
  const releaseEntryId = stableId(input.releaseEntryId);
  const commitEntryId =
    input.commitEntryId === undefined ? undefined : stableId(input.commitEntryId);
  const now = timestamp(input.now);
  const idempotencyKey = text(input.idempotencyKey, 200);
  const reservation = state.reservations.find((item) => item.reservationId === reservationId);
  if (!reservationId || !releaseEntryId || !now) return rejected('INVALID_IDENTIFIER');
  if (!idempotencyKey) return rejected('INVALID_TEXT');
  if (!reservation) return rejected('INVALID_STATE');
  if (reservation.status !== 'ACTIVE') {
    const prior = state.entries.find((entry) => entry.idempotencyKey === idempotencyKey);
    return prior ? Object.freeze({ accepted: true, value: state }) : rejected('INVALID_STATE');
  }
  let committedUnitsValue = 0;
  if (targetStatus === 'FINALIZED') {
    const parsedCommittedUnits = positiveInteger(input.committedUnits);
    if (!parsedCommittedUnits || !commitEntryId) return rejected('INVALID_UNITS');
    committedUnitsValue = parsedCommittedUnits;
  }
  if (committedUnitsValue > reservation.reservedUnits) return rejected('INVALID_UNITS');
  if (state.entries.some((entry) => entry.idempotencyKey === idempotencyKey))
    return rejected('IDEMPOTENCY_CONFLICT');
  const baseSequence = state.entries.filter(
    (entry) =>
      sameScope(entry.tenantScope, reservation.tenantScope) && entry.metric === reservation.metric,
  ).length;
  const releaseEntry: UsageLedgerEntryV1 = Object.freeze({
    schemaVersion: ENTITLEMENT_SCHEMA_VERSION_V1,
    entryId: releaseEntryId,
    tenantScope: reservation.tenantScope,
    metric: reservation.metric,
    bucket: 'RESERVED',
    deltaUnits: -reservation.reservedUnits,
    sequence: baseSequence + 1,
    reservationId,
    idempotencyKey,
    occurredAt: now,
  });
  const entries = [...state.entries, releaseEntry];
  if (targetStatus === 'FINALIZED') {
    const commitEntry: UsageLedgerEntryV1 = Object.freeze({
      schemaVersion: ENTITLEMENT_SCHEMA_VERSION_V1,
      entryId: commitEntryId as StableIdentifierV1,
      tenantScope: reservation.tenantScope,
      metric: reservation.metric,
      bucket: 'COMMITTED',
      deltaUnits: committedUnitsValue,
      sequence: baseSequence + 2,
      reservationId,
      idempotencyKey: `${idempotencyKey}:commit`,
      occurredAt: now,
    });
    entries.push(commitEntry);
  }
  const updatedReservation = Object.freeze({
    ...reservation,
    status: targetStatus,
    revision: reservation.revision + 1,
  });
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      entries: Object.freeze(entries),
      reservations: Object.freeze(
        state.reservations.map((item) =>
          item.reservationId === reservationId ? updatedReservation : item,
        ),
      ),
    }),
  });
}

export function acceptEntitlementLeaseV1(
  lease: EntitlementLeaseV1,
  input: {
    readonly now: unknown;
    readonly tenantScope: unknown;
    readonly snapshotRevision: unknown;
    readonly securityEpoch: unknown;
  },
  verifier: LeaseSignatureVerifierV1,
): EntitlementResultV1<true> {
  const now = timestamp(input.now);
  const tenantScope = scope(input.tenantScope);
  const leaseId = stableId(lease.leaseId);
  const leaseScope = scope(lease.tenantScope);
  const issuedAt = timestamp(lease.issuedAt);
  const expiresAt = timestamp(lease.expiresAt);
  const snapshotRevision = positiveInteger(input.snapshotRevision);
  const securityEpoch = positiveInteger(input.securityEpoch);
  if (!now) return rejected('INVALID_TIMESTAMP');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!snapshotRevision || !securityEpoch) return rejected('INVALID_STATE');
  if (
    !leaseId ||
    !leaseScope ||
    leaseScope.scopeType === 'project' ||
    !issuedAt ||
    !expiresAt ||
    lease.schemaVersion !== ENTITLEMENT_SCHEMA_VERSION_V1 ||
    !positiveInteger(lease.snapshotRevision) ||
    !positiveInteger(lease.securityEpoch) ||
    !text(lease.payload, 10000) ||
    !text(lease.signature, 2048) ||
    Date.parse(expiresAt) <= Date.parse(issuedAt) ||
    Date.parse(expiresAt) - Date.parse(issuedAt) > OFFLINE_LEASE_MAX_SECONDS_V1 * 1_000 ||
    lease.payload !==
      canonicalLease({
        schemaVersion: ENTITLEMENT_SCHEMA_VERSION_V1,
        leaseId,
        tenantScope: leaseScope,
        snapshotRevision: lease.snapshotRevision,
        securityEpoch: lease.securityEpoch,
        issuedAt,
        expiresAt,
      })
  )
    return rejected('LEASE_INVALID');
  if (!sameScope(leaseScope, tenantScope)) return rejected('LEASE_STALE');
  if (lease.snapshotRevision !== snapshotRevision || lease.securityEpoch !== securityEpoch)
    return rejected('LEASE_STALE');
  let signatureValid = false;
  try {
    signatureValid = verifier.verify(lease.payload, lease.signature);
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) return rejected('LEASE_INVALID');
  if (
    Date.parse(now) < Date.parse(issuedAt) ||
    Date.parse(now) >= Date.parse(expiresAt)
  )
    return rejected('LEASE_INVALID');
  return Object.freeze({ accepted: true, value: true });
}

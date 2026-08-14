import {
  createPlanV1,
  type EntitlementPlanV1,
  type EntitlementQuotaV1,
  type EntitlementSnapshotV1,
  type UsageBucketV1,
  type UsageLedgerEntryV1,
  type UsageLedgerStateV1,
  type UsageMetricV1,
  type UsageReservationV1,
} from '@databreeze/domain/entitlements/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  tenantScopeKeyV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  EntitlementRepositoryPortV1,
  EntitlementTransactionPortV1,
} from '../application/entitlement-repository.port.js';
import {
  sameEntitlementPlanV1,
  sameEntitlementSnapshotV1,
  sameUsageEntryV1,
  sameUsageReservationExceptStatusV1,
  sameUsageReservationV1,
  validUsageReservationTransitionV1,
} from '../application/entitlement-equality.js';

const planCodes = new Set(['free', 'development', 'admin_granted']);
const statuses = new Set(['ACTIVE', 'SUSPENDED', 'EXPIRED']);
const metrics = new Set([
  'artifact_bytes',
  'processing_seconds',
  'job_count',
  'member_count',
  'ocr_pages',
]);
const buckets = new Set(['RESERVED', 'COMMITTED']);
const reservationStatuses = new Set(['ACTIVE', 'FINALIZED', 'RELEASED']);

export interface EntitlementPlanDatabaseRowV1 {
  readonly planCode: string;
  readonly schemaVersion: number;
  readonly displayNameKey: string;
  readonly features: unknown;
  readonly quotas: unknown;
  readonly providerIndependent: boolean;
  readonly createdAt: Date;
}

export interface EntitlementSnapshotDatabaseRowV1 {
  readonly id: string;
  readonly schemaVersion: number;
  readonly scopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly planCode: string;
  readonly status: string;
  readonly revision: number;
  readonly securityEpoch: number;
  readonly effectiveAt: Date;
  readonly expiresAt: Date | null;
  readonly features: unknown;
  readonly quotas: unknown;
  readonly createdAt: Date;
}

export interface UsageLedgerEntryDatabaseRowV1 {
  readonly id: string;
  readonly schemaVersion: number;
  readonly scopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly metric: string;
  readonly bucket: string;
  readonly deltaUnits: bigint | number;
  readonly sequence: number;
  readonly reservationId: string | null;
  readonly idempotencyKey: string;
  readonly occurredAt: Date;
  readonly createdAt: Date;
}

export interface UsageReservationDatabaseRowV1 {
  readonly id: string;
  readonly scopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly metric: string;
  readonly reservedUnits: bigint | number;
  readonly status: string;
  readonly createdAt: Date;
  readonly revision: number;
  readonly updatedAt: Date;
}

interface EntitlementPlanCreateDataV1 extends Omit<EntitlementPlanDatabaseRowV1, 'createdAt'> {
  readonly createdAt: Date;
}
interface EntitlementSnapshotCreateDataV1
  extends Omit<EntitlementSnapshotDatabaseRowV1, 'createdAt'> {
  readonly createdAt: Date;
}
interface UsageLedgerEntryCreateDataV1 extends Omit<UsageLedgerEntryDatabaseRowV1, 'createdAt'> {
  readonly createdAt: Date;
}
interface UsageReservationCreateDataV1 extends Omit<UsageReservationDatabaseRowV1, 'updatedAt'> {
  readonly updatedAt: Date;
}

interface DelegateV1<TRow, TCreate> {
  create(input: { readonly data: TCreate }): Promise<TRow>;
  findUnique(input: {
    readonly where: { readonly id?: string; readonly planCode?: string };
  }): Promise<TRow | null>;
  findFirst(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<TRow | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<readonly TRow[]>;
  update?(input: {
    readonly where: { readonly id: string };
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<TRow>;
  updateMany?(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
}

export interface EntitlementDatabaseClientV1 {
  readonly entitlementPlanRecord: DelegateV1<
    EntitlementPlanDatabaseRowV1,
    EntitlementPlanCreateDataV1
  >;
  readonly entitlementSnapshotRecord: DelegateV1<
    EntitlementSnapshotDatabaseRowV1,
    EntitlementSnapshotCreateDataV1
  >;
  readonly usageLedgerEntryRecord: DelegateV1<
    UsageLedgerEntryDatabaseRowV1,
    UsageLedgerEntryCreateDataV1
  >;
  readonly usageReservationRecord: DelegateV1<
    UsageReservationDatabaseRowV1,
    UsageReservationCreateDataV1
  >;
  $transaction<TValue>(
    work: (transaction: EntitlementDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
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

function integerUnits(input: bigint | number): number {
  const value = typeof input === 'bigint' ? Number(input) : input;
  if (!Number.isSafeInteger(value)) throw new Error('BUA_PERSISTED_UNITS_INVALID');
  return value;
}

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
  } as const;
}

function databaseUsageScope(scope: TenantScopeV1) {
  return {
    ...databaseScope(scope),
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function scopeKey(scope: TenantScopeV1): string {
  if (scope.scopeType === 'organization') return `organization:${scope.organizationId}`;
  if (scope.scopeType === 'workspace')
    return `workspace:${scope.organizationId}:${scope.workspaceId}`;
  return `project:${scope.organizationId}:${scope.workspaceId}:${scope.projectId}`;
}

function persistedScope(row: {
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId?: string | null;
}): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === undefined || row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('BUA_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function parseQuotas(input: unknown): readonly EntitlementQuotaV1[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values: EntitlementQuotaV1[] = [];
  for (const item of input) {
    if (typeof item !== 'object' || item === null) return undefined;
    const metric = (item as Record<string, unknown>)['metric'];
    const limit = (item as Record<string, unknown>)['limit'];
    const normalizedLimit = positiveInteger(limit);
    if (typeof metric !== 'string' || !metrics.has(metric) || normalizedLimit === undefined)
      return undefined;
    values.push({ metric: metric as UsageMetricV1, limit: normalizedLimit });
  }
  return Object.freeze(values.map((quota) => Object.freeze(quota)));
}

function parseFeatures(input: unknown): readonly string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input.map((value) => text(value, 120));
  return values.every((value): value is string => value !== undefined)
    ? Object.freeze(values)
    : undefined;
}

function persistedPlan(row: EntitlementPlanDatabaseRowV1): EntitlementPlanV1 {
  const features = parseFeatures(row.features);
  const quotas = parseQuotas(row.quotas);
  const created = createPlanV1({
    planCode: row.planCode,
    displayNameKey: row.displayNameKey,
    features,
    quotas,
  });
  if (
    row.schemaVersion !== 1 ||
    !row.providerIndependent ||
    !planCodes.has(row.planCode) ||
    !features ||
    !quotas ||
    !created.accepted
  )
    throw new Error('BUA_PERSISTED_PLAN_INVALID');
  return created.value;
}

function persistedSnapshot(row: EntitlementSnapshotDatabaseRowV1): EntitlementSnapshotV1 {
  const snapshotId = parseStableIdentifierV1(row.id);
  const organizationId = parseStableIdentifierV1(row.organizationId);
  const workspaceId =
    row.workspaceId === null ? undefined : parseStableIdentifierV1(row.workspaceId);
  const scope = persistedScope({ ...row, projectId: null });
  const effectiveAt = parseStrictUtcTimestampV1(row.effectiveAt.toISOString());
  const expiresAt =
    row.expiresAt === null ? undefined : parseStrictUtcTimestampV1(row.expiresAt.toISOString());
  const features = parseFeatures(row.features);
  const quotas = parseQuotas(row.quotas);
  if (
    row.schemaVersion !== 1 ||
    !snapshotId.accepted ||
    !organizationId.accepted ||
    (row.workspaceId !== null && !workspaceId?.accepted) ||
    !effectiveAt.accepted ||
    (row.expiresAt !== null && !expiresAt?.accepted) ||
    !features ||
    !quotas ||
    !planCodes.has(row.planCode) ||
    !statuses.has(row.status) ||
    !positiveInteger(row.revision) ||
    !positiveInteger(row.securityEpoch)
  )
    throw new Error('BUA_PERSISTED_SNAPSHOT_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    snapshotId: snapshotId.value,
    organizationId: organizationId.value,
    ...(scope.scopeType === 'workspace' && workspaceId?.accepted
      ? { workspaceId: workspaceId.value }
      : {}),
    planCode: row.planCode as EntitlementSnapshotV1['planCode'],
    status: row.status as EntitlementSnapshotV1['status'],
    revision: row.revision,
    securityEpoch: row.securityEpoch,
    effectiveAt: effectiveAt.value,
    ...(expiresAt?.accepted ? { expiresAt: expiresAt.value } : {}),
    features,
    quotas,
  });
}

function persistedEntry(row: UsageLedgerEntryDatabaseRowV1): UsageLedgerEntryV1 {
  const entryId = parseStableIdentifierV1(row.id);
  const organizationId = parseStableIdentifierV1(row.organizationId);
  const workspaceId =
    row.workspaceId === null ? undefined : parseStableIdentifierV1(row.workspaceId);
  const reservationId =
    row.reservationId === null ? undefined : parseStableIdentifierV1(row.reservationId);
  const occurredAt = parseStrictUtcTimestampV1(row.occurredAt.toISOString());
  const scope = persistedScope(row);
  if (
    row.schemaVersion !== 1 ||
    !entryId.accepted ||
    !organizationId.accepted ||
    (row.workspaceId !== null && !workspaceId?.accepted) ||
    (row.reservationId !== null && !reservationId?.accepted) ||
    !occurredAt.accepted ||
    !metrics.has(row.metric) ||
    !buckets.has(row.bucket) ||
    !positiveInteger(row.sequence) ||
    !text(row.idempotencyKey, 200)
  )
    throw new Error('BUA_PERSISTED_USAGE_ENTRY_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    entryId: entryId.value,
    tenantScope: scope,
    metric: row.metric as UsageMetricV1,
    bucket: row.bucket as UsageBucketV1,
    deltaUnits: integerUnits(row.deltaUnits),
    sequence: row.sequence,
    ...(reservationId?.accepted ? { reservationId: reservationId.value } : {}),
    idempotencyKey: row.idempotencyKey,
    occurredAt: occurredAt.value,
  });
}

function persistedReservation(row: UsageReservationDatabaseRowV1): UsageReservationV1 {
  const reservationId = parseStableIdentifierV1(row.id);
  const occurredAt = parseStrictUtcTimestampV1(row.createdAt.toISOString());
  const scope = persistedScope(row);
  if (
    !reservationId.accepted ||
    !occurredAt.accepted ||
    !metrics.has(row.metric) ||
    !reservationStatuses.has(row.status) ||
    !positiveInteger(row.revision) ||
    !Number.isSafeInteger(integerUnits(row.reservedUnits))
  )
    throw new Error('BUA_PERSISTED_RESERVATION_INVALID');
  return Object.freeze({
    reservationId: reservationId.value,
    tenantScope: scope,
    metric: row.metric as UsageMetricV1,
    reservedUnits: integerUnits(row.reservedUnits),
    status: row.status as UsageReservationV1['status'],
    createdAt: occurredAt.value,
    revision: row.revision,
  });
}

function planCreateData(plan: EntitlementPlanV1): EntitlementPlanCreateDataV1 {
  return {
    planCode: plan.planCode,
    schemaVersion: plan.schemaVersion,
    displayNameKey: plan.displayNameKey,
    features: plan.features,
    quotas: plan.quotas,
    providerIndependent: plan.providerIndependent,
    createdAt: new Date(),
  };
}

function snapshotCreateData(snapshot: EntitlementSnapshotV1): EntitlementSnapshotCreateDataV1 {
  return {
    ...databaseScope(
      snapshot.workspaceId
        ? {
            scopeType: 'workspace',
            organizationId: snapshot.organizationId,
            workspaceId: snapshot.workspaceId,
          }
        : { scopeType: 'organization', organizationId: snapshot.organizationId },
    ),
    id: snapshot.snapshotId,
    schemaVersion: snapshot.schemaVersion,
    scopeKey: scopeKey(
      snapshot.workspaceId
        ? {
            scopeType: 'workspace',
            organizationId: snapshot.organizationId,
            workspaceId: snapshot.workspaceId,
          }
        : { scopeType: 'organization', organizationId: snapshot.organizationId },
    ),
    planCode: snapshot.planCode,
    status: snapshot.status,
    revision: snapshot.revision,
    securityEpoch: snapshot.securityEpoch,
    effectiveAt: new Date(snapshot.effectiveAt),
    expiresAt: snapshot.expiresAt ? new Date(snapshot.expiresAt) : null,
    features: snapshot.features,
    quotas: snapshot.quotas,
    createdAt: new Date(),
  };
}

function entryCreateData(entry: UsageLedgerEntryV1): UsageLedgerEntryCreateDataV1 {
  return {
    ...databaseUsageScope(entry.tenantScope),
    id: entry.entryId,
    schemaVersion: entry.schemaVersion,
    scopeKey: scopeKey(entry.tenantScope),
    metric: entry.metric,
    bucket: entry.bucket,
    deltaUnits: BigInt(entry.deltaUnits),
    sequence: entry.sequence,
    reservationId: entry.reservationId ?? null,
    idempotencyKey: entry.idempotencyKey,
    occurredAt: new Date(entry.occurredAt),
    createdAt: new Date(),
  };
}

function reservationCreateData(reservation: UsageReservationV1): UsageReservationCreateDataV1 {
  return {
    ...databaseUsageScope(reservation.tenantScope),
    id: reservation.reservationId,
    scopeKey: scopeKey(reservation.tenantScope),
    metric: reservation.metric,
    reservedUnits: BigInt(reservation.reservedUnits),
    status: reservation.status,
    createdAt: new Date(reservation.createdAt),
    revision: reservation.revision,
    updatedAt: new Date(),
  };
}

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function inheritedUsageScopeKeys(scope: TenantScopeV1): readonly string[] | undefined {
  if (scope.scopeType === 'organization') return undefined;
  const inherited = [
    tenantScopeKeyV1({ scopeType: 'organization', organizationId: scope.organizationId }),
    tenantScopeKeyV1({
      scopeType: 'workspace',
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
    }),
  ];
  if (scope.scopeType === 'project') inherited.push(tenantScopeKeyV1(scope));
  return Object.freeze(inherited);
}

class PrismaEntitlementTransactionAdapter implements EntitlementTransactionPortV1 {
  public constructor(private readonly client: EntitlementDatabaseClientV1) {}

  public async savePlan(plan: EntitlementPlanV1): Promise<void> {
    const existing = await this.client.entitlementPlanRecord.findUnique({
      where: { planCode: plan.planCode },
    });
    if (existing !== null) {
      if (!sameEntitlementPlanV1(persistedPlan(existing), plan))
        throw new Error('BUA_IMMUTABLE_PLAN');
      return;
    }
    await this.client.entitlementPlanRecord.create({ data: planCreateData(plan) });
  }

  public async findPlan(
    planCode: EntitlementPlanV1['planCode'],
  ): Promise<EntitlementPlanV1 | undefined> {
    const row = await this.client.entitlementPlanRecord.findUnique({ where: { planCode } });
    return row === null ? undefined : persistedPlan(row);
  }

  public async saveSnapshot(
    context: IamTenantContextV1,
    snapshot: EntitlementSnapshotV1,
  ): Promise<void> {
    const scope = snapshot.workspaceId
      ? {
          scopeType: 'workspace' as const,
          organizationId: snapshot.organizationId,
          workspaceId: snapshot.workspaceId,
        }
      : { scopeType: 'organization' as const, organizationId: snapshot.organizationId };
    if (!tenantScopeContainsV1(context.tenantScope, scope))
      throw new Error('BUA_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.entitlementSnapshotRecord.findFirst({
      where: {
        id: snapshot.snapshotId,
        organizationId: snapshot.organizationId,
        scopeKey: scopeKey(scope),
      },
    });
    if (existing !== null) {
      if (!sameEntitlementSnapshotV1(persistedSnapshot(existing), snapshot))
        throw new Error('BUA_IMMUTABLE_SNAPSHOT');
      return;
    }
    await this.client.entitlementSnapshotRecord.create({ data: snapshotCreateData(snapshot) });
  }

  public async findSnapshot(
    context: IamTenantContextV1,
    snapshotId: EntitlementSnapshotV1['snapshotId'],
  ): Promise<EntitlementSnapshotV1 | undefined> {
    const workspaceId =
      context.tenantScope.scopeType === 'organization'
        ? undefined
        : context.tenantScope.workspaceId;
    const row = await this.client.entitlementSnapshotRecord.findFirst({
      where: {
        id: snapshotId,
        organizationId: context.tenantScope.organizationId,
        ...(workspaceId === undefined ? {} : { OR: [{ workspaceId: null }, { workspaceId }] }),
      },
    });
    if (row === null) return undefined;
    const snapshot = persistedSnapshot(row);
    const scope = snapshot.workspaceId
      ? {
          scopeType: 'workspace' as const,
          organizationId: snapshot.organizationId,
          workspaceId: snapshot.workspaceId,
        }
      : { scopeType: 'organization' as const, organizationId: snapshot.organizationId };
    return visible(context.tenantScope, scope) ? snapshot : undefined;
  }

  public async listUsageState(context: IamTenantContextV1): Promise<UsageLedgerStateV1> {
    const scopeKeys = inheritedUsageScopeKeys(context.tenantScope);
    const where =
      scopeKeys === undefined
        ? { organizationId: context.tenantScope.organizationId }
        : { scopeKey: { in: scopeKeys } };
    const [entryRows, reservationRows] = await Promise.all([
      this.client.usageLedgerEntryRecord.findMany({
        where,
        orderBy: { sequence: 'asc' },
      }),
      this.client.usageReservationRecord.findMany({
        where,
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return Object.freeze({
      entries: Object.freeze(
        entryRows
          .filter((row) => visible(context.tenantScope, persistedScope(row)))
          .map(persistedEntry),
      ),
      reservations: Object.freeze(
        reservationRows
          .filter((row) => visible(context.tenantScope, persistedScope(row)))
          .map(persistedReservation),
      ),
    });
  }

  public async persistUsageState(
    context: IamTenantContextV1,
    state: UsageLedgerStateV1,
  ): Promise<void> {
    if (
      new Set(state.entries.map((entry) => entry.entryId)).size !== state.entries.length ||
      new Set(state.reservations.map((reservation) => reservation.reservationId)).size !==
        state.reservations.length
    )
      throw new Error('BUA_USAGE_STATE_CONFLICT');
    for (const entry of state.entries) {
      if (!tenantScopeContainsV1(context.tenantScope, entry.tenantScope))
        throw new Error('BUA_SCOPE_NARROWING_REQUIRED');
      const existing = await this.client.usageLedgerEntryRecord.findFirst({
        where: {
          id: entry.entryId,
          organizationId: entry.tenantScope.organizationId,
          scopeKey: scopeKey(entry.tenantScope),
        },
      });
      if (existing !== null) {
        if (!sameUsageEntryV1(persistedEntry(existing), entry))
          throw new Error('BUA_IMMUTABLE_USAGE_ENTRY');
        continue;
      }
      await this.client.usageLedgerEntryRecord.create({ data: entryCreateData(entry) });
    }
    for (const reservation of state.reservations) {
      if (!tenantScopeContainsV1(context.tenantScope, reservation.tenantScope))
        throw new Error('BUA_SCOPE_NARROWING_REQUIRED');
      const existing = await this.client.usageReservationRecord.findFirst({
        where: {
          id: reservation.reservationId,
          organizationId: reservation.tenantScope.organizationId,
          scopeKey: scopeKey(reservation.tenantScope),
        },
      });
      if (existing === null) {
        await this.client.usageReservationRecord.create({
          data: reservationCreateData(reservation),
        });
        continue;
      }
      const current = persistedReservation(existing);
      if (sameUsageReservationV1(current, reservation)) continue;
      if (
        !sameUsageReservationExceptStatusV1(current, reservation) ||
        reservation.revision !== current.revision + 1 ||
        !validUsageReservationTransitionV1(current, reservation)
      )
        throw new Error('BUA_RESERVATION_CONFLICT');
      if (!this.client.usageReservationRecord.updateMany) throw new Error('BUA_UPDATE_UNAVAILABLE');
      const result = await this.client.usageReservationRecord.updateMany({
        where: {
          id: reservation.reservationId,
          organizationId: reservation.tenantScope.organizationId,
          scopeKey: scopeKey(reservation.tenantScope),
          revision: current.revision,
        },
        data: { status: reservation.status, revision: reservation.revision, updatedAt: new Date() },
      });
      if (result.count !== 1) throw new Error('BUA_RESERVATION_CONFLICT');
    }
  }
}

/** BUA-023: adapt an existing owner transaction without opening a nested transaction. */
export function entitlementTransactionForDatabase(
  client: EntitlementDatabaseClientV1,
): EntitlementTransactionPortV1 {
  return new PrismaEntitlementTransactionAdapter(client);
}

export class PrismaEntitlementRepositoryAdapter implements EntitlementRepositoryPortV1 {
  public constructor(private readonly client: EntitlementDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: EntitlementTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaEntitlementTransactionAdapter(transaction)),
    );
  }

  public savePlan(plan: EntitlementPlanV1): Promise<void> {
    return new PrismaEntitlementTransactionAdapter(this.client).savePlan(plan);
  }

  public findPlan(planCode: EntitlementPlanV1['planCode']): Promise<EntitlementPlanV1 | undefined> {
    return new PrismaEntitlementTransactionAdapter(this.client).findPlan(planCode);
  }

  public saveSnapshot(context: IamTenantContextV1, snapshot: EntitlementSnapshotV1): Promise<void> {
    return new PrismaEntitlementTransactionAdapter(this.client).saveSnapshot(context, snapshot);
  }

  public findSnapshot(
    context: IamTenantContextV1,
    snapshotId: EntitlementSnapshotV1['snapshotId'],
  ): Promise<EntitlementSnapshotV1 | undefined> {
    return new PrismaEntitlementTransactionAdapter(this.client).findSnapshot(context, snapshotId);
  }

  public listUsageState(context: IamTenantContextV1): Promise<UsageLedgerStateV1> {
    return new PrismaEntitlementTransactionAdapter(this.client).listUsageState(context);
  }

  public persistUsageState(context: IamTenantContextV1, state: UsageLedgerStateV1): Promise<void> {
    return this.client.$transaction((transaction) =>
      new PrismaEntitlementTransactionAdapter(transaction).persistUsageState(context, state),
    );
  }
}

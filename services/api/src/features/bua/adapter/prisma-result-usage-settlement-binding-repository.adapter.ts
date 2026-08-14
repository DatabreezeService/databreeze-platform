import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  tenantScopeKeyV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ResultUsageSettlementBindingRepositoryPortV1,
  ResultUsageSettlementBindingTransactionPortV1,
  ResultUsageSettlementBindingV1,
  ResultUsageSettlementFormulaV1,
  ResultUsageSettlementStateV1,
} from '../application/result-usage-settlement-binding.port.js';

const METERS = new Set([
  'artifact_bytes',
  'processing_seconds',
  'job_count',
  'member_count',
  'ocr_pages',
]);
const STATES = new Set<ResultUsageSettlementStateV1>(['PREPARED', 'SETTLED', 'RELEASED']);
const FORMULAS = new Set<ResultUsageSettlementFormulaV1>([
  'COMMITTED_OUTPUT_BYTES',
  'SUCCESSFUL_JOB_UNIT',
]);

export interface ResultUsageSettlementBindingDatabaseRowV1 {
  readonly id: string;
  readonly schemaVersion: number;
  readonly scopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly jobId: string;
  readonly reservationId: string;
  readonly meter: string;
  readonly settlementFormula: string;
  readonly maximumAdmittedUnits: bigint | number;
  readonly entitlementDecisionSubjectHash: string;
  readonly admissionIdempotencyKey: string;
  readonly state: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revision: number;
}

interface ResultUsageSettlementBindingDelegateV1 {
  create(input: {
    readonly data: ResultUsageSettlementBindingDatabaseRowV1;
  }): Promise<ResultUsageSettlementBindingDatabaseRowV1>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<ResultUsageSettlementBindingDatabaseRowV1 | null>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
}

export interface ResultUsageSettlementBindingDatabaseClientV1 {
  readonly resultUsageSettlementBindingRecord: ResultUsageSettlementBindingDelegateV1;
  $transaction<TValue>(
    work: (transaction: ResultUsageSettlementBindingDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeKey: tenantScopeKeyV1(scope),
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function parsedScope(row: ResultUsageSettlementBindingDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted || tenantScopeKeyV1(parsed.value) !== row.scopeKey)
    throw new Error('BUA_PERSISTED_RESULT_USAGE_SETTLEMENT_BINDING_INVALID');
  return parsed.value;
}

function units(value: bigint | number): number {
  const normalized = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || normalized < 1)
    throw new Error('BUA_PERSISTED_RESULT_USAGE_SETTLEMENT_BINDING_INVALID');
  return normalized;
}

function compatible(meter: string, formula: string): boolean {
  return (
    (meter === 'artifact_bytes' && formula === 'COMMITTED_OUTPUT_BYTES') ||
    (meter === 'job_count' && formula === 'SUCCESSFUL_JOB_UNIT')
  );
}

function persisted(row: ResultUsageSettlementBindingDatabaseRowV1): ResultUsageSettlementBindingV1 {
  const bindingId = parseStableIdentifierV1(row.id);
  const jobId = parseStableIdentifierV1(row.jobId);
  const reservationId = parseStableIdentifierV1(row.reservationId);
  const createdAt = parseStrictUtcTimestampV1(row.createdAt.toISOString());
  const expiresAt = parseStrictUtcTimestampV1(row.expiresAt.toISOString());
  const maximumAdmittedUnits = units(row.maximumAdmittedUnits);
  const scope = parsedScope(row);
  if (
    row.schemaVersion !== 1 ||
    !bindingId.accepted ||
    !jobId.accepted ||
    !reservationId.accepted ||
    !createdAt.accepted ||
    !expiresAt.accepted ||
    Date.parse(expiresAt.value) <= Date.parse(createdAt.value) ||
    !METERS.has(row.meter) ||
    !FORMULAS.has(row.settlementFormula as ResultUsageSettlementFormulaV1) ||
    !compatible(row.meter, row.settlementFormula) ||
    !STATES.has(row.state as ResultUsageSettlementStateV1) ||
    !/^[0-9a-f]{64}$/u.test(row.entitlementDecisionSubjectHash) ||
    row.admissionIdempotencyKey.length < 1 ||
    row.admissionIdempotencyKey.length > 200 ||
    /\p{Cc}/u.test(row.admissionIdempotencyKey) ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  )
    throw new Error('BUA_PERSISTED_RESULT_USAGE_SETTLEMENT_BINDING_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    bindingId: bindingId.value,
    tenantScope: scope,
    jobId: jobId.value,
    reservationId: reservationId.value,
    meter: row.meter as ResultUsageSettlementBindingV1['meter'],
    settlementFormula: row.settlementFormula as ResultUsageSettlementFormulaV1,
    maximumAdmittedUnits,
    entitlementDecisionSubjectHash: row.entitlementDecisionSubjectHash,
    admissionIdempotencyKey: row.admissionIdempotencyKey,
    state: row.state as ResultUsageSettlementStateV1,
    createdAt: createdAt.value,
    expiresAt: expiresAt.value,
    revision: row.revision,
  });
}

function same(
  left: ResultUsageSettlementBindingV1,
  right: ResultUsageSettlementBindingV1,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createData(
  binding: ResultUsageSettlementBindingV1,
): ResultUsageSettlementBindingDatabaseRowV1 {
  if (
    binding.state !== 'PREPARED' ||
    binding.revision !== 1 ||
    !compatible(binding.meter, binding.settlementFormula) ||
    !Number.isSafeInteger(binding.maximumAdmittedUnits) ||
    binding.maximumAdmittedUnits < 1
  )
    throw new Error('BUA_RESULT_USAGE_SETTLEMENT_BINDING_INVALID');
  return {
    ...databaseScope(binding.tenantScope),
    id: binding.bindingId,
    schemaVersion: binding.schemaVersion,
    jobId: binding.jobId,
    reservationId: binding.reservationId,
    meter: binding.meter,
    settlementFormula: binding.settlementFormula,
    maximumAdmittedUnits: BigInt(binding.maximumAdmittedUnits),
    entitlementDecisionSubjectHash: binding.entitlementDecisionSubjectHash,
    admissionIdempotencyKey: binding.admissionIdempotencyKey,
    state: binding.state,
    createdAt: new Date(binding.createdAt),
    expiresAt: new Date(binding.expiresAt),
    revision: binding.revision,
  };
}

export class PrismaResultUsageSettlementBindingTransaction
  implements ResultUsageSettlementBindingTransactionPortV1
{
  public constructor(private readonly client: ResultUsageSettlementBindingDatabaseClientV1) {}

  public async save(
    context: IamTenantContextV1,
    binding: ResultUsageSettlementBindingV1,
  ): Promise<void> {
    if (!tenantScopesEqualV1(context.tenantScope, binding.tenantScope))
      throw new Error('BUA_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.resultUsageSettlementBindingRecord.findFirst({
      where: { id: binding.bindingId, ...databaseScope(context.tenantScope) },
    });
    if (existing !== null) {
      if (!same(persisted(existing), binding))
        throw new Error('BUA_IMMUTABLE_RESULT_USAGE_SETTLEMENT_BINDING');
      return;
    }
    await this.client.resultUsageSettlementBindingRecord.create({ data: createData(binding) });
  }

  public async find(
    context: IamTenantContextV1,
    bindingId: ResultUsageSettlementBindingV1['bindingId'],
  ): Promise<ResultUsageSettlementBindingV1 | undefined> {
    const row = await this.client.resultUsageSettlementBindingRecord.findFirst({
      where: { id: bindingId, ...databaseScope(context.tenantScope) },
    });
    return row === null ? undefined : persisted(row);
  }

  public async markSettled(
    context: IamTenantContextV1,
    bindingId: ResultUsageSettlementBindingV1['bindingId'],
    expectedRevision: number,
  ): Promise<ResultUsageSettlementBindingV1> {
    const current = await this.find(context, bindingId);
    if (
      current === undefined ||
      current.state !== 'PREPARED' ||
      current.revision !== expectedRevision
    )
      throw new Error('BUA_SETTLEMENT_BINDING_CONFLICT');
    const result = await this.client.resultUsageSettlementBindingRecord.updateMany({
      where: {
        id: bindingId,
        ...databaseScope(context.tenantScope),
        state: 'PREPARED',
        revision: expectedRevision,
      },
      data: { state: 'SETTLED', revision: expectedRevision + 1 },
    });
    if (result.count !== 1) throw new Error('BUA_SETTLEMENT_BINDING_CONFLICT');
    return Object.freeze({ ...current, state: 'SETTLED', revision: expectedRevision + 1 });
  }
}

export function resultUsageSettlementBindingTransactionForDatabase(
  client: ResultUsageSettlementBindingDatabaseClientV1,
): ResultUsageSettlementBindingTransactionPortV1 {
  return new PrismaResultUsageSettlementBindingTransaction(client);
}

export class PrismaResultUsageSettlementBindingRepository
  extends PrismaResultUsageSettlementBindingTransaction
  implements ResultUsageSettlementBindingRepositoryPortV1
{
  public constructor(private readonly database: ResultUsageSettlementBindingDatabaseClientV1) {
    super(database);
  }

  public withTransaction<TValue>(
    _context: IamTenantContextV1,
    work: (transaction: ResultUsageSettlementBindingTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.database.$transaction((transaction) =>
      work(new PrismaResultUsageSettlementBindingTransaction(transaction)),
    );
  }
}

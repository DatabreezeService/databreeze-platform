import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type {
  IaeWorkerCapabilityRecordV1,
  IaeWorkerCapabilityRepositoryPortV1,
  IaeWorkerCapabilityTransactionPortV1,
  IaeWorkerCapabilityObjectBindingV1,
  IaeWorkerObjectTransferReceiptV1,
} from '../application/worker-object-capability.port.js';
import { parseIaeWorkerResultFinalizationBindingV1 } from '../application/worker-object-capability.port.js';
import type { StableIdentifierV1, StrictUtcTimestampV1 } from '@databreeze/domain/tenant-scope/v1';

export interface WorkerObjectCapabilityDatabaseRowV1 {
  readonly id: string;
  readonly grantType: string;
  readonly attemptId: string;
  readonly jobId: string;
  readonly workerId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly objectId: string | null;
  readonly objectIds: unknown;
  readonly objectBindings: unknown;
  readonly resultFinalizationBinding?: unknown;
  readonly action: string;
  readonly securityEpoch: number;
  readonly maxBytes: bigint | number;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly contentSha256: string | null;
  readonly contentLength: bigint | number | null;
  readonly transferredAt: Date | null;
}

interface WorkerObjectCapabilityDelegate {
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<WorkerObjectCapabilityDatabaseRowV1 | null>;
  findUnique(input: {
    readonly where: { readonly id: string };
  }): Promise<WorkerObjectCapabilityDatabaseRowV1 | null>;
  create(input: {
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<WorkerObjectCapabilityDatabaseRowV1>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
}

export interface WorkerObjectCapabilityDatabaseClientV1 {
  readonly workerObjectCapabilityRecord: WorkerObjectCapabilityDelegate;
  $transaction<TValue>(
    work: (transaction: WorkerObjectCapabilityDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function databaseScope(scope: TenantScopeV1): Readonly<Record<string, unknown>> {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  };
}

function rowScope(row: WorkerObjectCapabilityDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_CAPABILITY_SCOPE_INVALID');
  return parsed.value;
}

function stable(value: string, code: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error(code);
  return parsed.value;
}

function timestamp(value: Date, code: string): StrictUtcTimestampV1 {
  const parsed = parseStrictUtcTimestampV1(value.toISOString());
  if (!parsed.accepted) throw new Error(code);
  return parsed.value;
}

function objectIds(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 128 ||
    new Set(value).size !== value.length ||
    value.some(
      (candidate) =>
        typeof candidate !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u.test(candidate) ||
        candidate.includes('..'),
    )
  )
    throw new Error('IAE_PERSISTED_CAPABILITY_OBJECTS_INVALID');
  return Object.freeze((value as unknown[]).map((candidate) => candidate as string));
}

function objectBindings(
  value: unknown,
  grantType: 'JOB_INPUT' | 'JOB_OUTPUT',
): readonly IaeWorkerCapabilityObjectBindingV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 128)
    throw new Error('IAE_PERSISTED_CAPABILITY_BINDINGS_INVALID');
  const bindings = value.map((candidate) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
      throw new Error('IAE_PERSISTED_CAPABILITY_BINDINGS_INVALID');
    const record = candidate as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const allowedKeys =
      grantType === 'JOB_INPUT' ? ['contentLength', 'contentSha256', 'objectId'] : ['objectId'];
    if (JSON.stringify(keys) !== JSON.stringify(allowedKeys))
      throw new Error('IAE_PERSISTED_CAPABILITY_BINDINGS_INVALID');
    if (
      typeof record['objectId'] !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u.test(record['objectId']) ||
      record['objectId'].includes('..')
    )
      throw new Error('IAE_PERSISTED_CAPABILITY_BINDINGS_INVALID');
    if (grantType === 'JOB_OUTPUT') return Object.freeze({ objectId: record['objectId'] });
    if (
      typeof record['contentSha256'] !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(record['contentSha256']) ||
      typeof record['contentLength'] !== 'number' ||
      !Number.isSafeInteger(record['contentLength']) ||
      record['contentLength'] < 0
    )
      throw new Error('IAE_PERSISTED_CAPABILITY_BINDINGS_INVALID');
    return Object.freeze({
      objectId: record['objectId'],
      contentSha256: record['contentSha256'],
      contentLength: record['contentLength'],
    });
  });
  if (new Set(bindings.map(({ objectId }) => objectId)).size !== bindings.length)
    throw new Error('IAE_PERSISTED_CAPABILITY_BINDINGS_INVALID');
  return Object.freeze(bindings);
}

function transferReceipt(
  row: WorkerObjectCapabilityDatabaseRowV1,
): IaeWorkerObjectTransferReceiptV1 | undefined {
  if (row.contentSha256 === null && row.contentLength === null && row.transferredAt === null)
    return undefined;
  if (
    row.grantType !== 'JOB_OUTPUT' ||
    row.objectId === null ||
    typeof row.contentSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(row.contentSha256) ||
    row.contentLength === null ||
    !Number.isSafeInteger(Number(row.contentLength)) ||
    Number(row.contentLength) < 0 ||
    row.transferredAt === null
  )
    throw new Error('IAE_PERSISTED_CAPABILITY_RECEIPT_INVALID');
  return Object.freeze({
    objectId: row.objectId,
    contentSha256: row.contentSha256,
    contentLength: Number(row.contentLength),
    transferredAt: timestamp(row.transferredAt, 'IAE_PERSISTED_CAPABILITY_TIMESTAMP_INVALID'),
  });
}

function domain(row: WorkerObjectCapabilityDatabaseRowV1): IaeWorkerCapabilityRecordV1 {
  if (row.grantType !== 'JOB_INPUT' && row.grantType !== 'JOB_OUTPUT')
    throw new Error('IAE_PERSISTED_CAPABILITY_TYPE_INVALID');
  if (row.action !== 'READ' && row.action !== 'WRITE')
    throw new Error('IAE_PERSISTED_CAPABILITY_ACTION_INVALID');
  if (
    !Number.isSafeInteger(row.securityEpoch) ||
    row.securityEpoch < 1 ||
    !Number.isSafeInteger(Number(row.maxBytes)) ||
    Number(row.maxBytes) <= 0
  )
    throw new Error('IAE_PERSISTED_CAPABILITY_LIMIT_INVALID');
  const values = objectIds(row.objectIds);
  const bindings = objectBindings(row.objectBindings, row.grantType);
  if (JSON.stringify(values) !== JSON.stringify(bindings.map(({ objectId }) => objectId)))
    throw new Error('IAE_PERSISTED_CAPABILITY_BINDINGS_INVALID');
  if (row.grantType === 'JOB_INPUT' && (row.objectId !== null || row.action !== 'READ'))
    throw new Error('IAE_PERSISTED_CAPABILITY_INPUT_INVALID');
  if (row.grantType === 'JOB_OUTPUT' && (row.objectId === null || row.action !== 'WRITE'))
    throw new Error('IAE_PERSISTED_CAPABILITY_OUTPUT_INVALID');
  const resultFinalizationBinding =
    row.resultFinalizationBinding === null || row.resultFinalizationBinding === undefined
      ? undefined
      : parseIaeWorkerResultFinalizationBindingV1(row.resultFinalizationBinding);
  if (
    row.resultFinalizationBinding !== null &&
    row.resultFinalizationBinding !== undefined &&
    resultFinalizationBinding === undefined
  )
    throw new Error('IAE_PERSISTED_CAPABILITY_RESULT_BINDING_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    grantType: row.grantType,
    capabilityId: stable(row.id, 'IAE_PERSISTED_CAPABILITY_ID_INVALID'),
    attemptId: stable(row.attemptId, 'IAE_PERSISTED_CAPABILITY_ID_INVALID'),
    jobId: stable(row.jobId, 'IAE_PERSISTED_CAPABILITY_ID_INVALID'),
    workerId: stable(row.workerId, 'IAE_PERSISTED_CAPABILITY_ID_INVALID'),
    tenantScope: rowScope(row),
    objectIds: values,
    objectBindings: bindings,
    action: row.action,
    securityEpoch: row.securityEpoch,
    maxBytes: Number(row.maxBytes),
    issuedAt: timestamp(row.issuedAt, 'IAE_PERSISTED_CAPABILITY_TIMESTAMP_INVALID'),
    expiresAt: timestamp(row.expiresAt, 'IAE_PERSISTED_CAPABILITY_TIMESTAMP_INVALID'),
    ...(row.revokedAt === null
      ? {}
      : { revokedAt: timestamp(row.revokedAt, 'IAE_PERSISTED_CAPABILITY_TIMESTAMP_INVALID') }),
    ...(transferReceipt(row) === undefined ? {} : { transferReceipt: transferReceipt(row)! }),
    ...(resultFinalizationBinding === undefined ? {} : { resultFinalizationBinding }),
  });
}

function exactWhere(scope: TenantScopeV1, extra: Readonly<Record<string, unknown>>) {
  return { ...databaseScope(scope), ...extra };
}

class PrismaWorkerObjectCapabilityTransactionAdapter
  implements IaeWorkerCapabilityTransactionPortV1
{
  public constructor(private readonly client: WorkerObjectCapabilityDatabaseClientV1) {}

  public async findInput(scope: TenantScopeV1, attemptId: StableIdentifierV1) {
    const row = await this.client.workerObjectCapabilityRecord.findFirst({
      where: exactWhere(scope, { attemptId, grantType: 'JOB_INPUT' }),
    });
    return row === null ? undefined : domain(row);
  }

  public async findOutput(scope: TenantScopeV1, attemptId: StableIdentifierV1, objectId: string) {
    const row = await this.client.workerObjectCapabilityRecord.findFirst({
      where: exactWhere(scope, { attemptId, grantType: 'JOB_OUTPUT', objectId }),
    });
    return row === null ? undefined : domain(row);
  }

  public async findByCapability(scope: TenantScopeV1, capabilityId: StableIdentifierV1) {
    const row = await this.client.workerObjectCapabilityRecord.findFirst({
      where: exactWhere(scope, { id: capabilityId }),
    });
    return row === null ? undefined : domain(row);
  }

  public async save(record: IaeWorkerCapabilityRecordV1): Promise<void> {
    const existing = await this.client.workerObjectCapabilityRecord.findUnique({
      where: { id: record.capabilityId },
    });
    if (existing !== null) {
      if (JSON.stringify(domain(existing)) !== JSON.stringify(record))
        throw new Error('IAE_CAPABILITY_IMMUTABLE');
      return;
    }
    await this.client.workerObjectCapabilityRecord.create({
      data: {
        id: record.capabilityId,
        grantType: record.grantType,
        attemptId: record.attemptId,
        jobId: record.jobId,
        workerId: record.workerId,
        ...databaseScope(record.tenantScope),
        objectId: record.grantType === 'JOB_OUTPUT' ? record.objectIds[0] : null,
        objectIds: record.objectIds,
        objectBindings: record.objectBindings,
        resultFinalizationBinding: record.resultFinalizationBinding ?? null,
        action: record.action,
        securityEpoch: record.securityEpoch,
        maxBytes: BigInt(record.maxBytes),
        issuedAt: new Date(record.issuedAt),
        expiresAt: new Date(record.expiresAt),
        revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
        contentSha256: record.transferReceipt?.contentSha256 ?? null,
        contentLength:
          record.transferReceipt === undefined
            ? null
            : BigInt(record.transferReceipt.contentLength),
        transferredAt:
          record.transferReceipt === undefined
            ? null
            : new Date(record.transferReceipt.transferredAt),
      },
    });
  }

  public async recordTransferReceipt(
    scope: TenantScopeV1,
    capabilityId: StableIdentifierV1,
    receipt: IaeWorkerObjectTransferReceiptV1,
  ): Promise<'RECORDED' | 'REPLAYED' | 'CONFLICT' | 'NOT_FOUND'> {
    const updated = await this.client.workerObjectCapabilityRecord.updateMany({
      where: exactWhere(scope, {
        id: capabilityId,
        grantType: 'JOB_OUTPUT',
        objectId: receipt.objectId,
        transferredAt: null,
      }),
      data: {
        contentSha256: receipt.contentSha256,
        contentLength: BigInt(receipt.contentLength),
        transferredAt: new Date(receipt.transferredAt),
      },
    });
    if (updated.count === 1) return 'RECORDED';
    const current = await this.findByCapability(scope, capabilityId);
    if (!current) return 'NOT_FOUND';
    return JSON.stringify(current.transferReceipt) === JSON.stringify(receipt)
      ? 'REPLAYED'
      : 'CONFLICT';
  }
}

export class PrismaWorkerObjectCapabilityRepositoryAdapter
  implements IaeWorkerCapabilityRepositoryPortV1
{
  public constructor(private readonly client: WorkerObjectCapabilityDatabaseClientV1) {}

  public withTransaction<TValue>(
    scope: TenantScopeV1,
    work: (transaction: IaeWorkerCapabilityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaWorkerObjectCapabilityTransactionAdapter(transaction)),
    );
  }

  public findInput(scope: TenantScopeV1, attemptId: StableIdentifierV1) {
    return new PrismaWorkerObjectCapabilityTransactionAdapter(this.client).findInput(
      scope,
      attemptId,
    );
  }

  public findOutput(scope: TenantScopeV1, attemptId: StableIdentifierV1, objectId: string) {
    return new PrismaWorkerObjectCapabilityTransactionAdapter(this.client).findOutput(
      scope,
      attemptId,
      objectId,
    );
  }

  public findByCapability(scope: TenantScopeV1, capabilityId: StableIdentifierV1) {
    return new PrismaWorkerObjectCapabilityTransactionAdapter(this.client).findByCapability(
      scope,
      capabilityId,
    );
  }

  public save(record: IaeWorkerCapabilityRecordV1): Promise<void> {
    return new PrismaWorkerObjectCapabilityTransactionAdapter(this.client).save(record);
  }

  public recordTransferReceipt(
    scope: TenantScopeV1,
    capabilityId: StableIdentifierV1,
    receipt: IaeWorkerObjectTransferReceiptV1,
  ) {
    return new PrismaWorkerObjectCapabilityTransactionAdapter(this.client).recordTransferReceipt(
      scope,
      capabilityId,
      receipt,
    );
  }

  public async revokeForAttempt(
    scope: TenantScopeV1,
    attemptId: StableIdentifierV1,
    revokedAt: StrictUtcTimestampV1,
  ): Promise<void> {
    await this.client.workerObjectCapabilityRecord.updateMany({
      where: exactWhere(scope, { attemptId, revokedAt: null }),
      data: { revokedAt: new Date(revokedAt) },
    });
  }
}

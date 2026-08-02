import {
  createDeviceSyncConflictV1,
  createDeviceSyncOperationV1,
  createDeviceTransferReceiptV1,
  createStrictLocalPackageManifestV1,
  type DeviceSyncConflictV1,
  type DeviceSyncOperationV1,
  type DeviceTransferReceiptV1,
  type StrictLocalPackageManifestV1,
} from '@databreeze/domain/device-sync/v1';
import {
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DeviceSyncRepositoryPortV1,
  DeviceSyncTransactionPortV1,
} from '../application/device-sync-repository.port.js';

export interface DeviceSyncOperationDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly deviceId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly kind: string;
  readonly payloadClass: string;
  readonly payloadDigest: string;
  readonly encryptedPayload: string | null;
  readonly dependencyIds: unknown;
  readonly baseRevision: number | null;
  readonly status: string;
  readonly revision: number;
  readonly createdAt: Date;
  readonly acknowledgedAt: Date | null;
  readonly idempotencyKey: string;
}

export interface DeviceSyncConflictDatabaseRowV1 {
  readonly id: string;
  readonly operationId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly deviceId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly reason: string;
  readonly status: string;
  readonly expectedRevision: number | null;
  readonly actualRevision: number | null;
  readonly detectedAt: Date;
  readonly resolvedAt: Date | null;
}

export interface StrictLocalPackageDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly deviceId: string;
  readonly purpose: string;
  readonly destinationClass: string;
  readonly itemDigests: unknown;
  readonly packageDigest: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly status: string;
  readonly revision: number;
}

export interface DeviceTransferReceiptDatabaseRowV1 {
  readonly id: string;
  readonly packageId: string;
  readonly deviceId: string;
  readonly destinationClass: string;
  readonly packageDigest: string;
  readonly receivedAt: Date;
  readonly manifestVerified: boolean;
  readonly status: string;
}

interface DelegateV1<TRow, TCreate, TUpdate = never> {
  create(input: { readonly data: TCreate }): Promise<TRow>;
  findUnique(input: { readonly where: { readonly id: string } }): Promise<TRow | null>;
  findFirst(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<TRow | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<readonly TRow[]>;
  update?(input: {
    readonly where: { readonly id: string };
    readonly data: TUpdate;
  }): Promise<TRow>;
}

export interface DeviceSyncDatabaseClientV1 {
  readonly deviceSyncOperationRecord: DelegateV1<
    DeviceSyncOperationDatabaseRowV1,
    DeviceSyncOperationDatabaseCreateDataV1,
    DeviceSyncOperationDatabaseUpdateDataV1
  >;
  readonly deviceSyncConflictRecord: DelegateV1<
    DeviceSyncConflictDatabaseRowV1,
    DeviceSyncConflictDatabaseCreateDataV1
  >;
  readonly strictLocalPackageManifestRecord: DelegateV1<
    StrictLocalPackageDatabaseRowV1,
    StrictLocalPackageDatabaseCreateDataV1
  >;
  readonly deviceTransferReceiptRecord: DelegateV1<
    DeviceTransferReceiptDatabaseRowV1,
    DeviceTransferReceiptDatabaseCreateDataV1
  >;
  $transaction<TValue>(
    work: (transaction: DeviceSyncDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

export interface DeviceSyncOperationDatabaseCreateDataV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly deviceId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly kind: DeviceSyncOperationV1['kind'];
  readonly payloadClass: DeviceSyncOperationV1['payloadClass'];
  readonly payloadDigest: string;
  readonly encryptedPayload: string | null;
  readonly dependencyIds: readonly string[];
  readonly baseRevision: number | null;
  readonly status: DeviceSyncOperationV1['status'];
  readonly revision: number;
  readonly createdAt: Date;
  readonly acknowledgedAt: Date | null;
  readonly idempotencyKey: string;
}

export interface DeviceSyncOperationDatabaseUpdateDataV1 {
  readonly status: DeviceSyncOperationV1['status'];
  readonly revision: number;
  readonly acknowledgedAt: Date | null;
}

export interface DeviceSyncConflictDatabaseCreateDataV1 {
  readonly id: string;
  readonly operationId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly deviceId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly reason: DeviceSyncConflictV1['reason'];
  readonly status: DeviceSyncConflictV1['status'];
  readonly expectedRevision: number | null;
  readonly actualRevision: number | null;
  readonly detectedAt: Date;
  readonly resolvedAt: Date | null;
}

export interface StrictLocalPackageDatabaseCreateDataV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly deviceId: string;
  readonly purpose: string;
  readonly destinationClass: string;
  readonly itemDigests: readonly string[];
  readonly packageDigest: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly status: StrictLocalPackageManifestV1['status'];
  readonly revision: number;
}

export interface DeviceTransferReceiptDatabaseCreateDataV1 {
  readonly id: string;
  readonly packageId: string;
  readonly deviceId: string;
  readonly destinationClass: string;
  readonly packageDigest: string;
  readonly receivedAt: Date;
  readonly manifestVerified: boolean;
  readonly status: DeviceTransferReceiptV1['status'];
}

const operationStatuses: readonly DeviceSyncOperationV1['status'][] = [
  'QUEUED',
  'ACCEPTED',
  'APPLIED',
  'CONFLICT',
  'QUARANTINED',
  'REJECTED',
];
const packageStatuses: readonly StrictLocalPackageManifestV1['status'][] = [
  'ISSUED',
  'RECEIVED',
  'EXPIRED',
  'QUARANTINED',
];
const conflictStatuses: readonly DeviceSyncConflictV1['status'][] = [
  'OPEN',
  'RESOLVED',
  'DISMISSED',
];
const receiptStatuses: readonly DeviceTransferReceiptV1['status'][] = [
  'ACCEPTED',
  'REJECTED',
  'QUARANTINED',
];

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function domainScope(row: {
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
}): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('DSO_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function operationFromRow(row: DeviceSyncOperationDatabaseRowV1): DeviceSyncOperationV1 {
  const created = createDeviceSyncOperationV1({
    operationId: row.id,
    deviceId: row.deviceId,
    tenantScope: domainScope(row),
    entityType: row.entityType,
    entityId: row.entityId,
    kind: row.kind,
    payloadClass: row.payloadClass,
    payloadDigest: row.payloadDigest,
    ...(row.encryptedPayload === null ? {} : { encryptedPayload: row.encryptedPayload }),
    dependencyIds: row.dependencyIds,
    ...(row.baseRevision === null ? {} : { baseRevision: row.baseRevision }),
    createdAt: row.createdAt.toISOString(),
  });
  if (
    !created.accepted ||
    !operationStatuses.includes(row.status as DeviceSyncOperationV1['status'])
  )
    throw new Error('DSO_PERSISTED_OPERATION_INVALID');
  if (!Number.isSafeInteger(row.revision) || row.revision < 1)
    throw new Error('DSO_PERSISTED_REVISION_INVALID');
  if (row.acknowledgedAt !== null && row.status !== 'APPLIED')
    throw new Error('DSO_PERSISTED_ACK_INVALID');
  return Object.freeze({
    ...created.value,
    status: row.status as DeviceSyncOperationV1['status'],
    revision: row.revision,
    ...(row.acknowledgedAt === null
      ? {}
      : { acknowledgedAt: persistedTimestamp(row.acknowledgedAt.toISOString()) }),
  });
}

function conflictFromRow(row: DeviceSyncConflictDatabaseRowV1): DeviceSyncConflictV1 {
  const created = createDeviceSyncConflictV1({
    conflictId: row.id,
    operationId: row.operationId,
    deviceId: row.deviceId,
    tenantScope: domainScope(row),
    entityType: row.entityType,
    entityId: row.entityId,
    reason: row.reason,
    ...(row.expectedRevision === null ? {} : { expectedRevision: row.expectedRevision }),
    ...(row.actualRevision === null ? {} : { actualRevision: row.actualRevision }),
    detectedAt: row.detectedAt.toISOString(),
  });
  if (!created.accepted || !conflictStatuses.includes(row.status as DeviceSyncConflictV1['status']))
    throw new Error('DSO_PERSISTED_CONFLICT_INVALID');
  return Object.freeze({
    ...created.value,
    status: row.status as DeviceSyncConflictV1['status'],
    ...(row.resolvedAt === null
      ? {}
      : { resolvedAt: persistedTimestamp(row.resolvedAt.toISOString()) }),
  });
}

function packageFromRow(row: StrictLocalPackageDatabaseRowV1): StrictLocalPackageManifestV1 {
  const created = createStrictLocalPackageManifestV1({
    packageId: row.id,
    deviceId: row.deviceId,
    tenantScope: domainScope(row),
    purpose: row.purpose,
    destinationClass: row.destinationClass,
    itemDigests: row.itemDigests,
    packageDigest: row.packageDigest,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  });
  if (
    !created.accepted ||
    !packageStatuses.includes(row.status as StrictLocalPackageManifestV1['status'])
  )
    throw new Error('DSO_PERSISTED_PACKAGE_INVALID');
  if (!Number.isSafeInteger(row.revision) || row.revision < 1)
    throw new Error('DSO_PERSISTED_REVISION_INVALID');
  return Object.freeze({
    ...created.value,
    status: row.status as StrictLocalPackageManifestV1['status'],
    revision: row.revision,
  });
}

function receiptFromRow(row: DeviceTransferReceiptDatabaseRowV1): DeviceTransferReceiptV1 {
  const created = createDeviceTransferReceiptV1({
    receiptId: row.id,
    packageId: row.packageId,
    deviceId: row.deviceId,
    destinationClass: row.destinationClass,
    packageDigest: row.packageDigest,
    receivedAt: row.receivedAt.toISOString(),
    manifestVerified: row.manifestVerified,
    status: row.status,
  });
  if (
    !created.accepted ||
    !receiptStatuses.includes(row.status as DeviceTransferReceiptV1['status'])
  )
    throw new Error('DSO_PERSISTED_RECEIPT_INVALID');
  return created.value;
}

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function persistedTimestamp(input: string): StrictUtcTimestampV1 {
  const parsed = parseStrictUtcTimestampV1(input);
  if (!parsed.accepted) throw new Error('DSO_PERSISTED_TIMESTAMP_INVALID');
  return parsed.value;
}

function operationCreateData(
  operation: DeviceSyncOperationV1,
  idempotencyKey: string,
): DeviceSyncOperationDatabaseCreateDataV1 {
  return {
    ...databaseScope(operation.tenantScope),
    id: operation.operationId,
    deviceId: operation.deviceId,
    entityType: operation.entityType,
    entityId: operation.entityId,
    kind: operation.kind,
    payloadClass: operation.payloadClass,
    payloadDigest: operation.payloadDigest,
    encryptedPayload: operation.encryptedPayload ?? null,
    dependencyIds: operation.dependencyIds,
    baseRevision: operation.baseRevision ?? null,
    status: operation.status,
    revision: operation.revision,
    createdAt: new Date(operation.createdAt),
    acknowledgedAt: operation.acknowledgedAt ? new Date(operation.acknowledgedAt) : null,
    idempotencyKey,
  };
}

function conflictCreateData(
  conflict: DeviceSyncConflictV1,
): DeviceSyncConflictDatabaseCreateDataV1 {
  return {
    ...databaseScope(conflict.tenantScope),
    id: conflict.conflictId,
    operationId: conflict.operationId,
    deviceId: conflict.deviceId,
    entityType: conflict.entityType,
    entityId: conflict.entityId,
    reason: conflict.reason,
    status: conflict.status,
    expectedRevision: conflict.expectedRevision ?? null,
    actualRevision: conflict.actualRevision ?? null,
    detectedAt: new Date(conflict.detectedAt),
    resolvedAt: conflict.resolvedAt ? new Date(conflict.resolvedAt) : null,
  };
}

function packageCreateData(
  manifest: StrictLocalPackageManifestV1,
): StrictLocalPackageDatabaseCreateDataV1 {
  return {
    ...databaseScope(manifest.tenantScope),
    id: manifest.packageId,
    deviceId: manifest.deviceId,
    purpose: manifest.purpose,
    destinationClass: manifest.destinationClass,
    itemDigests: manifest.itemDigests,
    packageDigest: manifest.packageDigest,
    issuedAt: new Date(manifest.issuedAt),
    expiresAt: new Date(manifest.expiresAt),
    status: manifest.status,
    revision: manifest.revision,
  };
}

function receiptCreateData(
  receipt: DeviceTransferReceiptV1,
): DeviceTransferReceiptDatabaseCreateDataV1 {
  return {
    id: receipt.receiptId,
    packageId: receipt.packageId,
    deviceId: receipt.deviceId,
    destinationClass: receipt.destinationClass,
    packageDigest: receipt.packageDigest,
    receivedAt: new Date(receipt.receivedAt),
    manifestVerified: receipt.manifestVerified,
    status: receipt.status,
  };
}

class PrismaDeviceSyncTransactionAdapter implements DeviceSyncTransactionPortV1 {
  public constructor(private readonly client: DeviceSyncDatabaseClientV1) {}

  public async saveOperation(
    context: IamTenantContextV1,
    operation: DeviceSyncOperationV1,
    options: { readonly idempotencyKey?: string; readonly expectedRevision?: number } = {},
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, operation.tenantScope))
      throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.deviceSyncOperationRecord.findUnique({
      where: { id: operation.operationId },
    });
    if (existing === null) {
      if (options.expectedRevision !== undefined) throw new Error('DSO_REVISION_CONFLICT');
      const duplicate = await this.client.deviceSyncOperationRecord.findFirst({
        where: {
          ...databaseScope(operation.tenantScope),
          idempotencyKey: options.idempotencyKey ?? context.idempotencyKey,
        },
      });
      if (duplicate !== null && duplicate.id !== operation.operationId)
        throw new Error('DSO_IDEMPOTENCY_CONFLICT');
      await this.client.deviceSyncOperationRecord.create({
        data: operationCreateData(operation, options.idempotencyKey ?? context.idempotencyKey),
      });
      return;
    }
    const current = operationFromRow(existing);
    if (!visible(context.tenantScope, current.tenantScope)) return;
    if (options.expectedRevision !== undefined && current.revision !== options.expectedRevision)
      throw new Error('DSO_REVISION_CONFLICT');
    if (
      current.entityType !== operation.entityType ||
      current.entityId !== operation.entityId ||
      current.deviceId !== operation.deviceId ||
      current.payloadDigest !== operation.payloadDigest ||
      current.payloadClass !== operation.payloadClass ||
      current.kind !== operation.kind ||
      JSON.stringify(current.tenantScope) !== JSON.stringify(operation.tenantScope)
    )
      throw new Error('DSO_IMMUTABLE_RECORD');
    if (JSON.stringify(current) === JSON.stringify(operation)) return;
    if (operation.revision !== current.revision + 1) throw new Error('DSO_REVISION_CONFLICT');
    if (!this.client.deviceSyncOperationRecord.update) throw new Error('DSO_UPDATE_UNAVAILABLE');
    await this.client.deviceSyncOperationRecord.update({
      where: { id: operation.operationId },
      data: {
        status: operation.status,
        revision: operation.revision,
        acknowledgedAt: operation.acknowledgedAt ? new Date(operation.acknowledgedAt) : null,
      },
    });
  }

  public async findOperation(
    context: IamTenantContextV1,
    operationId: DeviceSyncOperationV1['operationId'],
  ): Promise<DeviceSyncOperationV1 | undefined> {
    const row = await this.client.deviceSyncOperationRecord.findUnique({
      where: { id: operationId },
    });
    if (row === null) return undefined;
    const operation = operationFromRow(row);
    return visible(context.tenantScope, operation.tenantScope) ? operation : undefined;
  }

  public async findOperationByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<DeviceSyncOperationV1 | undefined> {
    const row = await this.client.deviceSyncOperationRecord.findFirst({
      where: { ...databaseScope(context.tenantScope), idempotencyKey },
    });
    if (row === null) return undefined;
    const operation = operationFromRow(row);
    return visible(context.tenantScope, operation.tenantScope) ? operation : undefined;
  }

  public async listOperations(
    context: IamTenantContextV1,
  ): Promise<readonly DeviceSyncOperationV1[]> {
    const rows = await this.client.deviceSyncOperationRecord.findMany({
      where: { organizationId: context.tenantScope.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows
      .map(operationFromRow)
      .filter((operation) => visible(context.tenantScope, operation.tenantScope));
  }

  public async saveConflict(
    context: IamTenantContextV1,
    conflict: DeviceSyncConflictV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, conflict.tenantScope))
      throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.deviceSyncConflictRecord.findUnique({
      where: { id: conflict.conflictId },
    });
    if (existing !== null) {
      if (JSON.stringify(conflictFromRow(existing)) !== JSON.stringify(conflict))
        throw new Error('DSO_IMMUTABLE_RECORD');
      return;
    }
    await this.client.deviceSyncConflictRecord.create({ data: conflictCreateData(conflict) });
  }

  public async listConflicts(
    context: IamTenantContextV1,
    operationId?: DeviceSyncConflictV1['operationId'],
  ): Promise<readonly DeviceSyncConflictV1[]> {
    const rows = await this.client.deviceSyncConflictRecord.findMany({
      where: { organizationId: context.tenantScope.organizationId },
      orderBy: { detectedAt: 'asc' },
    });
    return rows
      .map(conflictFromRow)
      .filter(
        (conflict) =>
          visible(context.tenantScope, conflict.tenantScope) &&
          (operationId === undefined || conflict.operationId === operationId),
      );
  }

  public async savePackage(
    context: IamTenantContextV1,
    manifest: StrictLocalPackageManifestV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, manifest.tenantScope))
      throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.strictLocalPackageManifestRecord.findUnique({
      where: { id: manifest.packageId },
    });
    if (existing !== null) {
      if (JSON.stringify(packageFromRow(existing)) !== JSON.stringify(manifest))
        throw new Error('DSO_IMMUTABLE_RECORD');
      return;
    }
    await this.client.strictLocalPackageManifestRecord.create({
      data: packageCreateData(manifest),
    });
  }

  public async findPackage(
    context: IamTenantContextV1,
    packageId: StrictLocalPackageManifestV1['packageId'],
  ): Promise<StrictLocalPackageManifestV1 | undefined> {
    const row = await this.client.strictLocalPackageManifestRecord.findUnique({
      where: { id: packageId },
    });
    if (row === null) return undefined;
    const manifest = packageFromRow(row);
    return visible(context.tenantScope, manifest.tenantScope) ? manifest : undefined;
  }

  public async saveReceipt(
    context: IamTenantContextV1,
    receipt: DeviceTransferReceiptV1,
  ): Promise<void> {
    const packageRow = await this.client.strictLocalPackageManifestRecord.findUnique({
      where: { id: receipt.packageId },
    });
    if (packageRow === null) throw new Error('DSO_PACKAGE_NOT_FOUND');
    if (!visible(context.tenantScope, domainScope(packageRow)))
      throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.deviceTransferReceiptRecord.findUnique({
      where: { id: receipt.receiptId },
    });
    if (existing !== null) {
      if (JSON.stringify(receiptFromRow(existing)) !== JSON.stringify(receipt))
        throw new Error('DSO_IMMUTABLE_RECORD');
      return;
    }
    await this.client.deviceTransferReceiptRecord.create({ data: receiptCreateData(receipt) });
  }

  public async findReceipt(
    context: IamTenantContextV1,
    receiptId: DeviceTransferReceiptV1['receiptId'],
  ): Promise<DeviceTransferReceiptV1 | undefined> {
    const row = await this.client.deviceTransferReceiptRecord.findUnique({
      where: { id: receiptId },
    });
    if (row === null) return undefined;
    const packageRow = await this.client.strictLocalPackageManifestRecord.findUnique({
      where: { id: row.packageId },
    });
    if (packageRow === null || !visible(context.tenantScope, domainScope(packageRow)))
      return undefined;
    return receiptFromRow(row);
  }
}

export class PrismaDeviceSyncRepositoryAdapter implements DeviceSyncRepositoryPortV1 {
  public constructor(private readonly client: DeviceSyncDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DeviceSyncTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaDeviceSyncTransactionAdapter(transaction)),
    );
  }

  public saveOperation(
    context: IamTenantContextV1,
    operation: DeviceSyncOperationV1,
    options?: { readonly idempotencyKey?: string; readonly expectedRevision?: number },
  ): Promise<void> {
    return new PrismaDeviceSyncTransactionAdapter(this.client).saveOperation(
      context,
      operation,
      options,
    );
  }

  public findOperation(
    context: IamTenantContextV1,
    operationId: DeviceSyncOperationV1['operationId'],
  ): Promise<DeviceSyncOperationV1 | undefined> {
    return new PrismaDeviceSyncTransactionAdapter(this.client).findOperation(context, operationId);
  }

  public findOperationByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<DeviceSyncOperationV1 | undefined> {
    return new PrismaDeviceSyncTransactionAdapter(this.client).findOperationByIdempotency(
      context,
      idempotencyKey,
    );
  }

  public listOperations(context: IamTenantContextV1): Promise<readonly DeviceSyncOperationV1[]> {
    return new PrismaDeviceSyncTransactionAdapter(this.client).listOperations(context);
  }

  public saveConflict(context: IamTenantContextV1, conflict: DeviceSyncConflictV1): Promise<void> {
    return new PrismaDeviceSyncTransactionAdapter(this.client).saveConflict(context, conflict);
  }

  public listConflicts(
    context: IamTenantContextV1,
    operationId?: DeviceSyncConflictV1['operationId'],
  ): Promise<readonly DeviceSyncConflictV1[]> {
    return new PrismaDeviceSyncTransactionAdapter(this.client).listConflicts(context, operationId);
  }

  public savePackage(
    context: IamTenantContextV1,
    manifest: StrictLocalPackageManifestV1,
  ): Promise<void> {
    return new PrismaDeviceSyncTransactionAdapter(this.client).savePackage(context, manifest);
  }

  public findPackage(
    context: IamTenantContextV1,
    packageId: StrictLocalPackageManifestV1['packageId'],
  ): Promise<StrictLocalPackageManifestV1 | undefined> {
    return new PrismaDeviceSyncTransactionAdapter(this.client).findPackage(context, packageId);
  }

  public saveReceipt(context: IamTenantContextV1, receipt: DeviceTransferReceiptV1): Promise<void> {
    return new PrismaDeviceSyncTransactionAdapter(this.client).saveReceipt(context, receipt);
  }

  public findReceipt(
    context: IamTenantContextV1,
    receiptId: DeviceTransferReceiptV1['receiptId'],
  ): Promise<DeviceTransferReceiptV1 | undefined> {
    return new PrismaDeviceSyncTransactionAdapter(this.client).findReceipt(context, receiptId);
  }
}

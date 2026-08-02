import {
  tenantScopeContainsV1,
  type DeviceSyncConflictV1,
  type DeviceSyncOperationV1,
  type DeviceTransferReceiptV1,
  type StrictLocalPackageManifestV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DeviceSyncOperationChangeV1,
  DeviceSyncRepositoryPortV1,
  DeviceSyncTransactionPortV1,
} from '../application/device-sync-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function canMutate(context: IamTenantContextV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, candidate);
}

function scopeKey(scope: TenantScopeV1): string {
  return JSON.stringify(scope);
}

function cloneOperation(operation: DeviceSyncOperationV1): DeviceSyncOperationV1 {
  return Object.freeze({
    ...operation,
    tenantScope: Object.freeze({ ...operation.tenantScope }),
    dependencyIds: Object.freeze([...operation.dependencyIds]),
  });
}

function cloneConflict(conflict: DeviceSyncConflictV1): DeviceSyncConflictV1 {
  return Object.freeze({ ...conflict, tenantScope: Object.freeze({ ...conflict.tenantScope }) });
}

function clonePackage(manifest: StrictLocalPackageManifestV1): StrictLocalPackageManifestV1 {
  return Object.freeze({
    ...manifest,
    tenantScope: Object.freeze({ ...manifest.tenantScope }),
    itemDigests: Object.freeze([...manifest.itemDigests]),
  });
}

function cloneReceipt(receipt: DeviceTransferReceiptV1): DeviceTransferReceiptV1 {
  return Object.freeze({ ...receipt });
}

/** Deterministic DSO adapter; production replaces it with the Prisma adapter at composition. */
export class InMemoryDeviceSyncRepositoryAdapter implements DeviceSyncRepositoryPortV1 {
  private operations = new Map<string, DeviceSyncOperationV1>();
  private operationSequences = new Map<string, number>();
  private nextOperationSequence = 1;
  private operationKeys = new Map<string, string>();
  private conflicts = new Map<string, DeviceSyncConflictV1>();
  private packages = new Map<string, StrictLocalPackageManifestV1>();
  private receipts = new Map<string, DeviceTransferReceiptV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async saveOperation(
    context: IamTenantContextV1,
    operation: DeviceSyncOperationV1,
    options: { readonly idempotencyKey?: string; readonly expectedRevision?: number } = {},
  ): Promise<void> {
    await Promise.resolve();
    if (!canMutate(context, operation.tenantScope)) throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = this.operations.get(operation.operationId);
    if (!existing) {
      if (options.expectedRevision !== undefined) throw new Error('DSO_REVISION_CONFLICT');
      if (options.idempotencyKey) {
        const key = `${scopeKey(operation.tenantScope)}:${options.idempotencyKey}`;
        const existingId = this.operationKeys.get(key);
        if (existingId && existingId !== operation.operationId)
          throw new Error('DSO_IDEMPOTENCY_CONFLICT');
        this.operationKeys.set(key, operation.operationId);
      }
      this.operations.set(operation.operationId, cloneOperation(operation));
      this.operationSequences.set(operation.operationId, this.nextOperationSequence++);
      return;
    }
    if (!visible(context.tenantScope, existing.tenantScope)) return;
    if (options.expectedRevision !== undefined && existing.revision !== options.expectedRevision)
      throw new Error('DSO_REVISION_CONFLICT');
    if (
      existing.entityId !== operation.entityId ||
      existing.entityType !== operation.entityType ||
      existing.deviceId !== operation.deviceId ||
      existing.payloadDigest !== operation.payloadDigest ||
      existing.payloadClass !== operation.payloadClass ||
      existing.kind !== operation.kind ||
      JSON.stringify(existing.tenantScope) !== JSON.stringify(operation.tenantScope)
    )
      throw new Error('DSO_IMMUTABLE_RECORD');
    if (
      existing.revision === operation.revision &&
      JSON.stringify(existing) === JSON.stringify(operation)
    )
      return;
    if (operation.revision !== existing.revision + 1) throw new Error('DSO_REVISION_CONFLICT');
    this.operations.set(operation.operationId, cloneOperation(operation));
  }

  public async findOperation(
    context: IamTenantContextV1,
    operationId: DeviceSyncOperationV1['operationId'],
  ): Promise<DeviceSyncOperationV1 | undefined> {
    await Promise.resolve();
    const operation = this.operations.get(operationId);
    return operation && visible(context.tenantScope, operation.tenantScope)
      ? cloneOperation(operation)
      : undefined;
  }

  public async findOperationByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<DeviceSyncOperationV1 | undefined> {
    await Promise.resolve();
    const operationId = this.operationKeys.get(
      `${scopeKey(context.tenantScope)}:${idempotencyKey}`,
    );
    if (!operationId) return undefined;
    const operation = this.operations.get(operationId);
    return operation && visible(context.tenantScope, operation.tenantScope)
      ? cloneOperation(operation)
      : undefined;
  }

  public async listOperations(
    context: IamTenantContextV1,
  ): Promise<readonly DeviceSyncOperationV1[]> {
    await Promise.resolve();
    return [...this.operations.values()]
      .filter((operation) => visible(context.tenantScope, operation.tenantScope))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneOperation);
  }

  public async listOperationChanges(
    context: IamTenantContextV1,
    afterSequence: number,
    limit: number,
  ): Promise<readonly DeviceSyncOperationChangeV1[]> {
    await Promise.resolve();
    return [...this.operations.entries()]
      .map(([operationId, operation]) => ({
        operation,
        sequence: this.operationSequences.get(operationId),
      }))
      .filter(
        (entry): entry is { operation: DeviceSyncOperationV1; sequence: number } =>
          entry.sequence !== undefined &&
          entry.sequence > afterSequence &&
          visible(context.tenantScope, entry.operation.tenantScope),
      )
      .sort((left, right) => left.sequence - right.sequence)
      .slice(0, limit)
      .map((entry) => Object.freeze({ sequence: entry.sequence, operation: cloneOperation(entry.operation) }));
  }

  public async saveConflict(
    context: IamTenantContextV1,
    conflict: DeviceSyncConflictV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!canMutate(context, conflict.tenantScope)) throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = this.conflicts.get(conflict.conflictId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(conflict))
      throw new Error('DSO_IMMUTABLE_RECORD');
    this.conflicts.set(conflict.conflictId, cloneConflict(conflict));
  }

  public async listConflicts(
    context: IamTenantContextV1,
    operationId?: DeviceSyncConflictV1['operationId'],
  ): Promise<readonly DeviceSyncConflictV1[]> {
    await Promise.resolve();
    return [...this.conflicts.values()]
      .filter(
        (conflict) =>
          visible(context.tenantScope, conflict.tenantScope) &&
          (operationId === undefined || conflict.operationId === operationId),
      )
      .sort((left, right) => left.detectedAt.localeCompare(right.detectedAt))
      .map(cloneConflict);
  }

  public async savePackage(
    context: IamTenantContextV1,
    manifest: StrictLocalPackageManifestV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!canMutate(context, manifest.tenantScope)) throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = this.packages.get(manifest.packageId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(manifest))
      throw new Error('DSO_IMMUTABLE_RECORD');
    this.packages.set(manifest.packageId, clonePackage(manifest));
  }

  public async findPackage(
    context: IamTenantContextV1,
    packageId: StrictLocalPackageManifestV1['packageId'],
  ): Promise<StrictLocalPackageManifestV1 | undefined> {
    await Promise.resolve();
    const manifest = this.packages.get(packageId);
    return manifest && visible(context.tenantScope, manifest.tenantScope)
      ? clonePackage(manifest)
      : undefined;
  }

  public async saveReceipt(
    context: IamTenantContextV1,
    receipt: DeviceTransferReceiptV1,
  ): Promise<void> {
    await Promise.resolve();
    const existing = this.receipts.get(receipt.receiptId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(receipt))
      throw new Error('DSO_IMMUTABLE_RECORD');
    this.receipts.set(receipt.receiptId, cloneReceipt(receipt));
    void context;
  }

  public async findReceipt(
    context: IamTenantContextV1,
    receiptId: DeviceTransferReceiptV1['receiptId'],
  ): Promise<DeviceTransferReceiptV1 | undefined> {
    await Promise.resolve();
    const receipt = this.receipts.get(receiptId);
    void context;
    return receipt ? cloneReceipt(receipt) : undefined;
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DeviceSyncTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = {
      operations: new Map(this.operations),
      operationSequences: new Map(this.operationSequences),
      nextOperationSequence: this.nextOperationSequence,
      operationKeys: new Map(this.operationKeys),
      conflicts: new Map(this.conflicts),
      packages: new Map(this.packages),
      receipts: new Map(this.receipts),
    };
    try {
      return await work({
        saveOperation: this.saveOperation.bind(this),
        findOperation: this.findOperation.bind(this),
        findOperationByIdempotency: this.findOperationByIdempotency.bind(this),
        listOperations: this.listOperations.bind(this),
        listOperationChanges: this.listOperationChanges.bind(this),
        saveConflict: this.saveConflict.bind(this),
        listConflicts: this.listConflicts.bind(this),
        savePackage: this.savePackage.bind(this),
        findPackage: this.findPackage.bind(this),
        saveReceipt: this.saveReceipt.bind(this),
        findReceipt: this.findReceipt.bind(this),
      });
    } catch (error) {
      this.operations = before.operations;
      this.operationSequences = before.operationSequences;
      this.nextOperationSequence = before.nextOperationSequence;
      this.operationKeys = before.operationKeys;
      this.conflicts = before.conflicts;
      this.packages = before.packages;
      this.receipts = before.receipts;
      throw error;
    } finally {
      release();
    }
  }
}

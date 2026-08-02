import {
  createDeviceSyncConflictV1,
  createDeviceSyncOperationV1,
  createDeviceTransferReceiptV1,
  createStrictLocalPackageManifestV1,
  transitionDeviceSyncOperationV1,
  type DeviceSyncConflictV1,
  type DeviceSyncErrorCodeV1,
  type DeviceSyncOperationV1,
  type DeviceSyncResultV1,
  type DeviceTransferReceiptV1,
  type StrictLocalPackageManifestV1,
} from '@databreeze/domain/device-sync/v1';
import {
  isDataModePayloadAllowedV1,
  type DataClassificationV1,
  type DataModePolicyVersionV1,
} from '@databreeze/domain/data-mode/v1';
import {
  parseStableIdentifierV1,
  tenantScopeContainsV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { DataModePolicyRepositoryPortV1 } from './data-mode-policy-repository.port.js';
import type {
  DeviceSyncOperationTransitionV1,
  DeviceSyncRepositoryPortV1,
} from './device-sync-repository.port.js';

export type DeviceSyncServiceErrorCodeV1 =
  | DeviceSyncErrorCodeV1
  | 'TENANT_SCOPE_DENIED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'OPERATION_NOT_FOUND'
  | 'CONFLICT_NOT_FOUND'
  | 'PACKAGE_NOT_FOUND'
  | 'POLICY_NOT_FOUND'
  | 'POLICY_UNAVAILABLE'
  | 'POLICY_DENIED'
  | 'REVISION_CONFLICT'
  | 'IMMUTABLE_RECORD'
  | 'RECEIPT_MISMATCH';

export type DeviceSyncServiceResultV1<TValue> =
  | DeviceSyncResultV1<TValue>
  | { readonly accepted: false; readonly code: DeviceSyncServiceErrorCodeV1 };

export interface DeviceSyncPolicyPortV1 {
  find(
    context: IamTenantContextV1,
    policyVersionId: StableIdentifierV1,
  ): Promise<DataModePolicyVersionV1 | undefined>;
}

type OperationInputV1 = Parameters<typeof createDeviceSyncOperationV1>[0] & {
  readonly policyVersionId?: unknown;
  readonly classification?: unknown;
};

function rejected<TValue>(code: DeviceSyncServiceErrorCodeV1): DeviceSyncServiceResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function isClassification(input: unknown): input is DataClassificationV1 {
  return (
    input === 'PUBLIC' || input === 'INTERNAL' || input === 'CONFIDENTIAL' || input === 'RESTRICTED'
  );
}

function mapRepositoryError(error: unknown): DeviceSyncServiceErrorCodeV1 | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.message === 'DSO_SCOPE_NARROWING_REQUIRED') return 'TENANT_SCOPE_DENIED';
  if (error.message === 'DSO_IDEMPOTENCY_CONFLICT') return 'IDEMPOTENCY_CONFLICT';
  if (error.message === 'DSO_REVISION_CONFLICT') return 'REVISION_CONFLICT';
  if (error.message === 'DSO_IMMUTABLE_RECORD') return 'IMMUTABLE_RECORD';
  return undefined;
}

function scopeContains(
  context: IamTenantContextV1,
  candidate: { tenantScope: IamTenantContextV1['tenantScope'] },
): boolean {
  return tenantScopeContainsV1(context.tenantScope, candidate.tenantScope);
}

/** Coordinates device synchronization without exposing local paths, bytes, or provider state. */
export class DeviceSyncService {
  public constructor(
    private readonly repository: DeviceSyncRepositoryPortV1,
    private readonly policy?: DeviceSyncPolicyPortV1,
  ) {}

  public async enqueue(
    context: IamTenantContextV1,
    input: OperationInputV1,
  ): Promise<DeviceSyncServiceResultV1<DeviceSyncOperationV1>> {
    const created = createDeviceSyncOperationV1(input);
    if (!created.accepted) return created;
    if (!scopeContains(context, created.value)) return rejected('TENANT_SCOPE_DENIED');
    const policyResult = await this.checkPolicy(context, input, created.value);
    if (!policyResult.accepted) return policyResult;
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const existing = await transaction.findOperationByIdempotency(
          context,
          context.idempotencyKey,
        );
        if (existing) {
          const equivalent =
            existing.operationId === created.value.operationId &&
            existing.entityId === created.value.entityId &&
            existing.payloadDigest === created.value.payloadDigest &&
            existing.kind === created.value.kind &&
            existing.payloadClass === created.value.payloadClass;
          return equivalent
            ? Object.freeze({ accepted: true as const, value: existing })
            : rejected<DeviceSyncOperationV1>('IDEMPOTENCY_CONFLICT');
        }
        await transaction.saveOperation(context, created.value, {
          idempotencyKey: context.idempotencyKey,
        });
        return created;
      });
    } catch (error) {
      const code = mapRepositoryError(error);
      return code ? rejected(code) : rejected('IMMUTABLE_RECORD');
    }
  }

  public async list(context: IamTenantContextV1): Promise<readonly DeviceSyncOperationV1[]> {
    return this.repository.listOperations(context);
  }

  public async transition(
    context: IamTenantContextV1,
    operationIdInput: unknown,
    transition: DeviceSyncOperationTransitionV1,
    at: unknown,
  ): Promise<DeviceSyncServiceResultV1<DeviceSyncOperationV1>> {
    const operationId = stable(operationIdInput);
    if (!operationId) return rejected('INVALID_IDENTIFIER');
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const current = await transaction.findOperation(context, operationId);
        if (!current) return rejected<DeviceSyncOperationV1>('OPERATION_NOT_FOUND');
        if (context.expectedRevision !== undefined && context.expectedRevision !== current.revision)
          return rejected<DeviceSyncOperationV1>('REVISION_CONFLICT');
        const next = transitionDeviceSyncOperationV1(current, transition, at);
        if (!next.accepted) return next;
        await transaction.saveOperation(context, next.value, {
          expectedRevision: current.revision,
        });
        return next;
      });
    } catch (error) {
      const code = mapRepositoryError(error);
      return code ? rejected(code) : rejected('IMMUTABLE_RECORD');
    }
  }

  public async recordConflict(
    context: IamTenantContextV1,
    input: Parameters<typeof createDeviceSyncConflictV1>[0],
  ): Promise<DeviceSyncServiceResultV1<DeviceSyncConflictV1>> {
    const conflict = createDeviceSyncConflictV1(input);
    if (!conflict.accepted) return conflict;
    if (!scopeContains(context, conflict.value)) return rejected('TENANT_SCOPE_DENIED');
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const operation = await transaction.findOperation(context, conflict.value.operationId);
        if (!operation) return rejected<DeviceSyncConflictV1>('OPERATION_NOT_FOUND');
        const next = transitionDeviceSyncOperationV1(
          operation,
          'CONFLICT',
          conflict.value.detectedAt,
        );
        if (!next.accepted) return rejected<DeviceSyncConflictV1>('REVISION_CONFLICT');
        await transaction.saveOperation(context, next.value, {
          expectedRevision: operation.revision,
        });
        await transaction.saveConflict(context, conflict.value);
        return conflict;
      });
    } catch (error) {
      const code = mapRepositoryError(error);
      return code ? rejected(code) : rejected('IMMUTABLE_RECORD');
    }
  }

  public async listConflicts(
    context: IamTenantContextV1,
    operationIdInput?: unknown,
  ): Promise<readonly DeviceSyncConflictV1[]> {
    const operationId = operationIdInput === undefined ? undefined : stable(operationIdInput);
    return this.repository.listConflicts(context, operationId);
  }

  public async issueStrictLocalPackage(
    context: IamTenantContextV1,
    input: Parameters<typeof createStrictLocalPackageManifestV1>[0],
  ): Promise<DeviceSyncServiceResultV1<StrictLocalPackageManifestV1>> {
    const manifest = createStrictLocalPackageManifestV1(input);
    if (!manifest.accepted) return manifest;
    if (!scopeContains(context, manifest.value)) return rejected('TENANT_SCOPE_DENIED');
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const existing = await transaction.findPackage(context, manifest.value.packageId);
        if (existing) {
          return JSON.stringify(existing) === JSON.stringify(manifest.value)
            ? Object.freeze({ accepted: true as const, value: existing })
            : rejected<StrictLocalPackageManifestV1>('IMMUTABLE_RECORD');
        }
        await transaction.savePackage(context, manifest.value);
        return manifest;
      });
    } catch (error) {
      const code = mapRepositoryError(error);
      return code ? rejected(code) : rejected('IMMUTABLE_RECORD');
    }
  }

  public async recordTransferReceipt(
    context: IamTenantContextV1,
    input: Parameters<typeof createDeviceTransferReceiptV1>[0],
  ): Promise<DeviceSyncServiceResultV1<DeviceTransferReceiptV1>> {
    const receipt = createDeviceTransferReceiptV1(input);
    if (!receipt.accepted) return receipt;
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const manifest = await transaction.findPackage(context, receipt.value.packageId);
        if (!manifest) return rejected<DeviceTransferReceiptV1>('PACKAGE_NOT_FOUND');
        if (
          manifest.packageDigest !== receipt.value.packageDigest ||
          manifest.destinationClass !== receipt.value.destinationClass
        )
          return rejected<DeviceTransferReceiptV1>('RECEIPT_MISMATCH');
        const existing = await transaction.findReceipt(context, receipt.value.receiptId);
        if (existing) {
          return JSON.stringify(existing) === JSON.stringify(receipt.value)
            ? Object.freeze({ accepted: true as const, value: existing })
            : rejected<DeviceTransferReceiptV1>('IMMUTABLE_RECORD');
        }
        await transaction.saveReceipt(context, receipt.value);
        return receipt;
      });
    } catch (error) {
      const code = mapRepositoryError(error);
      return code ? rejected(code) : rejected('IMMUTABLE_RECORD');
    }
  }

  private async checkPolicy(
    context: IamTenantContextV1,
    input: OperationInputV1,
    operation: DeviceSyncOperationV1,
  ): Promise<DeviceSyncServiceResultV1<true>> {
    if (input.policyVersionId === undefined) return Object.freeze({ accepted: true, value: true });
    const policyVersionId = stable(input.policyVersionId);
    if (!policyVersionId) return rejected('INVALID_IDENTIFIER');
    if (!this.policy) return rejected('POLICY_UNAVAILABLE');
    const policy = await this.policy.find(context, policyVersionId);
    if (!policy) return rejected('POLICY_NOT_FOUND');
    const classification = isClassification(input.classification)
      ? input.classification
      : 'INTERNAL';
    return isDataModePayloadAllowedV1(policy, classification, operation.payloadClass)
      ? Object.freeze({ accepted: true, value: true })
      : rejected('POLICY_DENIED');
  }
}

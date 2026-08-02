import {
  createDeviceSyncBatchV1,
  createDeviceSyncChangeV1,
  createDeviceSyncCursorV1,
  createDeviceSyncConflictV1,
  createDeviceSyncOperationV1,
  createDeviceTransferReceiptV1,
  createStrictLocalPackageManifestV1,
  transitionDeviceSyncOperationV1,
  verifyDeviceSyncCursorV1,
  type DeviceSyncBatchV1,
  type DeviceSyncChangeV1,
  type DeviceSyncCursorSignerV1,
  type DeviceSyncCursorV1,
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
import type {
  DeviceSyncOperationChangeV1,
  DeviceSyncOperationTransitionV1,
  DeviceSyncRepositoryPortV1,
} from './device-sync-repository.port.js';
import type {
  DeviceSyncAuthorizationEffectV1,
  DeviceSyncAuthorizationPortV1,
} from './device-sync-authorization.port.js';

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
  | 'RECEIPT_MISMATCH'
  | 'DEVICE_AUTHORIZATION_REQUIRED'
  | 'AUTHORIZATION_UNAVAILABLE'
  | 'DEVICE_REVOKED'
  | 'GRANT_REVOKED'
  | 'GRANT_EXPIRED'
  | 'GRANT_SCOPE_DENIED';

export type DeviceSyncServiceResultV1<TValue> =
  | DeviceSyncResultV1<TValue>
  | { readonly accepted: false; readonly code: DeviceSyncServiceErrorCodeV1 };

export interface DeviceSyncPolicyPortV1 {
  find(
    context: IamTenantContextV1,
    policyVersionId: StableIdentifierV1,
  ): Promise<DataModePolicyVersionV1 | undefined>;
}

export interface DeviceSyncPushItemResultV1 {
  readonly operationId: StableIdentifierV1;
  readonly result: DeviceSyncServiceResultV1<DeviceSyncOperationV1>;
}

export interface DeviceSyncPushResponseV1 {
  readonly cursor: DeviceSyncCursorV1;
  readonly items: readonly DeviceSyncPushItemResultV1[];
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

function pageSize(input: unknown): number | undefined {
  if (input === undefined) return 64;
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 && input <= 256
    ? input
    : undefined;
}

function cursorForVerification(
  context: IamTenantContextV1,
  cursor: DeviceSyncCursorV1,
  input: {
    readonly now: unknown;
    readonly deviceId: unknown;
    readonly minimumRevision: unknown;
    readonly policyVersionId?: unknown;
    readonly policyDigest?: unknown;
    readonly dataMode?: unknown;
    readonly protocolVersion?: unknown;
  },
  signer: DeviceSyncCursorSignerV1,
): DeviceSyncServiceResultV1<true> {
  if (!tenantScopeContainsV1(context.tenantScope, cursor.tenantScope))
    return rejected('TENANT_SCOPE_DENIED');
  return verifyDeviceSyncCursorV1(
    cursor,
    {
      ...input,
      tenantScope: cursor.tenantScope,
      authorizationEpoch: context.authorizationEpoch,
    },
    signer,
  );
}

function changeFromOperation(
  entry: DeviceSyncOperationChangeV1,
): DeviceSyncServiceResultV1<DeviceSyncChangeV1> {
  return createDeviceSyncChangeV1({
    changeId: entry.operation.operationId,
    operationId: entry.operation.operationId,
    deviceId: entry.operation.deviceId,
    tenantScope: entry.operation.tenantScope,
    entityType: entry.operation.entityType,
    entityId: entry.operation.entityId,
    kind: entry.operation.kind,
    payloadClass: entry.operation.payloadClass,
    payloadDigest: entry.operation.payloadDigest,
    dependencyIds: entry.operation.dependencyIds,
    entityRevision: entry.operation.revision,
    createdAt: entry.operation.createdAt,
  });
}

function childIdempotencyKey(base: string, operationId: StableIdentifierV1): string {
  const suffix = `:${operationId}`;
  return `${base.slice(0, Math.max(1, 200 - suffix.length))}${suffix}`;
}

/** Coordinates device synchronization without exposing local paths, bytes, or provider state. */
export class DeviceSyncService {
  public constructor(
    private readonly repository: DeviceSyncRepositoryPortV1,
    private readonly policy?: DeviceSyncPolicyPortV1,
    private readonly authorization?: DeviceSyncAuthorizationPortV1,
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

  public async pull(
    context: IamTenantContextV1,
    input: {
      readonly deviceId: unknown;
      readonly cursor: unknown;
      readonly now: unknown;
      readonly minimumRevision: unknown;
      readonly signer: DeviceSyncCursorSignerV1;
      readonly grantId?: unknown;
      readonly nextCursorId?: unknown;
      readonly pageSize?: unknown;
      readonly policyVersionId?: unknown;
      readonly policyDigest?: unknown;
      readonly dataMode?: unknown;
      readonly protocolVersion?: unknown;
    },
  ): Promise<DeviceSyncServiceResultV1<DeviceSyncBatchV1>> {
    if (!input.cursor || typeof input.cursor !== 'object') return rejected('INVALID_CURSOR');
    const cursor = input.cursor as DeviceSyncCursorV1;
    const authorized = await this.authorizeDevice(context, {
      deviceId: input.deviceId,
      tenantScope: cursor.tenantScope,
      grantId: input.grantId,
      effect: 'READ',
      now: input.now,
    });
    if (!authorized.accepted) return authorized;
    const verification = cursorForVerification(context, cursor, input, input.signer);
    if (!verification.accepted) return verification;
    const limit = pageSize(input.pageSize);
    if (!limit) return rejected('INVALID_BATCH');
    const records = await this.repository.listOperationChanges(
      context,
      cursor.changeRevision,
      limit,
    );
    const changes: DeviceSyncChangeV1[] = [];
    for (const record of records) {
      if (record.operation.deviceId !== input.deviceId) continue;
      const change = changeFromOperation(record);
      if (!change.accepted) return change;
      changes.push(change.value);
    }
    const lastSequence = records.at(-1)?.sequence;
    const nextCursor =
      lastSequence === undefined
        ? undefined
        : createDeviceSyncCursorV1(
            {
              cursorId: input.nextCursorId ?? cursor.cursorId,
              deviceId: input.deviceId,
              tenantScope: cursor.tenantScope,
              authorizationEpoch: cursor.authorizationEpoch,
              changeRevision: lastSequence,
              ...(cursor.policyVersionId === undefined
                ? {}
                : { policyVersionId: cursor.policyVersionId }),
              ...(cursor.policyDigest === undefined ? {} : { policyDigest: cursor.policyDigest }),
              dataMode: cursor.dataMode,
              protocolVersion: cursor.protocolVersion,
              issuedAt: input.now,
              expiresAt: cursor.expiresAt,
            },
            input.signer,
          );
    if (nextCursor !== undefined && !nextCursor.accepted) return nextCursor;
    return createDeviceSyncBatchV1({
      deviceId: input.deviceId,
      tenantScope: cursor.tenantScope,
      cursor,
      ...(nextCursor === undefined ? {} : { nextCursor: nextCursor.value }),
      changes,
    });
  }

  public async push(
    context: IamTenantContextV1,
    input: {
      readonly batch: unknown;
      readonly now: unknown;
      readonly minimumRevision: unknown;
      readonly signer: DeviceSyncCursorSignerV1;
      readonly grantId?: unknown;
    },
  ): Promise<DeviceSyncServiceResultV1<DeviceSyncPushResponseV1>> {
    const batch = createDeviceSyncBatchV1(
      input.batch as Parameters<typeof createDeviceSyncBatchV1>[0],
    );
    if (!batch.accepted) return batch;
    const authorized = await this.authorizeDevice(context, {
      deviceId: batch.value.deviceId,
      tenantScope: batch.value.tenantScope,
      grantId: input.grantId,
      effect: 'WRITE_DERIVATIVE',
      now: input.now,
    });
    if (!authorized.accepted) return authorized;
    const verification = cursorForVerification(
      context,
      batch.value.cursor,
      {
        now: input.now,
        deviceId: batch.value.deviceId,
        minimumRevision: input.minimumRevision,
      },
      input.signer,
    );
    if (!verification.accepted) return verification;
    const items: DeviceSyncPushItemResultV1[] = [];
    for (const change of batch.value.changes) {
      const result = await this.enqueue(
        {
          ...context,
          idempotencyKey: childIdempotencyKey(context.idempotencyKey, change.operationId),
        },
        {
          operationId: change.operationId,
          deviceId: change.deviceId,
          tenantScope: change.tenantScope,
          entityType: change.entityType,
          entityId: change.entityId,
          kind: change.kind,
          payloadClass: change.payloadClass,
          payloadDigest: change.payloadDigest,
          dependencyIds: change.dependencyIds,
          baseRevision: change.entityRevision,
          createdAt: change.createdAt,
          ...(batch.value.cursor.policyVersionId === undefined
            ? {}
            : { policyVersionId: batch.value.cursor.policyVersionId }),
        },
      );
      items.push(Object.freeze({ operationId: change.operationId, result }));
    }
    return Object.freeze({
      accepted: true,
      value: Object.freeze({ cursor: batch.value.cursor, items }),
    });
  }

  private async authorizeDevice(
    context: IamTenantContextV1,
    input: {
      readonly deviceId: unknown;
      readonly tenantScope: unknown;
      readonly grantId?: unknown;
      readonly effect: DeviceSyncAuthorizationEffectV1;
      readonly now: unknown;
    },
  ): Promise<DeviceSyncServiceResultV1<true>> {
    if (input.grantId === undefined) return rejected('DEVICE_AUTHORIZATION_REQUIRED');
    if (!this.authorization) return rejected('AUTHORIZATION_UNAVAILABLE');
    const result = await this.authorization.authorize(context, {
      deviceId: input.deviceId,
      tenantScope: input.tenantScope,
      grantId: input.grantId,
      effect: input.effect,
      now: input.now,
    });
    return result.accepted ? result : rejected(result.code);
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

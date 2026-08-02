import type {
  DeviceSyncConflictV1,
  DeviceSyncOperationV1,
  DeviceTransferReceiptV1,
  StrictLocalPackageManifestV1,
} from '@databreeze/domain/device-sync/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DEVICE_SYNC_REPOSITORY_PORT = Symbol('DEVICE_SYNC_REPOSITORY_PORT');

export interface DeviceSyncOperationChangeV1 {
  readonly sequence: number;
  readonly operation: DeviceSyncOperationV1;
}

export type DeviceSyncOperationTransitionV1 =
  | 'ACCEPT'
  | 'APPLY'
  | 'CONFLICT'
  | 'QUARANTINE'
  | 'REJECT';

export interface DeviceSyncTransactionPortV1 {
  saveOperation(
    context: IamTenantContextV1,
    operation: DeviceSyncOperationV1,
    options?: { readonly idempotencyKey?: string; readonly expectedRevision?: number },
  ): Promise<void>;
  findOperation(
    context: IamTenantContextV1,
    operationId: StableIdentifierV1,
  ): Promise<DeviceSyncOperationV1 | undefined>;
  findOperationByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<DeviceSyncOperationV1 | undefined>;
  listOperations(context: IamTenantContextV1): Promise<readonly DeviceSyncOperationV1[]>;
  listOperationChanges(
    context: IamTenantContextV1,
    afterSequence: number,
    limit: number,
  ): Promise<readonly DeviceSyncOperationChangeV1[]>;
  saveConflict(context: IamTenantContextV1, conflict: DeviceSyncConflictV1): Promise<void>;
  listConflicts(
    context: IamTenantContextV1,
    operationId?: StableIdentifierV1,
  ): Promise<readonly DeviceSyncConflictV1[]>;
  savePackage(context: IamTenantContextV1, manifest: StrictLocalPackageManifestV1): Promise<void>;
  findPackage(
    context: IamTenantContextV1,
    packageId: StableIdentifierV1,
  ): Promise<StrictLocalPackageManifestV1 | undefined>;
  saveReceipt(context: IamTenantContextV1, receipt: DeviceTransferReceiptV1): Promise<void>;
  findReceipt(
    context: IamTenantContextV1,
    receiptId: StableIdentifierV1,
  ): Promise<DeviceTransferReceiptV1 | undefined>;
}

export interface DeviceSyncRepositoryPortV1 extends DeviceSyncTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DeviceSyncTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { DeviceSyncService, DeviceSyncServiceResultV1 } from './device-sync.service.js';
import type {
  DeviceSyncBatchV1,
  DeviceSyncConflictV1,
  DeviceSyncOperationV1,
  DeviceTransferReceiptV1,
  StrictLocalPackageManifestV1,
} from '@databreeze/domain/device-sync/v1';

import type { DeviceSyncOperationTransitionV1 } from './device-sync-repository.port.js';
import type { DeviceSyncPushResponseV1 } from './device-sync.service.js';

export const DEVICE_SYNC_USE_CASE = Symbol('DEVICE_SYNC_USE_CASE');

export interface DeviceSyncUseCaseV1 {
  enqueue(
    context: IamTenantContextV1,
    input: Parameters<DeviceSyncService['enqueue']>[1],
  ): Promise<DeviceSyncServiceResultV1<DeviceSyncOperationV1>>;
  list(context: IamTenantContextV1): Promise<readonly DeviceSyncOperationV1[]>;
  bootstrapCursor(
    context: IamTenantContextV1,
    input: Parameters<DeviceSyncService['bootstrapCursor']>[1],
    signer: Parameters<DeviceSyncService['bootstrapCursor']>[2],
  ): Promise<
    DeviceSyncServiceResultV1<import('@databreeze/domain/device-sync/v1').DeviceSyncCursorV1>
  >;
  pull(
    context: IamTenantContextV1,
    input: Parameters<DeviceSyncService['pull']>[1],
  ): Promise<DeviceSyncServiceResultV1<DeviceSyncBatchV1>>;
  push(
    context: IamTenantContextV1,
    input: Parameters<DeviceSyncService['push']>[1],
  ): Promise<DeviceSyncServiceResultV1<DeviceSyncPushResponseV1>>;
  transition(
    context: IamTenantContextV1,
    operationId: unknown,
    transition: DeviceSyncOperationTransitionV1,
    at: unknown,
  ): Promise<DeviceSyncServiceResultV1<DeviceSyncOperationV1>>;
  recordConflict(
    context: IamTenantContextV1,
    input: Parameters<DeviceSyncService['recordConflict']>[1],
  ): Promise<DeviceSyncServiceResultV1<DeviceSyncConflictV1>>;
  listConflicts(
    context: IamTenantContextV1,
    operationId?: unknown,
  ): Promise<readonly DeviceSyncConflictV1[]>;
  issueStrictLocalPackage(
    context: IamTenantContextV1,
    input: Parameters<DeviceSyncService['issueStrictLocalPackage']>[1],
  ): Promise<DeviceSyncServiceResultV1<StrictLocalPackageManifestV1>>;
  recordTransferReceipt(
    context: IamTenantContextV1,
    input: Parameters<DeviceSyncService['recordTransferReceipt']>[1],
  ): Promise<DeviceSyncServiceResultV1<DeviceTransferReceiptV1>>;
}

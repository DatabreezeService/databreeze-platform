import type {
  AuthorizationSnapshotV1,
  OpaqueDeviceGrantV1,
} from '@databreeze/domain/device-authorization/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DEVICE_AUTHORIZATION_REPOSITORY_PORT = Symbol('DEVICE_AUTHORIZATION_REPOSITORY_PORT');

export interface DeviceAuthorizationTransactionPortV1 {
  saveSnapshot(context: IamTenantContextV1, snapshot: AuthorizationSnapshotV1): Promise<void>;
  findSnapshot(
    context: IamTenantContextV1,
    deviceId: StableIdentifierV1,
  ): Promise<AuthorizationSnapshotV1 | undefined>;
  saveGrant(context: IamTenantContextV1, grant: OpaqueDeviceGrantV1): Promise<void>;
  findGrant(
    context: IamTenantContextV1,
    grantId: StableIdentifierV1,
  ): Promise<OpaqueDeviceGrantV1 | undefined>;
  revokeGrant(
    context: IamTenantContextV1,
    grantId: StableIdentifierV1,
    expectedRevision: number,
  ): Promise<OpaqueDeviceGrantV1 | undefined>;
}

export interface DeviceAuthorizationRepositoryPortV1 extends DeviceAuthorizationTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DeviceAuthorizationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

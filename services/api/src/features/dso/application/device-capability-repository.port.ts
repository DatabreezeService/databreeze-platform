import type { DeviceCapabilityV1, DeviceGrantV1 } from '@databreeze/domain/device-capability/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DEVICE_CAPABILITY_REPOSITORY_PORT = Symbol('DEVICE_CAPABILITY_REPOSITORY_PORT');

export interface DeviceCapabilityTransactionPortV1 {
  saveCapability(context: IamTenantContextV1, capability: DeviceCapabilityV1): Promise<void>;
  findCapability(
    context: IamTenantContextV1,
    capabilityId: StableIdentifierV1,
  ): Promise<DeviceCapabilityV1 | undefined>;
  listCapabilities(
    context: IamTenantContextV1,
    deviceId: StableIdentifierV1,
  ): Promise<readonly DeviceCapabilityV1[]>;
  saveGrant(context: IamTenantContextV1, grant: DeviceGrantV1): Promise<void>;
  findGrant(context: IamTenantContextV1, grantId: StableIdentifierV1): Promise<DeviceGrantV1 | undefined>;
  listGrants(context: IamTenantContextV1, deviceId: StableIdentifierV1): Promise<readonly DeviceGrantV1[]>;
  replaceCapability(
    context: IamTenantContextV1,
    capability: DeviceCapabilityV1,
    expectedRevision: number,
  ): Promise<void>;
  replaceGrant(
    context: IamTenantContextV1,
    grant: DeviceGrantV1,
    expectedRevision: number,
  ): Promise<void>;
}

export interface DeviceCapabilityRepositoryPortV1 extends DeviceCapabilityTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DeviceCapabilityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

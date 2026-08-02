import type { DeviceEnrollmentChallengeV1, DeviceIdentityV1 } from '@databreeze/domain/identity/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from './tenant-context.js';

export const DEVICE_IDENTITY_REPOSITORY_PORT = Symbol('DEVICE_IDENTITY_REPOSITORY_PORT');

export interface DeviceIdentityTransactionPortV1 {
  saveChallenge(context: IamTenantContextV1, challenge: DeviceEnrollmentChallengeV1): Promise<void>;
  findChallenge(
    context: IamTenantContextV1,
    challengeId: StableIdentifierV1,
  ): Promise<DeviceEnrollmentChallengeV1 | undefined>;
  saveDevice(context: IamTenantContextV1, device: DeviceIdentityV1): Promise<void>;
  findDevice(
    context: IamTenantContextV1,
    deviceId: StableIdentifierV1,
  ): Promise<DeviceIdentityV1 | undefined>;
  listDevices(context: IamTenantContextV1): Promise<readonly DeviceIdentityV1[]>;
  replaceDevice(
    context: IamTenantContextV1,
    device: DeviceIdentityV1,
    expectedRevision: number,
  ): Promise<void>;
}

export interface DeviceIdentityRepositoryPortV1 extends DeviceIdentityTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DeviceIdentityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

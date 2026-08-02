import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DEVICE_IDENTITY_AUTHORITY = Symbol('DEVICE_IDENTITY_AUTHORITY');

export type DeviceIdentityAuthorityErrorCodeV1 =
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_REVOKED'
  | 'SECURITY_EPOCH_STALE'
  | 'AUTHORIZATION_UNAVAILABLE';

export type DeviceIdentityAuthorityResultV1 =
  | {
      readonly accepted: true;
      readonly value: { readonly deviceId: string; readonly securityEpoch: number };
    }
  | { readonly accepted: false; readonly code: DeviceIdentityAuthorityErrorCodeV1 };

/** IAM bridge used by DSO; DSO never stores identity status or public keys. */
export interface DeviceIdentityAuthorityPortV1 {
  inspect(
    context: IamTenantContextV1,
    input: { readonly deviceId: unknown; readonly expectedSecurityEpoch?: unknown },
  ): Promise<DeviceIdentityAuthorityResultV1>;
}

/** Safe default for compositions that have not supplied the IAM authority bridge. */
export class UnavailableDeviceIdentityAuthority implements DeviceIdentityAuthorityPortV1 {
  public inspect(
    context: IamTenantContextV1,
    input: Parameters<DeviceIdentityAuthorityPortV1['inspect']>[1],
  ): Promise<DeviceIdentityAuthorityResultV1> {
    void context;
    void input;
    return Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
  }
}

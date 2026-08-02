import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const DEVICE_SYNC_AUTHORIZATION = Symbol('DEVICE_SYNC_AUTHORIZATION');

export type DeviceSyncAuthorizationEffectV1 = 'READ' | 'WRITE_DERIVATIVE' | 'WATCH';

export type DeviceSyncAuthorizationErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'GRANT_SCOPE_DENIED'
  | 'GRANT_REVOKED'
  | 'GRANT_EXPIRED'
  | 'DEVICE_REVOKED'
  | 'AUTHORIZATION_UNAVAILABLE';

export type DeviceSyncAuthorizationResultV1 =
  | { readonly accepted: true; readonly value: true }
  | { readonly accepted: false; readonly code: DeviceSyncAuthorizationErrorCodeV1 };

export interface DeviceSyncAuthorizationPortV1 {
  authorize(
    context: IamTenantContextV1,
    input: {
      readonly deviceId: unknown;
      readonly tenantScope: unknown;
      readonly grantId: unknown;
      readonly effect: DeviceSyncAuthorizationEffectV1;
      readonly now: unknown;
    },
  ): Promise<DeviceSyncAuthorizationResultV1>;
}

/** The API remains fail-closed until composition supplies the IAM-backed grant checker. */
export class UnavailableDeviceSyncAuthorizationAdapter implements DeviceSyncAuthorizationPortV1 {
  public authorize(
    _context: IamTenantContextV1,
    _input: Parameters<DeviceSyncAuthorizationPortV1['authorize']>[1],
  ): Promise<DeviceSyncAuthorizationResultV1> {
    return Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
  }
}

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export type DeviceCapabilityAuthorizationErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'GRANT_NOT_FOUND'
  | 'GRANT_REVOKED'
  | 'GRANT_EXPIRED'
  | 'GRANT_SCOPE_DENIED'
  | 'AUTHORIZATION_UNAVAILABLE';

export type DeviceCapabilityAuthorizationResultV1 =
  | { readonly accepted: true; readonly value: true }
  | { readonly accepted: false; readonly code: DeviceCapabilityAuthorizationErrorCodeV1 };

export interface DeviceCapabilityAuthorizationPortV1 {
  authorizeGrant(
    context: IamTenantContextV1,
    input: {
      readonly deviceId: unknown;
      readonly workspaceId: unknown;
      readonly grantId: unknown;
      readonly actionType: unknown;
      readonly now: unknown;
    },
  ): Promise<DeviceCapabilityAuthorizationResultV1>;
}

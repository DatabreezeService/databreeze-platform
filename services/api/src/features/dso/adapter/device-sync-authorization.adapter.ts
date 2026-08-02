import { DeviceAuthorizationService } from '../application/device-authorization.service.js';
import type {
  DeviceSyncAuthorizationPortV1,
  DeviceSyncAuthorizationResultV1,
} from '../application/device-sync-authorization.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { DeviceIdentityAuthorityPortV1 } from '../application/device-identity-authority.port.js';

/** Bridges synchronization admission to the IAM-owned opaque-grant authority. */
export class DeviceSyncAuthorizationAdapter implements DeviceSyncAuthorizationPortV1 {
  public constructor(
    private readonly authorization: DeviceAuthorizationService,
    private readonly identityAuthority?: DeviceIdentityAuthorityPortV1,
  ) {}

  public async authorize(
    context: IamTenantContextV1,
    input: Parameters<DeviceSyncAuthorizationPortV1['authorize']>[1],
  ): Promise<DeviceSyncAuthorizationResultV1> {
    if (this.identityAuthority) {
      const identity = await this.identityAuthority.inspect(context, { deviceId: input.deviceId });
      if (!identity.accepted) {
        if (identity.code === 'DEVICE_REVOKED')
          return Object.freeze({ accepted: false, code: 'DEVICE_REVOKED' });
        if (identity.code === 'SECURITY_EPOCH_STALE')
          return Object.freeze({ accepted: false, code: 'GRANT_SCOPE_DENIED' });
        return Object.freeze({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
      }
    }
    const result = await this.authorization.checkGrantEffect(context, input.grantId, {
      now: input.now,
      deviceId: input.deviceId,
      tenantScope: input.tenantScope,
      effect: input.effect,
    });
    if (result.accepted) return result;
    if (
      result.code === 'INVALID_IDENTIFIER' ||
      result.code === 'GRANT_REVOKED' ||
      result.code === 'GRANT_EXPIRED' ||
      result.code === 'GRANT_SCOPE_DENIED'
    )
      return Object.freeze({ accepted: false, code: result.code });
    if (result.code === 'EFFECT_DENIED' || result.code === 'INVALID_EFFECT')
      return Object.freeze({ accepted: false, code: 'GRANT_SCOPE_DENIED' });
    return Object.freeze({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
  }
}

import type { DeviceIdentityService } from '../../iam/application/device-identity.service.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DeviceIdentityAuthorityPortV1,
  DeviceIdentityAuthorityResultV1,
} from '../application/device-identity-authority.port.js';

/** Adapts IAM's device lifecycle without duplicating identity state in DSO. */
export class IamDeviceIdentityAuthorityAdapter implements DeviceIdentityAuthorityPortV1 {
  public constructor(private readonly identity: Pick<DeviceIdentityService, 'get'>) {}

  public async inspect(
    context: IamTenantContextV1,
    input: Parameters<DeviceIdentityAuthorityPortV1['inspect']>[1],
  ): Promise<DeviceIdentityAuthorityResultV1> {
    const result = await this.identity.get(context, input.deviceId);
    if (!result.accepted) {
      if (result.code === 'DEVICE_REVOKED' || result.code === 'DEVICE_NOT_FOUND')
        return { accepted: false, code: 'DEVICE_REVOKED' };
      return { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' };
    }
    if (result.value.status !== 'ACTIVE') return { accepted: false, code: 'DEVICE_REVOKED' };
    if (
      input.expectedSecurityEpoch !== undefined &&
      (typeof input.expectedSecurityEpoch !== 'number' ||
        !Number.isSafeInteger(input.expectedSecurityEpoch) ||
        input.expectedSecurityEpoch !== result.value.securityEpoch)
    )
      return { accepted: false, code: 'SECURITY_EPOCH_STALE' };
    return {
      accepted: true,
      value: { deviceId: result.value.id, securityEpoch: result.value.securityEpoch },
    };
  }
}

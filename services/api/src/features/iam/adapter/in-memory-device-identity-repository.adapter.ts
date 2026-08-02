import {
  type DeviceEnrollmentChallengeV1,
  type DeviceIdentityV1,
} from '@databreeze/domain/identity/v1';
import type { IamTenantContextV1 } from '../application/tenant-context.js';
import type {
  DeviceIdentityRepositoryPortV1,
  DeviceIdentityTransactionPortV1,
} from '../application/device-identity-repository.port.js';

function cloneChallenge(challenge: DeviceEnrollmentChallengeV1): DeviceEnrollmentChallengeV1 {
  return Object.freeze({ ...challenge });
}

function cloneDevice(device: DeviceIdentityV1): DeviceIdentityV1 {
  return Object.freeze({ ...device });
}

function organizationContext(context: IamTenantContextV1, organizationId: string): boolean {
  return (
    context.tenantScope.scopeType === 'organization' &&
    context.tenantScope.organizationId === organizationId
  );
}

/** IAM test/local adapter with organization scoping and serialized transactions. */
export class InMemoryDeviceIdentityRepositoryAdapter implements DeviceIdentityRepositoryPortV1 {
  private challenges = new Map<string, DeviceEnrollmentChallengeV1>();
  private devices = new Map<string, DeviceIdentityV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async saveChallenge(
    context: IamTenantContextV1,
    challenge: DeviceEnrollmentChallengeV1,
  ): Promise<void> {
    if (!organizationContext(context, challenge.organizationId)) throw new Error('SCOPE_DENIED');
    const existing = this.challenges.get(challenge.id);
    if (existing) {
      const validTransition =
        existing.status === 'PENDING' &&
        challenge.status === 'USED' &&
        challenge.revision === existing.revision + 1;
      if (!validTransition && JSON.stringify(existing) !== JSON.stringify(challenge))
        throw new Error('IMMUTABLE_CHALLENGE');
    }
    this.challenges.set(challenge.id, cloneChallenge(challenge));
  }

  public async findChallenge(
    context: IamTenantContextV1,
    challengeId: DeviceEnrollmentChallengeV1['id'],
  ): Promise<DeviceEnrollmentChallengeV1 | undefined> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || !organizationContext(context, challenge.organizationId)) return undefined;
    return cloneChallenge(challenge);
  }

  public async saveDevice(context: IamTenantContextV1, device: DeviceIdentityV1): Promise<void> {
    if (!organizationContext(context, device.organizationId)) throw new Error('SCOPE_DENIED');
    const existing = this.devices.get(device.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(device))
      throw new Error('IMMUTABLE_DEVICE');
    this.devices.set(device.id, cloneDevice(device));
  }

  public async findDevice(
    context: IamTenantContextV1,
    deviceId: DeviceIdentityV1['id'],
  ): Promise<DeviceIdentityV1 | undefined> {
    const device = this.devices.get(deviceId);
    if (!device || !organizationContext(context, device.organizationId)) return undefined;
    return cloneDevice(device);
  }

  public async listDevices(context: IamTenantContextV1): Promise<readonly DeviceIdentityV1[]> {
    return [...this.devices.values()]
      .filter((device) => organizationContext(context, device.organizationId))
      .map(cloneDevice);
  }

  public async replaceDevice(
    context: IamTenantContextV1,
    device: DeviceIdentityV1,
    expectedRevision: number,
  ): Promise<void> {
    const current = await this.findDevice(context, device.id);
    if (!current) throw new Error('DEVICE_NOT_FOUND');
    if (current.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
    if (device.revision !== expectedRevision + 1) throw new Error('INVALID_REVISION');
    this.devices.set(device.id, cloneDevice(device));
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DeviceIdentityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const beforeChallenges = new Map(this.challenges);
    const beforeDevices = new Map(this.devices);
    try {
      return await work({
        saveChallenge: this.saveChallenge.bind(this),
        findChallenge: this.findChallenge.bind(this),
        saveDevice: this.saveDevice.bind(this),
        findDevice: this.findDevice.bind(this),
        listDevices: this.listDevices.bind(this),
        replaceDevice: this.replaceDevice.bind(this),
      });
    } catch (error) {
      this.challenges = beforeChallenges;
      this.devices = beforeDevices;
      throw error;
    } finally {
      release();
    }
  }
}

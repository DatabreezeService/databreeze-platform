import type { DeviceCapabilityV1, DeviceGrantV1 } from '@databreeze/domain/device-capability/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DeviceCapabilityRepositoryPortV1,
  DeviceCapabilityTransactionPortV1,
} from '../application/device-capability-repository.port.js';

function cloneCapability(capability: DeviceCapabilityV1): DeviceCapabilityV1 {
  return Object.freeze({ ...capability });
}

function cloneGrant(grant: DeviceGrantV1): DeviceGrantV1 {
  return Object.freeze({
    ...grant,
    allowedActionTypes: Object.freeze([...grant.allowedActionTypes]),
    allowedDataClassifications: Object.freeze([...grant.allowedDataClassifications]),
    synchronizationPayloadClasses: Object.freeze([...grant.synchronizationPayloadClasses]),
  });
}

function capabilityVisible(context: IamTenantContextV1, capability: DeviceCapabilityV1): boolean {
  return capability.organizationId === context.tenantScope.organizationId;
}

function grantVisible(context: IamTenantContextV1, grant: DeviceGrantV1): boolean {
  return (
    context.tenantScope.scopeType === 'workspace' &&
    grant.organizationId === context.tenantScope.organizationId &&
    grant.workspaceId === context.tenantScope.workspaceId
  );
}

/** In-memory DSO capability/grant adapter with immutable revisions and tenant filters. */
export class InMemoryDeviceCapabilityRepositoryAdapter implements DeviceCapabilityRepositoryPortV1 {
  private capabilities = new Map<string, DeviceCapabilityV1>();
  private grants = new Map<string, DeviceGrantV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async saveCapability(
    context: IamTenantContextV1,
    capability: DeviceCapabilityV1,
  ): Promise<void> {
    if (!capabilityVisible(context, capability)) throw new Error('SCOPE_DENIED');
    const existing = this.capabilities.get(capability.capabilityId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(capability))
      throw new Error('IMMUTABLE_CAPABILITY');
    this.capabilities.set(capability.capabilityId, cloneCapability(capability));
  }

  public async findCapability(
    context: IamTenantContextV1,
    capabilityId: DeviceCapabilityV1['capabilityId'],
  ): Promise<DeviceCapabilityV1 | undefined> {
    const capability = this.capabilities.get(capabilityId);
    return capability && capabilityVisible(context, capability)
      ? cloneCapability(capability)
      : undefined;
  }

  public async listCapabilities(
    context: IamTenantContextV1,
    deviceId: DeviceCapabilityV1['deviceId'],
  ): Promise<readonly DeviceCapabilityV1[]> {
    return [...this.capabilities.values()]
      .filter(
        (capability) => capability.deviceId === deviceId && capabilityVisible(context, capability),
      )
      .sort((left, right) => left.capabilityId.localeCompare(right.capabilityId))
      .map(cloneCapability);
  }

  public async saveGrant(context: IamTenantContextV1, grant: DeviceGrantV1): Promise<void> {
    if (!grantVisible(context, grant)) throw new Error('SCOPE_DENIED');
    const existing = this.grants.get(grant.grantId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(grant))
      throw new Error('IMMUTABLE_GRANT');
    this.grants.set(grant.grantId, cloneGrant(grant));
  }

  public async findGrant(
    context: IamTenantContextV1,
    grantId: DeviceGrantV1['grantId'],
  ): Promise<DeviceGrantV1 | undefined> {
    const grant = this.grants.get(grantId);
    return grant && grantVisible(context, grant) ? cloneGrant(grant) : undefined;
  }

  public async listGrants(
    context: IamTenantContextV1,
    deviceId: DeviceGrantV1['deviceId'],
  ): Promise<readonly DeviceGrantV1[]> {
    return [...this.grants.values()]
      .filter((grant) => grant.deviceId === deviceId && grantVisible(context, grant))
      .sort((left, right) => left.grantId.localeCompare(right.grantId))
      .map(cloneGrant);
  }

  public async replaceCapability(
    context: IamTenantContextV1,
    capability: DeviceCapabilityV1,
    expectedRevision: number,
  ): Promise<void> {
    const current = await this.findCapability(context, capability.capabilityId);
    if (!current) throw new Error('CAPABILITY_NOT_FOUND');
    if (current.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
    this.capabilities.set(capability.capabilityId, cloneCapability(capability));
  }

  public async replaceGrant(
    context: IamTenantContextV1,
    grant: DeviceGrantV1,
    expectedRevision: number,
  ): Promise<void> {
    const current = await this.findGrant(context, grant.grantId);
    if (!current) throw new Error('GRANT_NOT_FOUND');
    if (current.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
    this.grants.set(grant.grantId, cloneGrant(grant));
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DeviceCapabilityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const beforeCapabilities = new Map(this.capabilities);
    const beforeGrants = new Map(this.grants);
    try {
      return await work({
        saveCapability: this.saveCapability.bind(this),
        findCapability: this.findCapability.bind(this),
        listCapabilities: this.listCapabilities.bind(this),
        saveGrant: this.saveGrant.bind(this),
        findGrant: this.findGrant.bind(this),
        listGrants: this.listGrants.bind(this),
        replaceCapability: this.replaceCapability.bind(this),
        replaceGrant: this.replaceGrant.bind(this),
      });
    } catch (error) {
      this.capabilities = beforeCapabilities;
      this.grants = beforeGrants;
      throw error;
    } finally {
      release();
    }
  }
}

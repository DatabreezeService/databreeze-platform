import {
  createDeviceCapabilityV1,
  createDeviceGrantV1,
  transitionDeviceCapabilityV1,
  transitionDeviceGrantV1,
  type DeviceCapabilityV1,
  type DeviceGrantV1,
  type DeviceCapabilityErrorCodeV1,
} from '@databreeze/domain/device-capability/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { DeviceCapabilityRepositoryPortV1 } from './device-capability-repository.port.js';
import type {
  DeviceCapabilityAuthorizationPortV1,
  DeviceCapabilityAuthorizationResultV1,
} from './device-capability-authorization.port.js';

export const DEVICE_CAPABILITY_SERVICE = Symbol('DEVICE_CAPABILITY_SERVICE');

export type DeviceCapabilityApplicationErrorCodeV1 =
  | DeviceCapabilityErrorCodeV1
  | 'CAPABILITY_NOT_FOUND'
  | 'GRANT_NOT_FOUND'
  | 'SCOPE_DENIED'
  | 'REVISION_CONFLICT'
  | 'IMMUTABLE_RECORD'
  | 'PERSISTENCE_UNAVAILABLE';

export type DeviceCapabilityApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DeviceCapabilityApplicationErrorCodeV1 };

function rejected<TValue>(
  code: DeviceCapabilityApplicationErrorCodeV1,
): DeviceCapabilityApplicationResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function domainResult<TValue>(
  result:
    | { readonly accepted: true; readonly value: TValue }
    | { readonly accepted: false; readonly code: DeviceCapabilityErrorCodeV1 },
): DeviceCapabilityApplicationResultV1<TValue> {
  return result.accepted ? result : rejected(result.code);
}

function mapRepositoryError(error: unknown): DeviceCapabilityApplicationErrorCodeV1 {
  if (!(error instanceof Error)) return 'PERSISTENCE_UNAVAILABLE';
  if (error.message === 'SCOPE_DENIED' || error.message === 'DSO_SCOPE_DENIED')
    return 'SCOPE_DENIED';
  if (error.message === 'REVISION_CONFLICT' || error.message === 'DSO_REVISION_CONFLICT')
    return 'REVISION_CONFLICT';
  if (error.message === 'CAPABILITY_NOT_FOUND' || error.message === 'DSO_CAPABILITY_NOT_FOUND')
    return 'CAPABILITY_NOT_FOUND';
  if (error.message === 'GRANT_NOT_FOUND' || error.message === 'DSO_GRANT_NOT_FOUND')
    return 'GRANT_NOT_FOUND';
  if (error.message.includes('IMMUTABLE')) return 'IMMUTABLE_RECORD';
  return 'PERSISTENCE_UNAVAILABLE';
}

function authorizationRejected(
  code: Exclude<
    DeviceCapabilityAuthorizationResultV1,
    { readonly accepted: true; readonly value: true }
  >['code'],
): DeviceCapabilityAuthorizationResultV1 {
  return Object.freeze({ accepted: false, code });
}

/** Coordinates DSO capability/grant state without owning IAM identity lifecycle. */
export class DeviceCapabilityService implements DeviceCapabilityAuthorizationPortV1 {
  public constructor(private readonly repository: DeviceCapabilityRepositoryPortV1) {}

  public async report(
    context: IamTenantContextV1,
    input: {
      readonly capabilityId: unknown;
      readonly deviceId: unknown;
      readonly type: unknown;
      readonly opaqueLocalHandle?: unknown;
      readonly constraintDigest: unknown;
      readonly reportedAt: unknown;
    },
  ): Promise<DeviceCapabilityApplicationResultV1<DeviceCapabilityV1>> {
    const created = createDeviceCapabilityV1({
      ...input,
      organizationId: context.tenantScope.organizationId,
    });
    if (!created.accepted) return domainResult(created);
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        await transaction.saveCapability(context, created.value);
        return created;
      });
    } catch (error) {
      return rejected(mapRepositoryError(error));
    }
  }

  public async listCapabilities(
    context: IamTenantContextV1,
    deviceIdInput: unknown,
  ): Promise<DeviceCapabilityApplicationResultV1<readonly DeviceCapabilityV1[]>> {
    const deviceId = stable(deviceIdInput);
    if (!deviceId) return rejected('INVALID_IDENTIFIER');
    return { accepted: true, value: await this.repository.listCapabilities(context, deviceId) };
  }

  public async listGrants(
    context: IamTenantContextV1,
    deviceIdInput: unknown,
  ): Promise<DeviceCapabilityApplicationResultV1<readonly DeviceGrantV1[]>> {
    const deviceId = stable(deviceIdInput);
    if (!deviceId) return rejected('INVALID_IDENTIFIER');
    if (context.tenantScope.scopeType !== 'workspace') return rejected('SCOPE_DENIED');
    return { accepted: true, value: await this.repository.listGrants(context, deviceId) };
  }

  public async authorizeGrant(
    context: IamTenantContextV1,
    input: Parameters<DeviceCapabilityAuthorizationPortV1['authorizeGrant']>[1],
  ): Promise<DeviceCapabilityAuthorizationResultV1> {
    if (context.tenantScope.scopeType !== 'workspace')
      return authorizationRejected('GRANT_SCOPE_DENIED');
    const deviceId = stable(input.deviceId);
    const workspaceId = stable(input.workspaceId);
    const grantId = stable(input.grantId);
    if (!deviceId || !workspaceId || !grantId) return authorizationRejected('INVALID_IDENTIFIER');
    if (workspaceId !== context.tenantScope.workspaceId)
      return authorizationRejected('GRANT_SCOPE_DENIED');
    const actionType = input.actionType;
    const now = input.now;
    if (typeof actionType !== 'string' || !/^[A-Z][A-Z0-9._-]{0,63}$/u.test(actionType))
      return authorizationRejected('GRANT_SCOPE_DENIED');
    if (typeof now !== 'string' || !Number.isFinite(Date.parse(now)))
      return authorizationRejected('GRANT_EXPIRED');
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const grant = await transaction.findGrant(context, grantId);
        if (!grant) return authorizationRejected('GRANT_NOT_FOUND');
        if (
          grant.deviceId !== deviceId ||
          grant.organizationId !== context.tenantScope.organizationId ||
          grant.workspaceId !== workspaceId ||
          grant.authorizationEpoch !== context.authorizationEpoch
        )
          return authorizationRejected('GRANT_SCOPE_DENIED');
        if (grant.status === 'REVOKED') return authorizationRejected('GRANT_REVOKED');
        if (
          grant.status === 'EXPIRED' ||
          (grant.expiresAt !== undefined && Date.parse(grant.expiresAt) <= Date.parse(now))
        )
          return authorizationRejected('GRANT_EXPIRED');
        return grant.allowedActionTypes.includes(actionType)
          ? { accepted: true, value: true }
          : authorizationRejected('GRANT_SCOPE_DENIED');
      });
    } catch {
      return authorizationRejected('AUTHORIZATION_UNAVAILABLE');
    }
  }

  public async issueGrant(
    context: IamTenantContextV1,
    input: {
      readonly grantId: unknown;
      readonly deviceId: unknown;
      readonly capabilityId: unknown;
      readonly workspaceId: unknown;
      readonly authorizationEpoch: unknown;
      readonly allowedActionTypes: unknown;
      readonly allowedDataClassifications: unknown;
      readonly synchronizationPayloadClasses: unknown;
      readonly issuedAt: unknown;
      readonly expiresAt?: unknown;
    },
  ): Promise<DeviceCapabilityApplicationResultV1<DeviceGrantV1>> {
    if (context.tenantScope.scopeType !== 'workspace') return rejected('SCOPE_DENIED');
    const capabilityId = stable(input.capabilityId);
    const deviceId = stable(input.deviceId);
    const workspaceId = stable(input.workspaceId);
    if (!capabilityId || !deviceId || !workspaceId) return rejected('INVALID_IDENTIFIER');
    if (workspaceId !== context.tenantScope.workspaceId) return rejected('SCOPE_DENIED');
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const capability = await transaction.findCapability(context, capabilityId);
        if (!capability) return rejected('CAPABILITY_NOT_FOUND');
        if (
          capability.deviceId !== deviceId ||
          capability.organizationId !== context.tenantScope.organizationId
        )
          return rejected('SCOPE_DENIED');
        const created = createDeviceGrantV1({
          ...input,
          organizationId: context.tenantScope.organizationId,
          capabilityId,
          deviceId,
          workspaceId,
        });
        if (!created.accepted) return domainResult(created);
        await transaction.saveGrant(context, created.value);
        return created;
      });
    } catch (error) {
      return rejected(mapRepositoryError(error));
    }
  }

  public async revokeGrant(
    context: IamTenantContextV1,
    grantIdInput: unknown,
    expectedRevision: number,
  ): Promise<DeviceCapabilityApplicationResultV1<DeviceGrantV1>> {
    const grantId = stable(grantIdInput);
    if (!grantId) return rejected('INVALID_IDENTIFIER');
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const current = await transaction.findGrant(context, grantId);
        if (!current) return rejected('GRANT_NOT_FOUND');
        if (current.revision !== expectedRevision) return rejected('REVISION_CONFLICT');
        const revoked = transitionDeviceGrantV1(current, 'REVOKE');
        if (!revoked.accepted) return domainResult(revoked);
        await transaction.replaceGrant(context, revoked.value, expectedRevision);
        return revoked;
      });
    } catch (error) {
      return rejected(mapRepositoryError(error));
    }
  }

  public async pauseCapability(
    context: IamTenantContextV1,
    capabilityIdInput: unknown,
    expectedRevision: number,
    at: unknown,
    deviceIdInput?: unknown,
  ): Promise<DeviceCapabilityApplicationResultV1<DeviceCapabilityV1>> {
    const capabilityId = stable(capabilityIdInput);
    if (!capabilityId) return rejected('INVALID_IDENTIFIER');
    const deviceId = deviceIdInput === undefined ? undefined : stable(deviceIdInput);
    if (deviceIdInput !== undefined && !deviceId) return rejected('INVALID_IDENTIFIER');
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const current = await transaction.findCapability(context, capabilityId);
        if (!current) return rejected('CAPABILITY_NOT_FOUND');
        if (deviceId !== undefined && current.deviceId !== deviceId)
          return rejected('SCOPE_DENIED');
        if (current.revision !== expectedRevision) return rejected('REVISION_CONFLICT');
        const paused = transitionDeviceCapabilityV1(current, 'PAUSE', at);
        if (!paused.accepted) return domainResult(paused);
        await transaction.replaceCapability(context, paused.value, expectedRevision);
        return paused;
      });
    } catch (error) {
      return rejected(mapRepositoryError(error));
    }
  }
}

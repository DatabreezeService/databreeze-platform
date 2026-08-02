import {
  createDeviceCapabilityV1,
  createDeviceGrantV1,
  type DeviceCapabilityV1,
  type DeviceGrantV1,
} from '@databreeze/domain/device-capability/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DeviceCapabilityRepositoryPortV1,
  DeviceCapabilityTransactionPortV1,
} from '../application/device-capability-repository.port.js';

export interface DeviceCapabilityDatabaseRowV1 {
  readonly id: string;
  readonly deviceId: string;
  readonly organizationId: string;
  readonly capabilityType: string;
  readonly opaqueLocalHandle: string | null;
  readonly constraintDigest: string;
  readonly status: string;
  readonly reportedAt: Date;
  readonly revision: number;
}

export interface DeviceOperationalGrantDatabaseRowV1 {
  readonly id: string;
  readonly deviceId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly capabilityId: string;
  readonly authorizationEpoch: number;
  readonly allowedActionTypes: unknown;
  readonly allowedDataClassifications: unknown;
  readonly synchronizationPayloadClasses: unknown;
  readonly issuedAt: Date;
  readonly expiresAt: Date | null;
  readonly status: string;
  readonly revision: number;
}

interface DelegateV1<TRow, TCreate, TUpdate = never> {
  create(input: { readonly data: TCreate }): Promise<TRow>;
  findUnique(input: { readonly where: { readonly id: string } }): Promise<TRow | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<readonly TRow[]>;
  update?(input: {
    readonly where: { readonly id: string };
    readonly data: TUpdate;
  }): Promise<TRow>;
}

export interface DeviceCapabilityDatabaseCreateDataV1 {
  readonly id: string;
  readonly deviceId: string;
  readonly organizationId: string;
  readonly capabilityType: DeviceCapabilityV1['type'];
  readonly opaqueLocalHandle: string | null;
  readonly constraintDigest: string;
  readonly status: DeviceCapabilityV1['status'];
  readonly reportedAt: Date;
  readonly revision: number;
}

export interface DeviceCapabilityDatabaseUpdateDataV1 {
  readonly status: DeviceCapabilityV1['status'];
  readonly reportedAt: Date;
  readonly revision: number;
}

export interface DeviceOperationalGrantDatabaseCreateDataV1 {
  readonly id: string;
  readonly deviceId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly capabilityId: string;
  readonly authorizationEpoch: number;
  readonly allowedActionTypes: readonly string[];
  readonly allowedDataClassifications: readonly DeviceGrantV1['allowedDataClassifications'][number][];
  readonly synchronizationPayloadClasses: readonly DeviceGrantV1['synchronizationPayloadClasses'][number][];
  readonly issuedAt: Date;
  readonly expiresAt: Date | null;
  readonly status: DeviceGrantV1['status'];
  readonly revision: number;
}

export interface DeviceOperationalGrantDatabaseUpdateDataV1 {
  readonly status: DeviceGrantV1['status'];
  readonly revision: number;
}

export interface DeviceCapabilityDatabaseClientV1 {
  readonly deviceCapabilityRecord: DelegateV1<
    DeviceCapabilityDatabaseRowV1,
    DeviceCapabilityDatabaseCreateDataV1,
    DeviceCapabilityDatabaseUpdateDataV1
  >;
  readonly deviceOperationalGrantRecord: DelegateV1<
    DeviceOperationalGrantDatabaseRowV1,
    DeviceOperationalGrantDatabaseCreateDataV1,
    DeviceOperationalGrantDatabaseUpdateDataV1
  >;
  $transaction<TValue>(
    work: (transaction: DeviceCapabilityDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function stableIdentifier(value: string): string {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('DSO_PERSISTED_IDENTIFIER_INVALID');
  return parsed.value;
}

function listOfStrings(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string'))
    throw new Error('DSO_PERSISTED_COLLECTION_INVALID');
  return Object.freeze([...value]);
}

function capabilityFromRow(row: DeviceCapabilityDatabaseRowV1): DeviceCapabilityV1 {
  const created = createDeviceCapabilityV1({
    capabilityId: row.id,
    deviceId: row.deviceId,
    organizationId: row.organizationId,
    type: row.capabilityType,
    ...(row.opaqueLocalHandle === null ? {} : { opaqueLocalHandle: row.opaqueLocalHandle }),
    constraintDigest: row.constraintDigest,
    reportedAt: row.reportedAt.toISOString(),
  });
  if (!created.accepted) throw new Error('DSO_PERSISTED_CAPABILITY_INVALID');
  if (!['ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED'].includes(row.status))
    throw new Error('DSO_PERSISTED_CAPABILITY_INVALID');
  if (!Number.isSafeInteger(row.revision) || row.revision < 1)
    throw new Error('DSO_PERSISTED_REVISION_INVALID');
  return Object.freeze({
    ...created.value,
    status: row.status as DeviceCapabilityV1['status'],
    revision: row.revision,
  });
}

function grantFromRow(row: DeviceOperationalGrantDatabaseRowV1): DeviceGrantV1 {
  const created = createDeviceGrantV1({
    grantId: row.id,
    deviceId: row.deviceId,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    capabilityId: row.capabilityId,
    authorizationEpoch: row.authorizationEpoch,
    allowedActionTypes: row.allowedActionTypes,
    allowedDataClassifications: row.allowedDataClassifications,
    synchronizationPayloadClasses: row.synchronizationPayloadClasses,
    issuedAt: row.issuedAt.toISOString(),
    ...(row.expiresAt === null ? {} : { expiresAt: row.expiresAt.toISOString() }),
  });
  if (!created.accepted) throw new Error('DSO_PERSISTED_GRANT_INVALID');
  if (!['ACTIVE', 'REVOKED', 'EXPIRED'].includes(row.status))
    throw new Error('DSO_PERSISTED_GRANT_INVALID');
  if (!Number.isSafeInteger(row.revision) || row.revision < 1)
    throw new Error('DSO_PERSISTED_REVISION_INVALID');
  return Object.freeze({
    ...created.value,
    status: row.status as DeviceGrantV1['status'],
    revision: row.revision,
  });
}

function capabilityCreateData(
  capability: DeviceCapabilityV1,
): DeviceCapabilityDatabaseCreateDataV1 {
  return {
    id: capability.capabilityId,
    deviceId: capability.deviceId,
    organizationId: capability.organizationId,
    capabilityType: capability.type,
    opaqueLocalHandle: capability.opaqueLocalHandle ?? null,
    constraintDigest: capability.constraintDigest,
    status: capability.status,
    reportedAt: new Date(capability.reportedAt),
    revision: capability.revision,
  };
}

function grantCreateData(grant: DeviceGrantV1): DeviceOperationalGrantDatabaseCreateDataV1 {
  return {
    id: grant.grantId,
    deviceId: grant.deviceId,
    organizationId: grant.organizationId,
    workspaceId: grant.workspaceId,
    capabilityId: grant.capabilityId,
    authorizationEpoch: grant.authorizationEpoch,
    allowedActionTypes: grant.allowedActionTypes,
    allowedDataClassifications: grant.allowedDataClassifications,
    synchronizationPayloadClasses: grant.synchronizationPayloadClasses,
    issuedAt: new Date(grant.issuedAt),
    expiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
    status: grant.status,
    revision: grant.revision,
  };
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

class PrismaDeviceCapabilityTransactionAdapter implements DeviceCapabilityTransactionPortV1 {
  public constructor(private readonly client: DeviceCapabilityDatabaseClientV1) {}

  public async saveCapability(
    context: IamTenantContextV1,
    capability: DeviceCapabilityV1,
  ): Promise<void> {
    if (!capabilityVisible(context, capability)) throw new Error('DSO_SCOPE_DENIED');
    const existing = await this.client.deviceCapabilityRecord.findUnique({
      where: { id: capability.capabilityId },
    });
    if (existing !== null) {
      if (JSON.stringify(capabilityFromRow(existing)) !== JSON.stringify(capability))
        throw new Error('DSO_IMMUTABLE_CAPABILITY');
      return;
    }
    await this.client.deviceCapabilityRecord.create({ data: capabilityCreateData(capability) });
  }

  public async findCapability(
    context: IamTenantContextV1,
    capabilityId: DeviceCapabilityV1['capabilityId'],
  ): Promise<DeviceCapabilityV1 | undefined> {
    const row = await this.client.deviceCapabilityRecord.findUnique({
      where: { id: capabilityId },
    });
    if (row === null) return undefined;
    const capability = capabilityFromRow(row);
    return capabilityVisible(context, capability) ? capability : undefined;
  }

  public async listCapabilities(
    context: IamTenantContextV1,
    deviceId: DeviceCapabilityV1['deviceId'],
  ): Promise<readonly DeviceCapabilityV1[]> {
    const rows = await this.client.deviceCapabilityRecord.findMany({
      where: { organizationId: context.tenantScope.organizationId, deviceId },
      orderBy: { reportedAt: 'desc' },
    });
    return rows
      .map(capabilityFromRow)
      .filter((capability) => capabilityVisible(context, capability));
  }

  public async saveGrant(context: IamTenantContextV1, grant: DeviceGrantV1): Promise<void> {
    if (!grantVisible(context, grant)) throw new Error('DSO_SCOPE_DENIED');
    const existing = await this.client.deviceOperationalGrantRecord.findUnique({
      where: { id: grant.grantId },
    });
    if (existing !== null) {
      if (JSON.stringify(grantFromRow(existing)) !== JSON.stringify(grant))
        throw new Error('DSO_IMMUTABLE_GRANT');
      return;
    }
    await this.client.deviceOperationalGrantRecord.create({ data: grantCreateData(grant) });
  }

  public async findGrant(
    context: IamTenantContextV1,
    grantId: DeviceGrantV1['grantId'],
  ): Promise<DeviceGrantV1 | undefined> {
    const row = await this.client.deviceOperationalGrantRecord.findUnique({
      where: { id: grantId },
    });
    if (row === null) return undefined;
    const grant = grantFromRow(row);
    return grantVisible(context, grant) ? grant : undefined;
  }

  public async listGrants(
    context: IamTenantContextV1,
    deviceId: DeviceGrantV1['deviceId'],
  ): Promise<readonly DeviceGrantV1[]> {
    if (context.tenantScope.scopeType !== 'workspace') return [];
    const rows = await this.client.deviceOperationalGrantRecord.findMany({
      where: {
        organizationId: context.tenantScope.organizationId,
        workspaceId: context.tenantScope.workspaceId,
        deviceId,
      },
      orderBy: { issuedAt: 'desc' },
    });
    return rows.map(grantFromRow).filter((grant) => grantVisible(context, grant));
  }

  public async replaceCapability(
    context: IamTenantContextV1,
    capability: DeviceCapabilityV1,
    expectedRevision: number,
  ): Promise<void> {
    const current = await this.findCapability(context, capability.capabilityId);
    if (!current) throw new Error('DSO_CAPABILITY_NOT_FOUND');
    if (current.revision !== expectedRevision) throw new Error('DSO_REVISION_CONFLICT');
    if (
      current.deviceId !== capability.deviceId ||
      current.organizationId !== capability.organizationId ||
      current.type !== capability.type ||
      current.constraintDigest !== capability.constraintDigest ||
      current.opaqueLocalHandle !== capability.opaqueLocalHandle
    )
      throw new Error('DSO_IMMUTABLE_CAPABILITY');
    if (!this.client.deviceCapabilityRecord.update) throw new Error('DSO_UPDATE_UNAVAILABLE');
    await this.client.deviceCapabilityRecord.update({
      where: { id: capability.capabilityId },
      data: {
        status: capability.status,
        reportedAt: new Date(capability.reportedAt),
        revision: capability.revision,
      },
    });
  }

  public async replaceGrant(
    context: IamTenantContextV1,
    grant: DeviceGrantV1,
    expectedRevision: number,
  ): Promise<void> {
    const current = await this.findGrant(context, grant.grantId);
    if (!current) throw new Error('DSO_GRANT_NOT_FOUND');
    if (current.revision !== expectedRevision) throw new Error('DSO_REVISION_CONFLICT');
    if (
      current.deviceId !== grant.deviceId ||
      current.organizationId !== grant.organizationId ||
      current.workspaceId !== grant.workspaceId ||
      current.capabilityId !== grant.capabilityId ||
      current.authorizationEpoch !== grant.authorizationEpoch
    )
      throw new Error('DSO_IMMUTABLE_GRANT');
    if (!this.client.deviceOperationalGrantRecord.update) throw new Error('DSO_UPDATE_UNAVAILABLE');
    await this.client.deviceOperationalGrantRecord.update({
      where: { id: grant.grantId },
      data: { status: grant.status, revision: grant.revision },
    });
  }
}

export class PrismaDeviceCapabilityRepositoryAdapter implements DeviceCapabilityRepositoryPortV1 {
  public constructor(private readonly client: DeviceCapabilityDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DeviceCapabilityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaDeviceCapabilityTransactionAdapter(transaction)),
    );
  }

  public saveCapability(
    context: IamTenantContextV1,
    capability: DeviceCapabilityV1,
  ): Promise<void> {
    return new PrismaDeviceCapabilityTransactionAdapter(this.client).saveCapability(
      context,
      capability,
    );
  }

  public findCapability(
    context: IamTenantContextV1,
    capabilityId: DeviceCapabilityV1['capabilityId'],
  ): Promise<DeviceCapabilityV1 | undefined> {
    return new PrismaDeviceCapabilityTransactionAdapter(this.client).findCapability(
      context,
      capabilityId,
    );
  }

  public listCapabilities(
    context: IamTenantContextV1,
    deviceId: DeviceCapabilityV1['deviceId'],
  ): Promise<readonly DeviceCapabilityV1[]> {
    return new PrismaDeviceCapabilityTransactionAdapter(this.client).listCapabilities(
      context,
      deviceId,
    );
  }

  public saveGrant(context: IamTenantContextV1, grant: DeviceGrantV1): Promise<void> {
    return new PrismaDeviceCapabilityTransactionAdapter(this.client).saveGrant(context, grant);
  }

  public findGrant(
    context: IamTenantContextV1,
    grantId: DeviceGrantV1['grantId'],
  ): Promise<DeviceGrantV1 | undefined> {
    return new PrismaDeviceCapabilityTransactionAdapter(this.client).findGrant(context, grantId);
  }

  public listGrants(
    context: IamTenantContextV1,
    deviceId: DeviceGrantV1['deviceId'],
  ): Promise<readonly DeviceGrantV1[]> {
    return new PrismaDeviceCapabilityTransactionAdapter(this.client).listGrants(context, deviceId);
  }

  public replaceCapability(
    context: IamTenantContextV1,
    capability: DeviceCapabilityV1,
    expectedRevision: number,
  ): Promise<void> {
    return new PrismaDeviceCapabilityTransactionAdapter(this.client).replaceCapability(
      context,
      capability,
      expectedRevision,
    );
  }

  public replaceGrant(
    context: IamTenantContextV1,
    grant: DeviceGrantV1,
    expectedRevision: number,
  ): Promise<void> {
    return new PrismaDeviceCapabilityTransactionAdapter(this.client).replaceGrant(
      context,
      grant,
      expectedRevision,
    );
  }
}

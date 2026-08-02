import {
  createAuthorizationSnapshotV1,
  createOpaqueDeviceGrantV1,
  type AuthorizationSnapshotV1,
  type OpaqueDeviceGrantV1,
} from '@databreeze/domain/device-authorization/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DeviceAuthorizationRepositoryPortV1,
  DeviceAuthorizationTransactionPortV1,
} from '../application/device-authorization-repository.port.js';

export interface DeviceAuthorizationSnapshotDatabaseRowV1 {
  readonly id: string;
  readonly deviceId: string;
  readonly userId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly authorizationEpoch: number;
  readonly snapshotRevision: number;
  readonly permissions: unknown;
  readonly dataMode: string;
  readonly payload: string;
  readonly signature: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface DeviceGrantDatabaseRowV1 {
  readonly id: string;
  readonly deviceId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly bindingId: string;
  readonly capabilityDigest: string;
  readonly authorizationEpoch: number;
  readonly effects: unknown;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly status: OpaqueDeviceGrantV1['status'];
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

export interface DeviceAuthorizationDatabaseClientV1 {
  /** IAM owns snapshots; DSO only consumes them for offline verification. */
  readonly authorizationSnapshot: DelegateV1<
    DeviceAuthorizationSnapshotDatabaseRowV1,
    DeviceAuthorizationSnapshotDatabaseCreateDataV1
  >;
  readonly deviceGrantRecord: DelegateV1<
    DeviceGrantDatabaseRowV1,
    DeviceGrantDatabaseCreateDataV1,
    DeviceGrantDatabaseUpdateDataV1
  >;
  $transaction<TValue>(
    work: (transaction: DeviceAuthorizationDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

export interface DeviceAuthorizationSnapshotDatabaseCreateDataV1 {
  readonly id: string;
  readonly deviceId: string;
  readonly userId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly authorizationEpoch: number;
  readonly snapshotRevision: number;
  readonly permissions: readonly string[];
  readonly dataMode: AuthorizationSnapshotV1['dataMode'];
  readonly payload: string;
  readonly signature: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface DeviceGrantDatabaseCreateDataV1 {
  readonly id: string;
  readonly deviceId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly bindingId: string;
  readonly capabilityDigest: string;
  readonly authorizationEpoch: number;
  readonly effects: readonly OpaqueDeviceGrantV1['effects'][number][];
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly status: OpaqueDeviceGrantV1['status'];
  readonly revision: number;
}

export interface DeviceGrantDatabaseUpdateDataV1 {
  readonly status: OpaqueDeviceGrantV1['status'];
  readonly revision: number;
}

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function domainScope(row: {
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
}): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('DSO_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function snapshotFromRow(row: DeviceAuthorizationSnapshotDatabaseRowV1): AuthorizationSnapshotV1 {
  const created = createAuthorizationSnapshotV1(
    {
      snapshotId: row.id,
      deviceId: row.deviceId,
      userId: row.userId,
      tenantScope: domainScope(row),
      authorizationEpoch: row.authorizationEpoch,
      revision: row.snapshotRevision,
      permissions: row.permissions,
      dataMode: row.dataMode,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    },
    { sign: () => row.signature, verify: () => true },
  );
  if (!created.accepted || created.value.payload !== row.payload)
    throw new Error('DSO_PERSISTED_SNAPSHOT_INVALID');
  return created.value;
}

function grantFromRow(row: DeviceGrantDatabaseRowV1): OpaqueDeviceGrantV1 {
  const created = createOpaqueDeviceGrantV1({
    grantId: row.id,
    deviceId: row.deviceId,
    tenantScope: domainScope(row),
    bindingId: row.bindingId,
    capabilityDigest: row.capabilityDigest,
    authorizationEpoch: row.authorizationEpoch,
    effects: row.effects,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  });
  if (!created.accepted) throw new Error('DSO_PERSISTED_GRANT_INVALID');
  if (!['ACTIVE', 'REVOKED', 'EXPIRED'].includes(row.status))
    throw new Error('DSO_PERSISTED_GRANT_INVALID');
  if (!Number.isSafeInteger(row.revision) || row.revision < 1)
    throw new Error('DSO_PERSISTED_REVISION_INVALID');
  return Object.freeze({ ...created.value, status: row.status, revision: row.revision });
}

function snapshotCreateData(
  snapshot: AuthorizationSnapshotV1,
): DeviceAuthorizationSnapshotDatabaseCreateDataV1 {
  return {
    ...databaseScope(snapshot.tenantScope),
    id: snapshot.snapshotId,
    deviceId: snapshot.deviceId,
    userId: snapshot.userId,
    authorizationEpoch: snapshot.authorizationEpoch,
    snapshotRevision: snapshot.revision,
    permissions: snapshot.permissions,
    dataMode: snapshot.dataMode,
    payload: snapshot.payload,
    signature: snapshot.signature,
    issuedAt: new Date(snapshot.issuedAt),
    expiresAt: new Date(snapshot.expiresAt),
  };
}

function grantCreateData(grant: OpaqueDeviceGrantV1): DeviceGrantDatabaseCreateDataV1 {
  return {
    ...databaseScope(grant.tenantScope),
    id: grant.grantId,
    deviceId: grant.deviceId,
    bindingId: grant.bindingId,
    capabilityDigest: grant.capabilityDigest,
    authorizationEpoch: grant.authorizationEpoch,
    effects: grant.effects,
    issuedAt: new Date(grant.issuedAt),
    expiresAt: new Date(grant.expiresAt),
    status: grant.status,
    revision: grant.revision,
  };
}

class PrismaDeviceAuthorizationTransactionAdapter implements DeviceAuthorizationTransactionPortV1 {
  public constructor(private readonly client: DeviceAuthorizationDatabaseClientV1) {}

  public async saveSnapshot(
    context: IamTenantContextV1,
    snapshot: AuthorizationSnapshotV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, snapshot.tenantScope))
      throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.authorizationSnapshot.findUnique({
      where: { id: snapshot.snapshotId },
    });
    if (existing !== null) {
      if (JSON.stringify(snapshotFromRow(existing)) !== JSON.stringify(snapshot))
        throw new Error('DSO_IMMUTABLE_SNAPSHOT');
      return;
    }
    await this.client.authorizationSnapshot.create({ data: snapshotCreateData(snapshot) });
  }

  public async findSnapshot(
    context: IamTenantContextV1,
    deviceId: AuthorizationSnapshotV1['deviceId'],
  ): Promise<AuthorizationSnapshotV1 | undefined> {
    const rows = await this.client.authorizationSnapshot.findMany({
      where: { organizationId: context.tenantScope.organizationId, deviceId },
      orderBy: { snapshotRevision: 'desc' },
    });
    return rows
      .map(snapshotFromRow)
      .find((snapshot) => visible(context.tenantScope, snapshot.tenantScope));
  }

  public async saveGrant(
    context: IamTenantContextV1,
    grant: OpaqueDeviceGrantV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, grant.tenantScope))
      throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.deviceGrantRecord.findUnique({
      where: { id: grant.grantId },
    });
    if (existing !== null) {
      if (JSON.stringify(grantFromRow(existing)) !== JSON.stringify(grant))
        throw new Error('DSO_IMMUTABLE_GRANT');
      return;
    }
    await this.client.deviceGrantRecord.create({ data: grantCreateData(grant) });
  }

  public async findGrant(
    context: IamTenantContextV1,
    grantId: OpaqueDeviceGrantV1['grantId'],
  ): Promise<OpaqueDeviceGrantV1 | undefined> {
    const row = await this.client.deviceGrantRecord.findUnique({ where: { id: grantId } });
    if (row === null) return undefined;
    const grant = grantFromRow(row);
    return visible(context.tenantScope, grant.tenantScope) ? grant : undefined;
  }

  public async revokeGrant(
    context: IamTenantContextV1,
    grantId: OpaqueDeviceGrantV1['grantId'],
    expectedRevision: number,
  ): Promise<OpaqueDeviceGrantV1 | undefined> {
    const current = await this.findGrant(context, grantId);
    if (!current) return undefined;
    if (!tenantScopeContainsV1(context.tenantScope, current.tenantScope))
      throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    if (current.revision !== expectedRevision) throw new Error('DSO_REVISION_CONFLICT');
    if (!this.client.deviceGrantRecord.update) throw new Error('DSO_UPDATE_UNAVAILABLE');
    const next = Object.freeze({
      ...current,
      status: current.status === 'ACTIVE' ? ('REVOKED' as const) : current.status,
      revision: current.status === 'ACTIVE' ? current.revision + 1 : current.revision,
    });
    await this.client.deviceGrantRecord.update({
      where: { id: grantId },
      data: { status: next.status, revision: next.revision },
    });
    return next;
  }
}

export class PrismaDeviceAuthorizationRepositoryAdapter
  implements DeviceAuthorizationRepositoryPortV1
{
  public constructor(private readonly client: DeviceAuthorizationDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DeviceAuthorizationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaDeviceAuthorizationTransactionAdapter(transaction)),
    );
  }

  public saveSnapshot(context: IamTenantContextV1, snapshot: AuthorizationSnapshotV1): Promise<void> {
    return new PrismaDeviceAuthorizationTransactionAdapter(this.client).saveSnapshot(context, snapshot);
  }

  public findSnapshot(
    context: IamTenantContextV1,
    deviceId: AuthorizationSnapshotV1['deviceId'],
  ): Promise<AuthorizationSnapshotV1 | undefined> {
    return new PrismaDeviceAuthorizationTransactionAdapter(this.client).findSnapshot(context, deviceId);
  }

  public saveGrant(context: IamTenantContextV1, grant: OpaqueDeviceGrantV1): Promise<void> {
    return new PrismaDeviceAuthorizationTransactionAdapter(this.client).saveGrant(context, grant);
  }

  public findGrant(
    context: IamTenantContextV1,
    grantId: OpaqueDeviceGrantV1['grantId'],
  ): Promise<OpaqueDeviceGrantV1 | undefined> {
    return new PrismaDeviceAuthorizationTransactionAdapter(this.client).findGrant(context, grantId);
  }

  public revokeGrant(
    context: IamTenantContextV1,
    grantId: OpaqueDeviceGrantV1['grantId'],
    expectedRevision: number,
  ): Promise<OpaqueDeviceGrantV1 | undefined> {
    return new PrismaDeviceAuthorizationTransactionAdapter(this.client).revokeGrant(
      context,
      grantId,
      expectedRevision,
    );
  }
}

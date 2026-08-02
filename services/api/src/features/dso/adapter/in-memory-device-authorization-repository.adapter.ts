import {
  tenantScopeContainsV1,
  type AuthorizationSnapshotV1,
  type OpaqueDeviceGrantV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';

import type {
  DeviceAuthorizationRepositoryPortV1,
  DeviceAuthorizationTransactionPortV1,
} from '../application/device-authorization-repository.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function cloneSnapshot(snapshot: AuthorizationSnapshotV1): AuthorizationSnapshotV1 {
  return Object.freeze({
    ...snapshot,
    tenantScope: Object.freeze({ ...snapshot.tenantScope }),
    permissions: Object.freeze([...snapshot.permissions]),
  });
}

function cloneGrant(grant: OpaqueDeviceGrantV1): OpaqueDeviceGrantV1 {
  return Object.freeze({
    ...grant,
    tenantScope: Object.freeze({ ...grant.tenantScope }),
    effects: Object.freeze([...grant.effects]),
  });
}

/** In-memory DSO adapter with scope, revision, immutability, and revocation checks. */
export class InMemoryDeviceAuthorizationRepositoryAdapter
  implements DeviceAuthorizationRepositoryPortV1
{
  private snapshots = new Map<string, AuthorizationSnapshotV1>();
  private grants = new Map<string, OpaqueDeviceGrantV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async saveSnapshot(
    context: IamTenantContextV1,
    snapshot: AuthorizationSnapshotV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, snapshot.tenantScope))
      throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = this.snapshots.get(snapshot.snapshotId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(snapshot))
      throw new Error('DSO_IMMUTABLE_SNAPSHOT');
    this.snapshots.set(snapshot.snapshotId, cloneSnapshot(snapshot));
  }

  public async findSnapshot(
    context: IamTenantContextV1,
    deviceId: AuthorizationSnapshotV1['deviceId'],
  ): Promise<AuthorizationSnapshotV1 | undefined> {
    await Promise.resolve();
    const latest = [...this.snapshots.values()]
      .filter(
        (snapshot) =>
          snapshot.deviceId === deviceId && visible(context.tenantScope, snapshot.tenantScope),
      )
      .sort((left, right) => right.revision - left.revision)[0];
    return latest ? cloneSnapshot(latest) : undefined;
  }

  public async saveGrant(context: IamTenantContextV1, grant: OpaqueDeviceGrantV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, grant.tenantScope))
      throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = this.grants.get(grant.grantId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(grant))
      throw new Error('DSO_IMMUTABLE_GRANT');
    this.grants.set(grant.grantId, cloneGrant(grant));
  }

  public async findGrant(
    context: IamTenantContextV1,
    grantId: OpaqueDeviceGrantV1['grantId'],
  ): Promise<OpaqueDeviceGrantV1 | undefined> {
    await Promise.resolve();
    const grant = this.grants.get(grantId);
    return grant && visible(context.tenantScope, grant.tenantScope) ? cloneGrant(grant) : undefined;
  }

  public async revokeGrant(
    context: IamTenantContextV1,
    grantId: OpaqueDeviceGrantV1['grantId'],
    expectedRevision: number,
  ): Promise<OpaqueDeviceGrantV1 | undefined> {
    await Promise.resolve();
    const grant = this.grants.get(grantId);
    if (!grant || !visible(context.tenantScope, grant.tenantScope)) return undefined;
    if (!tenantScopeContainsV1(context.tenantScope, grant.tenantScope))
      throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    if (grant.revision !== expectedRevision) throw new Error('DSO_REVISION_CONFLICT');
    if (grant.status !== 'ACTIVE') return cloneGrant(grant);
    const revoked = Object.freeze({
      ...grant,
      status: 'REVOKED' as const,
      revision: grant.revision + 1,
    });
    this.grants.set(grantId, revoked);
    return cloneGrant(revoked);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DeviceAuthorizationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const beforeSnapshots = new Map(this.snapshots);
    const beforeGrants = new Map(this.grants);
    try {
      return await work({
        saveSnapshot: this.saveSnapshot.bind(this),
        findSnapshot: this.findSnapshot.bind(this),
        saveGrant: this.saveGrant.bind(this),
        findGrant: this.findGrant.bind(this),
        revokeGrant: this.revokeGrant.bind(this),
      });
    } catch (error) {
      this.snapshots = beforeSnapshots;
      this.grants = beforeGrants;
      throw error;
    } finally {
      release();
    }
  }
}

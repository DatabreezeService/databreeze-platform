import type { EntitlementLeaseV1 } from '@databreeze/domain/entitlements/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  tenantScopeKeyV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { EntitlementDatabaseClientV1 } from './prisma-entitlement-repository.adapter.js';
import type {
  EntitlementLeaseRepositoryPortV1,
  EntitlementLeaseTransactionPortV1,
} from '../application/entitlement-lease-repository.port.js';
import { sameEntitlementLeaseV1 } from '../application/entitlement-equality.js';

export interface EntitlementLeaseDatabaseRowV1 {
  readonly id: string;
  readonly schemaVersion: number;
  readonly scopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly snapshotRevision: number;
  readonly securityEpoch: number;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly payload: string;
  readonly signature: string;
  readonly createdAt: Date;
}

export interface EntitlementLeaseDatabaseCreateDataV1
  extends Omit<EntitlementLeaseDatabaseRowV1, 'createdAt'> {
  readonly createdAt: Date;
}

interface EntitlementLeaseDelegateV1 {
  create(input: {
    readonly data: EntitlementLeaseDatabaseCreateDataV1;
  }): Promise<EntitlementLeaseDatabaseRowV1>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<EntitlementLeaseDatabaseRowV1 | null>;
}

export interface EntitlementLeaseDatabaseClientV1 extends EntitlementDatabaseClientV1 {
  readonly entitlementLeaseRecord: EntitlementLeaseDelegateV1;
}

function leaseScope(lease: EntitlementLeaseV1): TenantScopeV1 {
  return lease.tenantScope;
}

function scopeWhere(context: IamTenantContextV1): Readonly<Record<string, unknown>> {
  const organizationId = context.tenantScope.organizationId;
  if (context.tenantScope.scopeType === 'organization') return { organizationId };
  return {
    organizationId,
    OR: [{ workspaceId: null }, { workspaceId: context.tenantScope.workspaceId }],
  };
}

function persistedScope(row: EntitlementLeaseDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
  });
  if (!parsed.accepted || parsed.value.scopeType === 'project')
    throw new Error('BUA_PERSISTED_LEASE_INVALID');
  return parsed.value;
}

function persistedLease(row: EntitlementLeaseDatabaseRowV1): EntitlementLeaseV1 {
  const id = parseStableIdentifierV1(row.id);
  const scope = persistedScope(row);
  const issuedAt = parseStrictUtcTimestampV1(row.issuedAt.toISOString());
  const expiresAt = parseStrictUtcTimestampV1(row.expiresAt.toISOString());
  if (
    !id.accepted ||
    !issuedAt.accepted ||
    !expiresAt.accepted ||
    row.schemaVersion !== 1 ||
    !Number.isSafeInteger(row.snapshotRevision) ||
    row.snapshotRevision < 1 ||
    !Number.isSafeInteger(row.securityEpoch) ||
    row.securityEpoch < 1 ||
    typeof row.payload !== 'string' ||
    row.payload.length === 0 ||
    row.payload.length > 10000 ||
    typeof row.signature !== 'string' ||
    row.signature.length === 0 ||
    row.signature.length > 2048
  )
    throw new Error('BUA_PERSISTED_LEASE_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    leaseId: id.value,
    tenantScope: scope,
    snapshotRevision: row.snapshotRevision,
    securityEpoch: row.securityEpoch,
    issuedAt: issuedAt.value,
    expiresAt: expiresAt.value,
    payload: row.payload,
    signature: row.signature,
  });
}

function leaseData(lease: EntitlementLeaseV1): EntitlementLeaseDatabaseCreateDataV1 {
  return {
    id: lease.leaseId,
    schemaVersion: lease.schemaVersion,
    scopeKey: tenantScopeKeyV1(lease.tenantScope),
    scopeType: lease.tenantScope.scopeType,
    organizationId: lease.tenantScope.organizationId,
    workspaceId:
      lease.tenantScope.scopeType === 'organization' ? null : lease.tenantScope.workspaceId,
    snapshotRevision: lease.snapshotRevision,
    securityEpoch: lease.securityEpoch,
    issuedAt: new Date(lease.issuedAt),
    expiresAt: new Date(lease.expiresAt),
    payload: lease.payload,
    signature: lease.signature,
    createdAt: new Date(lease.issuedAt),
  };
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

class PrismaEntitlementLeaseTransactionAdapter implements EntitlementLeaseTransactionPortV1 {
  public constructor(private readonly client: EntitlementLeaseDatabaseClientV1) {}

  public async saveLease(context: IamTenantContextV1, lease: EntitlementLeaseV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, leaseScope(lease)))
      throw new Error('BUA_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.entitlementLeaseRecord.findFirst({
      where: { id: lease.leaseId },
    });
    if (existing) {
      if (!sameEntitlementLeaseV1(persistedLease(existing), lease))
        throw new Error('BUA_IMMUTABLE_LEASE');
      return;
    }
    try {
      await this.client.entitlementLeaseRecord.create({ data: leaseData(lease) });
    } catch (error) {
      if (isUniqueConflict(error)) throw new Error('BUA_LEASE_CONFLICT');
      throw error;
    }
  }

  public async findLease(
    context: IamTenantContextV1,
    leaseId: StableIdentifierV1,
  ): Promise<EntitlementLeaseV1 | undefined> {
    const row = await this.client.entitlementLeaseRecord.findFirst({
      where: { id: leaseId, ...scopeWhere(context) },
    });
    return row ? persistedLease(row) : undefined;
  }
}

export class PrismaEntitlementLeaseRepositoryAdapter implements EntitlementLeaseRepositoryPortV1 {
  public constructor(private readonly client: EntitlementLeaseDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: EntitlementLeaseTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(
        new PrismaEntitlementLeaseTransactionAdapter(
          transaction as EntitlementLeaseDatabaseClientV1,
        ),
      ),
    );
  }

  public saveLease(context: IamTenantContextV1, lease: EntitlementLeaseV1): Promise<void> {
    return new PrismaEntitlementLeaseTransactionAdapter(this.client).saveLease(context, lease);
  }

  public findLease(context: IamTenantContextV1, leaseId: StableIdentifierV1) {
    return new PrismaEntitlementLeaseTransactionAdapter(this.client).findLease(context, leaseId);
  }
}

import {
  createServiceAccountV1,
  type ServiceAccountV1,
} from '@databreeze/domain/service-account/v1';
import {
  parseStrictUtcTimestampV1,
  tenantScopeContainsV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../application/tenant-context.js';
import type {
  ServiceAccountRepositoryPortV1,
  ServiceAccountTransactionPortV1,
} from '../application/service-account-repository.port.js';

export interface ServiceAccountDatabaseRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly name: string;
  readonly permissions: unknown;
  readonly status: string;
  readonly secretDigest: string;
  readonly secretVersion: number;
  readonly secretIssuedAt: Date;
  readonly secretExpiresAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
  readonly revision: number;
}

interface ServiceAccountDelegateV1 {
  create(input: {
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<ServiceAccountDatabaseRowV1>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<ServiceAccountDatabaseRowV1 | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<readonly ServiceAccountDatabaseRowV1[]>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
}

export interface ServiceAccountDatabaseClientV1 {
  readonly serviceAccount: ServiceAccountDelegateV1;
  $transaction<TValue>(
    work: (transaction: ServiceAccountDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function accountScope(account: ServiceAccountV1): TenantScopeV1 {
  return account.workspaceId === undefined
    ? { scopeType: 'organization', organizationId: account.organizationId }
    : {
        scopeType: 'workspace',
        organizationId: account.organizationId,
        workspaceId: account.workspaceId,
      };
}

function writableInScope(context: IamTenantContextV1, account: ServiceAccountV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, accountScope(account));
}

function timestamp(value: Date | null | undefined): StrictUtcTimestampV1 | undefined {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return undefined;
  const parsed = parseStrictUtcTimestampV1(value.toISOString());
  return parsed.accepted ? parsed.value : undefined;
}

function accountFromRow(row: ServiceAccountDatabaseRowV1): ServiceAccountV1 {
  const created = createServiceAccountV1({
    id: row.id,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    name: row.name,
    permissions: row.permissions,
    secretDigest: row.secretDigest,
    secretIssuedAt: timestamp(row.secretIssuedAt),
    ...(row.secretExpiresAt === null ? {} : { secretExpiresAt: timestamp(row.secretExpiresAt) }),
    createdAt: timestamp(row.createdAt),
  });
  if (!created.accepted) throw new Error('IAM_PERSISTED_SERVICE_ACCOUNT_INVALID');
  if (
    (row.status !== 'ACTIVE' && row.status !== 'REVOKED') ||
    !Number.isSafeInteger(row.secretVersion) ||
    row.secretVersion < 1 ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  )
    throw new Error('IAM_PERSISTED_SERVICE_ACCOUNT_INVALID');
  const secretExpiresAt = timestamp(row.secretExpiresAt);
  const lastUsedAt = timestamp(row.lastUsedAt);
  const revokedAt = timestamp(row.revokedAt);
  if (
    (row.secretExpiresAt !== null && !secretExpiresAt) ||
    (row.lastUsedAt !== null && !lastUsedAt) ||
    (row.revokedAt !== null && !revokedAt) ||
    (row.status === 'ACTIVE' && revokedAt !== undefined) ||
    (row.status === 'REVOKED' && revokedAt === undefined)
  )
    throw new Error('IAM_PERSISTED_SERVICE_ACCOUNT_INVALID');
  if (lastUsedAt && Date.parse(lastUsedAt) < Date.parse(created.value.secretIssuedAt))
    throw new Error('IAM_PERSISTED_SERVICE_ACCOUNT_INVALID');
  return Object.freeze({
    ...created.value,
    status: row.status,
    secretVersion: row.secretVersion,
    revision: row.revision,
    ...(secretExpiresAt ? { secretExpiresAt } : {}),
    ...(lastUsedAt ? { lastUsedAt } : {}),
    ...(revokedAt ? { revokedAt } : {}),
  });
}

function accountData(account: ServiceAccountV1): Readonly<Record<string, unknown>> {
  return {
    id: account.id,
    organizationId: account.organizationId,
    workspaceId: account.workspaceId ?? null,
    name: account.name,
    permissions: account.permissions,
    status: account.status,
    secretDigest: account.secretDigest,
    secretVersion: account.secretVersion,
    secretIssuedAt: new Date(account.secretIssuedAt),
    secretExpiresAt: account.secretExpiresAt ? new Date(account.secretExpiresAt) : null,
    lastUsedAt: account.lastUsedAt ? new Date(account.lastUsedAt) : null,
    createdAt: new Date(account.createdAt),
    revokedAt: account.revokedAt ? new Date(account.revokedAt) : null,
    revision: account.revision,
  };
}

function scopeWhere(context: IamTenantContextV1): Readonly<Record<string, unknown>> {
  const organizationId = context.tenantScope.organizationId;
  if (context.tenantScope.scopeType === 'organization') return { organizationId };
  return {
    organizationId,
    OR: [{ workspaceId: null }, { workspaceId: context.tenantScope.workspaceId }],
  };
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

class PrismaServiceAccountTransactionAdapter implements ServiceAccountTransactionPortV1 {
  public constructor(private readonly client: ServiceAccountDatabaseClientV1) {}

  public async findServiceAccount(
    context: IamTenantContextV1,
    serviceAccountId: StableIdentifierV1,
  ): Promise<ServiceAccountV1 | undefined> {
    const row = await this.client.serviceAccount.findFirst({
      where: { id: serviceAccountId, ...scopeWhere(context) },
    });
    return row ? accountFromRow(row) : undefined;
  }

  public async findServiceAccountByDigest(
    context: IamTenantContextV1,
    secretDigest: string,
  ): Promise<ServiceAccountV1 | undefined> {
    const row = await this.client.serviceAccount.findFirst({
      where: { secretDigest, ...scopeWhere(context) },
    });
    return row ? accountFromRow(row) : undefined;
  }

  public async listServiceAccounts(
    context: IamTenantContextV1,
  ): Promise<readonly ServiceAccountV1[]> {
    const rows = await this.client.serviceAccount.findMany({
      where: scopeWhere(context),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(accountFromRow);
  }

  public async saveServiceAccount(
    context: IamTenantContextV1,
    account: ServiceAccountV1,
  ): Promise<void> {
    if (!writableInScope(context, account)) throw new Error('SCOPE_DENIED');
    const existing = await this.client.serviceAccount.findFirst({
      where: { id: account.id, organizationId: account.organizationId },
    });
    if (existing) {
      if (JSON.stringify(accountFromRow(existing)) !== JSON.stringify(account))
        throw new Error('IMMUTABLE_SERVICE_ACCOUNT');
      return;
    }
    try {
      await this.client.serviceAccount.create({ data: accountData(account) });
    } catch (error) {
      if (isUniqueConflict(error)) throw new Error('SERVICE_ACCOUNT_CONFLICT');
      throw error;
    }
  }

  public async replaceServiceAccount(
    context: IamTenantContextV1,
    account: ServiceAccountV1,
    expectedRevision: number,
  ): Promise<void> {
    if (!writableInScope(context, account)) throw new Error('SCOPE_DENIED');
    const current = await this.findServiceAccount(context, account.id);
    if (!current) throw new Error('SERVICE_ACCOUNT_NOT_FOUND');
    if (current.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
    if (account.revision !== expectedRevision + 1) throw new Error('INVALID_REVISION');
    try {
      const updated = await this.client.serviceAccount.updateMany({
        where: {
          id: account.id,
          organizationId: account.organizationId,
          workspaceId: account.workspaceId ?? null,
          revision: expectedRevision,
        },
        data: accountData(account),
      });
      if (updated.count !== 1) throw new Error('REVISION_CONFLICT');
    } catch (error) {
      if (isUniqueConflict(error)) throw new Error('SERVICE_ACCOUNT_CONFLICT');
      throw error;
    }
  }
}

/** PostgreSQL adapter for scoped service-account metadata and optimistic lifecycle writes. */
export class PrismaServiceAccountRepositoryAdapter implements ServiceAccountRepositoryPortV1 {
  public constructor(private readonly client: ServiceAccountDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ServiceAccountTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaServiceAccountTransactionAdapter(transaction)),
    );
  }

  public saveServiceAccount(context: IamTenantContextV1, account: ServiceAccountV1) {
    return new PrismaServiceAccountTransactionAdapter(this.client).saveServiceAccount(
      context,
      account,
    );
  }

  public findServiceAccount(context: IamTenantContextV1, serviceAccountId: StableIdentifierV1) {
    return new PrismaServiceAccountTransactionAdapter(this.client).findServiceAccount(
      context,
      serviceAccountId,
    );
  }

  public findServiceAccountByDigest(context: IamTenantContextV1, secretDigest: string) {
    return new PrismaServiceAccountTransactionAdapter(this.client).findServiceAccountByDigest(
      context,
      secretDigest,
    );
  }

  public listServiceAccounts(context: IamTenantContextV1) {
    return new PrismaServiceAccountTransactionAdapter(this.client).listServiceAccounts(context);
  }

  public replaceServiceAccount(
    context: IamTenantContextV1,
    account: ServiceAccountV1,
    expectedRevision: number,
  ) {
    return new PrismaServiceAccountTransactionAdapter(this.client).replaceServiceAccount(
      context,
      account,
      expectedRevision,
    );
  }
}

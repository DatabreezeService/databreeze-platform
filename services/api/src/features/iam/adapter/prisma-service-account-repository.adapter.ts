import {
  createServiceAccountV1,
  type ServiceAccountV1,
} from '@databreeze/domain/service-account/v1';
import {
  parseStrictUtcTimestampV1,
  parseStableIdentifierV1,
  tenantScopeContainsV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../application/tenant-context.js';
import type {
  ServiceAccountCreateIdempotencyV1,
  ServiceAccountCreateReplayV1,
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
  readonly createdByActorId?: string | null;
  readonly createIdempotencyKey?: string | null;
  readonly createRequestHash?: string | null;
  readonly createSecretEnvelope?: string | null;
  readonly createIdempotencyExpiresAt?: Date | null;
  readonly createAccountSnapshot?: string | null;
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

function accountData(
  account: ServiceAccountV1,
  createIdempotency?: ServiceAccountCreateIdempotencyV1,
  clearCreateReplay = false,
): Readonly<Record<string, unknown>> {
  const data: Record<string, unknown> = {
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
  if (createIdempotency) {
    data['createdByActorId'] = createIdempotency.actorId;
    data['createIdempotencyKey'] = createIdempotency.idempotencyKey;
    data['createRequestHash'] = createIdempotency.requestHash;
    data['createSecretEnvelope'] = createIdempotency.secretEnvelope;
    data['createIdempotencyExpiresAt'] = new Date(createIdempotency.expiresAt);
    data['createAccountSnapshot'] = JSON.stringify(createIdempotency.accountSnapshot);
  } else if (clearCreateReplay) {
    data['createSecretEnvelope'] = null;
    data['createIdempotencyExpiresAt'] = new Date(0);
  }
  return data;
}

function accountFromSnapshot(
  snapshot: unknown,
  row: ServiceAccountDatabaseRowV1,
): ServiceAccountV1 {
  if (typeof snapshot !== 'string' || snapshot.length === 0 || snapshot.length > 16_384)
    throw new Error('IAM_PERSISTED_SERVICE_ACCOUNT_IDEMPOTENCY_INVALID');
  let value: unknown;
  try {
    value = JSON.parse(snapshot);
  } catch {
    throw new Error('IAM_PERSISTED_SERVICE_ACCOUNT_IDEMPOTENCY_INVALID');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('IAM_PERSISTED_SERVICE_ACCOUNT_IDEMPOTENCY_INVALID');
  const candidate = value as Record<string, unknown>;
  const account = createServiceAccountV1({
    id: candidate['id'],
    organizationId: candidate['organizationId'],
    ...(candidate['workspaceId'] === undefined ? {} : { workspaceId: candidate['workspaceId'] }),
    name: candidate['name'],
    permissions: candidate['permissions'],
    secretDigest: candidate['secretDigest'],
    secretIssuedAt: candidate['secretIssuedAt'],
    ...(candidate['secretExpiresAt'] === undefined
      ? {}
      : { secretExpiresAt: candidate['secretExpiresAt'] }),
    createdAt: candidate['createdAt'],
  });
  if (
    !account.accepted ||
    account.value.id !== row.id ||
    account.value.organizationId !== row.organizationId
  )
    throw new Error('IAM_PERSISTED_SERVICE_ACCOUNT_IDEMPOTENCY_INVALID');
  if (
    (candidate['status'] !== 'ACTIVE' && candidate['status'] !== 'REVOKED') ||
    !Number.isSafeInteger(candidate['secretVersion']) ||
    (candidate['secretVersion'] as number) < 1 ||
    !Number.isSafeInteger(candidate['revision']) ||
    (candidate['revision'] as number) < 1
  )
    throw new Error('IAM_PERSISTED_SERVICE_ACCOUNT_IDEMPOTENCY_INVALID');
  const secretExpiresAt = candidate['secretExpiresAt']
    ? parseStrictUtcTimestampV1(candidate['secretExpiresAt'])
    : undefined;
  const lastUsedAt = candidate['lastUsedAt']
    ? parseStrictUtcTimestampV1(candidate['lastUsedAt'])
    : undefined;
  const revokedAt = candidate['revokedAt']
    ? parseStrictUtcTimestampV1(candidate['revokedAt'])
    : undefined;
  if (
    (candidate['secretExpiresAt'] !== undefined && !secretExpiresAt?.accepted) ||
    (candidate['lastUsedAt'] !== undefined && !lastUsedAt?.accepted) ||
    (candidate['revokedAt'] !== undefined && !revokedAt?.accepted) ||
    (candidate['status'] === 'ACTIVE' && candidate['revokedAt'] !== undefined) ||
    (candidate['status'] === 'REVOKED' && !revokedAt?.accepted)
  )
    throw new Error('IAM_PERSISTED_SERVICE_ACCOUNT_IDEMPOTENCY_INVALID');
  const status = candidate['status'];
  const secretVersion = candidate['secretVersion'] as number;
  const revision = candidate['revision'] as number;
  return Object.freeze({
    ...account.value,
    status,
    secretVersion,
    revision,
    ...(secretExpiresAt?.accepted ? { secretExpiresAt: secretExpiresAt.value } : {}),
    ...(lastUsedAt?.accepted ? { lastUsedAt: lastUsedAt.value } : {}),
    ...(revokedAt?.accepted ? { revokedAt: revokedAt.value } : {}),
  });
}

function persistedReplay(
  row: ServiceAccountDatabaseRowV1,
): ServiceAccountCreateReplayV1 | undefined {
  const hasAny =
    (row.createdByActorId !== undefined && row.createdByActorId !== null) ||
    (row.createIdempotencyKey !== undefined && row.createIdempotencyKey !== null) ||
    (row.createRequestHash !== undefined && row.createRequestHash !== null) ||
    (row.createSecretEnvelope !== undefined && row.createSecretEnvelope !== null);
  if (!hasAny) return undefined;
  const actor = parseStableIdentifierV1(row.createdByActorId);
  const requestHash = row.createRequestHash;
  const secretEnvelope = row.createSecretEnvelope;
  const expiresAt = timestamp(row.createIdempotencyExpiresAt);
  if (
    !actor.accepted ||
    typeof row.createIdempotencyKey !== 'string' ||
    row.createIdempotencyKey.length === 0 ||
    row.createIdempotencyKey.length > 200 ||
    typeof requestHash !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(requestHash) ||
    (secretEnvelope !== null &&
      secretEnvelope !== undefined &&
      (typeof secretEnvelope !== 'string' ||
        secretEnvelope.length > 16_384 ||
        /\p{Cc}/u.test(secretEnvelope))) ||
    !expiresAt ||
    typeof row.createAccountSnapshot !== 'string'
  )
    throw new Error('IAM_PERSISTED_SERVICE_ACCOUNT_IDEMPOTENCY_INVALID');
  return Object.freeze({
    account: accountFromSnapshot(row.createAccountSnapshot, row),
    actorId: actor.value,
    idempotencyKey: row.createIdempotencyKey,
    requestHash,
    secretEnvelope: secretEnvelope ?? '',
    expiresAt,
  });
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

  public async findServiceAccountByIdempotency(
    context: IamTenantContextV1,
    targetScope: TenantScopeV1,
    idempotencyKey: string,
  ): Promise<ServiceAccountCreateReplayV1 | undefined> {
    if (
      !tenantScopeContainsV1(context.tenantScope, targetScope) ||
      (targetScope.scopeType !== 'organization' && targetScope.scopeType !== 'workspace')
    )
      return undefined;
    const row = await this.client.serviceAccount.findFirst({
      where: {
        organizationId: targetScope.organizationId,
        workspaceId: targetScope.scopeType === 'workspace' ? targetScope.workspaceId : null,
        createdByActorId: context.actorId,
        createIdempotencyKey: idempotencyKey,
      },
    });
    return row ? persistedReplay(row) : undefined;
  }

  public async saveServiceAccount(
    context: IamTenantContextV1,
    account: ServiceAccountV1,
    createIdempotency?: ServiceAccountCreateIdempotencyV1,
  ): Promise<void> {
    if (!writableInScope(context, account)) throw new Error('SCOPE_DENIED');
    if (
      createIdempotency &&
      (createIdempotency.actorId !== context.actorId ||
        createIdempotency.idempotencyKey.length === 0 ||
        createIdempotency.idempotencyKey.length > 200 ||
        !/^[a-f0-9]{64}$/u.test(createIdempotency.requestHash) ||
        createIdempotency.secretEnvelope.length === 0 ||
        createIdempotency.secretEnvelope.length > 16_384 ||
        /\p{Cc}/u.test(createIdempotency.secretEnvelope) ||
        !parseStrictUtcTimestampV1(createIdempotency.expiresAt).accepted ||
        JSON.stringify(createIdempotency.accountSnapshot) !== JSON.stringify(account))
    )
      throw new Error('IAM_SERVICE_ACCOUNT_IDEMPOTENCY_INVALID');
    const existing = await this.client.serviceAccount.findFirst({
      where: { id: account.id, organizationId: account.organizationId },
    });
    if (existing) {
      if (JSON.stringify(accountFromRow(existing)) !== JSON.stringify(account))
        throw new Error('IMMUTABLE_SERVICE_ACCOUNT');
      return;
    }
    try {
      await this.client.serviceAccount.create({ data: accountData(account, createIdempotency) });
    } catch (error) {
      if (isUniqueConflict(error)) throw new Error('SERVICE_ACCOUNT_CONFLICT');
      throw error;
    }
  }

  public async replaceServiceAccount(
    context: IamTenantContextV1,
    account: ServiceAccountV1,
    expectedRevision: number,
    clearCreateReplay = false,
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
        data: accountData(account, undefined, clearCreateReplay),
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

  public saveServiceAccount(
    context: IamTenantContextV1,
    account: ServiceAccountV1,
    createIdempotency?: ServiceAccountCreateIdempotencyV1,
  ) {
    return new PrismaServiceAccountTransactionAdapter(this.client).saveServiceAccount(
      context,
      account,
      createIdempotency,
    );
  }

  public findServiceAccountByIdempotency(
    context: IamTenantContextV1,
    targetScope: TenantScopeV1,
    idempotencyKey: string,
  ) {
    return new PrismaServiceAccountTransactionAdapter(this.client).findServiceAccountByIdempotency(
      context,
      targetScope,
      idempotencyKey,
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
    clearCreateReplay = false,
  ) {
    return new PrismaServiceAccountTransactionAdapter(this.client).replaceServiceAccount(
      context,
      account,
      expectedRevision,
      clearCreateReplay,
    );
  }
}

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import {
  createServiceAccountV1,
  isServiceAccountSecretUsableV1,
  markServiceAccountUsedV1,
  revokeServiceAccountV1,
  rotateServiceAccountSecretV1,
  type ServiceAccountV1,
  type ServiceAccountErrorCodeV1,
} from '@databreeze/domain/service-account/v1';
import {
  roleHasPermissionV1,
  PERMISSIONS_V1,
  type PermissionV1,
} from '@databreeze/domain/permissions/v1';
import {
  parseStableIdentifierV1,
  tenantScopeContainsV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamRepositoryPortV1 } from './iam-repository.port.js';
import type { ServiceAccountRepositoryPortV1 } from './service-account-repository.port.js';
import type { IamTenantContextV1 } from './tenant-context.js';

export const SERVICE_ACCOUNT_SERVICE = Symbol('SERVICE_ACCOUNT_SERVICE');

export interface ServiceAccountSecretIssueV1 {
  readonly secret: string;
  readonly digest: string;
}

export interface ServiceAccountSecretIssuerV1 {
  issue(): ServiceAccountSecretIssueV1;
}

export type ServiceAccountClockV1 = () => Date;
export type ServiceAccountIdGeneratorV1 = () => string;

export type ServiceAccountSafeViewV1 = Omit<ServiceAccountV1, 'secretDigest'>;

export interface IssuedServiceAccountV1 {
  readonly account: ServiceAccountSafeViewV1;
  /** Returned only from create/rotate; never persisted or logged. */
  readonly secret: string;
}

export type ServiceAccountPrincipalV1 = ServiceAccountSafeViewV1;

export type ServiceAccountApplicationCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_INPUT'
  | 'SCOPE_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_CREDENTIALS'
  | 'REVOKED'
  | 'EXPIRED'
  | 'UNAVAILABLE';

export type ServiceAccountApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ServiceAccountApplicationCodeV1 };

export interface CreateServiceAccountInputV1 {
  readonly name: unknown;
  readonly workspaceId?: unknown;
  readonly permissions: unknown;
  readonly secretExpiresAt?: unknown;
}

function accepted<TValue>(value: TValue): ServiceAccountApplicationResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: ServiceAccountApplicationCodeV1): ServiceAccountApplicationResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function unavailable<TValue>(): ServiceAccountApplicationResultV1<TValue> {
  return rejected('UNAVAILABLE');
}

function safeView(account: ServiceAccountV1): ServiceAccountSafeViewV1 {
  const { secretDigest: _secretDigest, ...withoutDigest } = account;
  void _secretDigest;
  return Object.freeze({
    ...withoutDigest,
    permissions: Object.freeze([...withoutDigest.permissions]),
  });
}

function mapDomainCode(code: ServiceAccountErrorCodeV1): ServiceAccountApplicationCodeV1 {
  if (code === 'INVALID_IDENTIFIER') return 'INVALID_IDENTIFIER';
  if (code === 'INVALID_STATE' || code === 'SECRET_REVOKED') return 'REVOKED';
  if (code === 'SECRET_EXPIRED') return 'EXPIRED';
  if (code === 'REVISION_CONFLICT') return 'CONFLICT';
  if (code === 'INVALID_PERMISSION' || code === 'INVALID_TEXT' || code === 'INVALID_LIFETIME')
    return 'INVALID_INPUT';
  return 'INVALID_INPUT';
}

function mapRepositoryError(error: unknown): ServiceAccountApplicationCodeV1 {
  const message = error instanceof Error ? error.message : '';
  if (message === 'SCOPE_DENIED') return 'SCOPE_DENIED';
  if (message === 'SERVICE_ACCOUNT_NOT_FOUND') return 'NOT_FOUND';
  if (
    message === 'REVISION_CONFLICT' ||
    message === 'INVALID_REVISION' ||
    message.endsWith('CONFLICT')
  )
    return 'CONFLICT';
  return 'UNAVAILABLE';
}

function digestSecret(input: unknown): string | undefined {
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > 512 ||
    /\p{Cc}/u.test(input)
  )
    return undefined;
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function safeDigestEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function identifier(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function scopeForAccount(
  context: IamTenantContextV1,
  workspaceId: StableIdentifierV1 | undefined,
): TenantScopeV1 | undefined {
  if (workspaceId === undefined) {
    return context.tenantScope.scopeType === 'organization'
      ? { scopeType: 'organization', organizationId: context.tenantScope.organizationId }
      : undefined;
  }
  const scope: TenantScopeV1 = {
    scopeType: 'workspace',
    organizationId: context.tenantScope.organizationId,
    workspaceId,
  };
  return tenantScopeContainsV1(context.tenantScope, scope) ? scope : undefined;
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

function serviceAccountPermissions(input: unknown): input is readonly PermissionV1[] {
  return (
    Array.isArray(input) &&
    !input.some(
      (permission) =>
        permission === PERMISSIONS_V1.SERVICE_ACCOUNT_READ ||
        permission === PERMISSIONS_V1.SERVICE_ACCOUNT_MANAGE ||
        permission === PERMISSIONS_V1.SERVICE_ACCOUNT_REVOKE,
    )
  );
}

/** IAM-013: action-scoped service identities with one-time credential issuance. */
export class ServiceAccountService {
  public constructor(
    private readonly repository: ServiceAccountRepositoryPortV1,
    private readonly iamRepository: IamRepositoryPortV1,
    private readonly secretIssuer: ServiceAccountSecretIssuerV1,
    private readonly clock: ServiceAccountClockV1 = () => new Date(),
    private readonly idGenerator: ServiceAccountIdGeneratorV1 = () => randomUUID(),
  ) {}

  public async create(
    context: IamTenantContextV1,
    input: CreateServiceAccountInputV1,
  ): Promise<ServiceAccountApplicationResultV1<IssuedServiceAccountV1>> {
    const workspaceId = input.workspaceId === undefined ? undefined : identifier(input.workspaceId);
    if (input.workspaceId !== undefined && workspaceId === undefined)
      return rejected('INVALID_IDENTIFIER');
    const targetScope = scopeForAccount(context, workspaceId);
    if (!targetScope) return rejected('SCOPE_DENIED');
    const authorization = await this.authorize(
      context,
      targetScope,
      PERMISSIONS_V1.SERVICE_ACCOUNT_MANAGE,
    );
    if (authorization !== 'ALLOWED') return rejected(authorization);
    if (!serviceAccountPermissions(input.permissions)) return rejected('INVALID_INPUT');
    let now: string;
    let id: string;
    let secret: ServiceAccountSecretIssueV1;
    try {
      now = this.clock().toISOString();
      id = this.idGenerator();
      secret = this.secretIssuer.issue();
    } catch {
      return rejected('UNAVAILABLE');
    }
    const candidate = createServiceAccountV1({
      id,
      organizationId: context.tenantScope.organizationId,
      ...(workspaceId === undefined ? {} : { workspaceId }),
      name: input.name,
      permissions: input.permissions,
      secretDigest: secret.digest,
      secretIssuedAt: now,
      ...(input.secretExpiresAt === undefined ? {} : { secretExpiresAt: input.secretExpiresAt }),
      createdAt: now,
    });
    if (!candidate.accepted) return rejected(mapDomainCode(candidate.code));
    try {
      await this.repository.saveServiceAccount(context, candidate.value);
      return accepted(Object.freeze({ account: safeView(candidate.value), secret: secret.secret }));
    } catch (error) {
      return rejected(mapRepositoryError(error));
    }
  }

  public async list(
    context: IamTenantContextV1,
  ): Promise<ServiceAccountApplicationResultV1<readonly ServiceAccountSafeViewV1[]>> {
    const authorization = await this.authorize(
      context,
      context.tenantScope,
      PERMISSIONS_V1.SERVICE_ACCOUNT_READ,
    );
    if (authorization !== 'ALLOWED') return rejected(authorization);
    try {
      return accepted((await this.repository.listServiceAccounts(context)).map(safeView));
    } catch (error) {
      return rejected(mapRepositoryError(error));
    }
  }

  /** Authenticate an already-scoped service-account bearer and advance last-use atomically. */
  public async authenticate(
    context: IamTenantContextV1,
    presentedSecret: unknown,
    nowInput: unknown,
  ): Promise<ServiceAccountApplicationResultV1<ServiceAccountPrincipalV1>> {
    const digest = digestSecret(presentedSecret);
    if (!digest) return rejected('INVALID_CREDENTIALS');
    return this.repository
      .withTransaction(context, async (transaction) => {
        const current = await transaction.findServiceAccountByDigest(context, digest);
        if (!current || !safeDigestEqual(current.secretDigest, digest))
          return rejected('INVALID_CREDENTIALS');
        const usable = isServiceAccountSecretUsableV1(current, nowInput);
        if (!usable.accepted) return rejected('INVALID_CREDENTIALS');
        const used = markServiceAccountUsedV1(current, nowInput);
        if (!used.accepted) return rejected('INVALID_CREDENTIALS');
        try {
          await transaction.replaceServiceAccount(context, used.value, current.revision);
          return accepted(safeView(used.value));
        } catch (error) {
          const mapped = mapRepositoryError(error);
          return rejected(mapped === 'CONFLICT' ? 'CONFLICT' : 'UNAVAILABLE');
        }
      })
      .catch((error) => rejected(mapRepositoryError(error)));
  }

  public async rotate(
    context: IamTenantContextV1,
    serviceAccountIdInput: unknown,
    expectedRevisionInput: unknown,
    secretExpiresAt?: unknown,
  ): Promise<ServiceAccountApplicationResultV1<IssuedServiceAccountV1>> {
    const serviceAccountId = identifier(serviceAccountIdInput);
    if (!serviceAccountId) return rejected('INVALID_IDENTIFIER');
    if (
      typeof expectedRevisionInput !== 'number' ||
      !Number.isSafeInteger(expectedRevisionInput) ||
      expectedRevisionInput < 1
    )
      return rejected('CONFLICT');
    return this.repository
      .withTransaction(context, async (transaction) => {
        const current = await transaction.findServiceAccount(context, serviceAccountId);
        if (!current) return rejected('NOT_FOUND');
        const authorization = await this.authorize(
          context,
          accountScope(current),
          PERMISSIONS_V1.SERVICE_ACCOUNT_MANAGE,
        );
        if (authorization !== 'ALLOWED') return rejected(authorization);
        let now: string;
        let secret: ServiceAccountSecretIssueV1;
        try {
          now = this.clock().toISOString();
          secret = this.secretIssuer.issue();
        } catch {
          return rejected('UNAVAILABLE');
        }
        const rotated = rotateServiceAccountSecretV1(current, {
          secretDigest: secret.digest,
          issuedAt: now,
          ...(secretExpiresAt === undefined ? {} : { expiresAt: secretExpiresAt }),
          expectedRevision: expectedRevisionInput,
        });
        if (!rotated.accepted) return rejected(mapDomainCode(rotated.code));
        try {
          await transaction.replaceServiceAccount(context, rotated.value, current.revision);
          return accepted(
            Object.freeze({ account: safeView(rotated.value), secret: secret.secret }),
          );
        } catch (error) {
          return rejected(mapRepositoryError(error));
        }
      })
      .catch((error) => rejected(mapRepositoryError(error)));
  }

  public async revoke(
    context: IamTenantContextV1,
    serviceAccountIdInput: unknown,
    expectedRevisionInput: unknown,
  ): Promise<ServiceAccountApplicationResultV1<ServiceAccountSafeViewV1>> {
    const serviceAccountId = identifier(serviceAccountIdInput);
    if (!serviceAccountId) return rejected('INVALID_IDENTIFIER');
    if (
      typeof expectedRevisionInput !== 'number' ||
      !Number.isSafeInteger(expectedRevisionInput) ||
      expectedRevisionInput < 1
    )
      return rejected('CONFLICT');
    return this.repository
      .withTransaction(context, async (transaction) => {
        const current = await transaction.findServiceAccount(context, serviceAccountId);
        if (!current) return rejected('NOT_FOUND');
        const authorization = await this.authorize(
          context,
          accountScope(current),
          PERMISSIONS_V1.SERVICE_ACCOUNT_REVOKE,
        );
        if (authorization !== 'ALLOWED') return rejected(authorization);
        const now = this.now();
        if (!now) return rejected('UNAVAILABLE');
        const revoked = revokeServiceAccountV1(current, now, expectedRevisionInput);
        if (!revoked.accepted) return rejected(mapDomainCode(revoked.code));
        try {
          await transaction.replaceServiceAccount(context, revoked.value, current.revision);
          return accepted(safeView(revoked.value));
        } catch (error) {
          return rejected(mapRepositoryError(error));
        }
      })
      .catch((error) => rejected(mapRepositoryError(error)));
  }

  public validateSecret(
    account: ServiceAccountV1,
    nowInput: unknown,
  ): ServiceAccountApplicationResultV1<true> {
    const result = isServiceAccountSecretUsableV1(account, nowInput);
    return result.accepted ? result : rejected(mapDomainCode(result.code));
  }

  private now(): string | undefined {
    try {
      const now = this.clock();
      return now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : undefined;
    } catch {
      return undefined;
    }
  }

  private async authorize(
    context: IamTenantContextV1,
    targetScope: TenantScopeV1,
    permission: PermissionV1,
  ): Promise<'ALLOWED' | 'SCOPE_DENIED' | 'UNAVAILABLE'> {
    if (!tenantScopeContainsV1(context.tenantScope, targetScope)) return 'SCOPE_DENIED';
    try {
      const membership = await this.iamRepository.findMembership(context, context.actorId);
      if (
        !membership ||
        !tenantScopeContainsV1(membership.scope, targetScope) ||
        !roleHasPermissionV1(membership.roleId, permission)
      )
        return 'SCOPE_DENIED';
      return 'ALLOWED';
    } catch {
      return 'UNAVAILABLE';
    }
  }
}

/** Safe default for hosts that have not composed an IAM membership repository yet. */
export class UnavailableServiceAccountService {
  public create(
    _context: IamTenantContextV1,
    _input: CreateServiceAccountInputV1,
  ): Promise<ServiceAccountApplicationResultV1<IssuedServiceAccountV1>> {
    void _context;
    void _input;
    return Promise.resolve(unavailable());
  }

  public list(
    _context: IamTenantContextV1,
  ): Promise<ServiceAccountApplicationResultV1<readonly ServiceAccountSafeViewV1[]>> {
    void _context;
    return Promise.resolve(unavailable());
  }

  public rotate(
    _context: IamTenantContextV1,
    _serviceAccountId: unknown,
    _expectedRevision: unknown,
    _secretExpiresAt?: unknown,
  ): Promise<ServiceAccountApplicationResultV1<IssuedServiceAccountV1>> {
    void _context;
    void _serviceAccountId;
    void _expectedRevision;
    void _secretExpiresAt;
    return Promise.resolve(unavailable());
  }

  public revoke(
    _context: IamTenantContextV1,
    _serviceAccountId: unknown,
    _expectedRevision: unknown,
  ): Promise<ServiceAccountApplicationResultV1<ServiceAccountSafeViewV1>> {
    void _context;
    void _serviceAccountId;
    void _expectedRevision;
    return Promise.resolve(unavailable());
  }

  public authenticate(
    _context: IamTenantContextV1,
    _presentedSecret: unknown,
    _now: unknown,
  ): Promise<ServiceAccountApplicationResultV1<ServiceAccountPrincipalV1>> {
    void _context;
    void _presentedSecret;
    void _now;
    return Promise.resolve(unavailable());
  }
}

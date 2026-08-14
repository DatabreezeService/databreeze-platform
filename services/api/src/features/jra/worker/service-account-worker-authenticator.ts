import { createHash } from 'node:crypto';

import {
  isServiceAccountSecretUsableV1,
  type ServiceAccountV1,
} from '@databreeze/domain/service-account/v1';
import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';
import {
  parseStableIdentifierV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { FastifyRequest } from 'fastify';

import { getRequestContext } from '../../../platform/http/request-context.js';
import type { WorkerCredentialLookupPortV1 } from '../../iam/application/worker-credential-lookup.port.js';
import type {
  WorkerAuthenticatorPortV1,
  WorkerIdentityV1,
  WorkerSecurityEpochPortV1,
} from './worker-ports.js';

const MAX_CREDENTIAL_LENGTH = 512;
const ZERO_CORRELATION_ID = '00000000-0000-4000-8000-000000000000';
const BEARER = /^Bearer ([^\s\p{Cc}]{1,512})$/u;

function digestSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function headerValue(request: unknown): string | undefined {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) return undefined;
  const headers = (request as Record<string, unknown>)['headers'];
  if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) return undefined;
  const headerRecord = headers as Record<string, unknown>;
  const entries = Object.entries(headerRecord).filter(
    ([name]) => name.toLowerCase() === 'authorization',
  );
  if (entries.length !== 1) return undefined;
  const value = entries[0]?.[1];
  return typeof value === 'string' ? value : undefined;
}

function bearerSecret(request: unknown): string | undefined {
  const header = headerValue(request);
  if (!header || header.length > MAX_CREDENTIAL_LENGTH) return undefined;
  const matched = BEARER.exec(header);
  return matched?.[1];
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

function identifier(value: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(value);
  return parsed.accepted ? parsed.value : undefined;
}

function correlationId(request: unknown): StableIdentifierV1 {
  try {
    const value = getRequestContext(request as FastifyRequest).correlationId;
    return identifier(value) ?? identifier(ZERO_CORRELATION_ID)!;
  } catch {
    return identifier(ZERO_CORRELATION_ID)!;
  }
}

/** IAM-backed bearer authenticator for cloud workers; raw secrets never leave this class. */
export class ServiceAccountWorkerAuthenticator
  implements WorkerAuthenticatorPortV1, WorkerSecurityEpochPortV1
{
  public constructor(
    private readonly credentials: WorkerCredentialLookupPortV1,
    private readonly digest: (secret: string) => string = digestSecret,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  public async authenticate(request: unknown): Promise<WorkerIdentityV1 | undefined> {
    const secret = bearerSecret(request);
    if (!secret) return undefined;
    const secretDigest = this.digest(secret);
    if (typeof secretDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(secretDigest)) return undefined;
    let account: ServiceAccountV1 | undefined;
    try {
      account = await this.credentials.findCurrentWorkerCredentialByDigest(secretDigest);
    } catch {
      return undefined;
    }
    if (!account || !this.usableWorkerAccount(account)) return undefined;
    const workerId = identifier(account.id);
    const tenantScope = accountScope(account);
    if (!workerId || !Number.isSafeInteger(account.secretVersion) || account.secretVersion < 1)
      return undefined;
    return Object.freeze({
      workerId,
      tenantScope,
      securityEpoch: account.secretVersion,
      correlationId: correlationId(request),
    });
  }

  public async isCurrent(identity: WorkerIdentityV1): Promise<boolean> {
    const workerId = identifier(identity.workerId);
    if (!workerId || !Number.isSafeInteger(identity.securityEpoch) || identity.securityEpoch < 1)
      return false;
    let account: ServiceAccountV1 | undefined;
    try {
      account = await this.credentials.findCurrentWorkerCredentialById(workerId);
    } catch {
      return false;
    }
    return (
      account !== undefined &&
      this.usableWorkerAccount(account) &&
      account.id === workerId &&
      account.secretVersion === identity.securityEpoch &&
      tenantScopesEqualV1(accountScope(account), identity.tenantScope)
    );
  }

  private usableWorkerAccount(account: ServiceAccountV1): boolean {
    return (
      account.permissions.includes(PERMISSIONS_V1.JOB_EXECUTION_RUN) &&
      isServiceAccountSecretUsableV1(account, this.now()).accepted
    );
  }
}

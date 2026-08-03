import { randomUUID } from 'node:crypto';

import { type AuthenticatedPrincipalV1 } from '../../features/iam/application/authentication.port.js';
import { createIamTenantContextV1 } from '../../features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from './request-tenant-context.port.js';
import { getRequestContext } from './request-context.js';

export type RequestTenantContextProblemCodeV1 =
  | 'AUTHENTICATION_FAILED'
  | 'AUTHENTICATION_UNAVAILABLE'
  | 'CONTEXT_INVALID';

export class RequestTenantContextProblemError extends Error {
  constructor(readonly code: RequestTenantContextProblemCodeV1) {
    super(code);
    this.name = 'RequestTenantContextProblemError';
  }
}

type HeaderValueV1 = string | readonly string[] | undefined;
const SAFE_METHODS_V1 = new Set(['GET', 'HEAD', 'OPTIONS']);

interface RequestLikeV1 {
  readonly id?: unknown;
  readonly method?: unknown;
  readonly headers?: Readonly<Record<string, HeaderValueV1>>;
}

export interface SessionPrincipalLookupV1 {
  findPrincipalByAccessToken(accessToken: unknown): Promise<AuthenticatedPrincipalV1 | undefined>;
}

function requestLike(input: unknown): RequestLikeV1 | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const candidate = input as RequestLikeV1;
  return candidate.headers !== undefined && typeof candidate.headers === 'object'
    ? candidate
    : undefined;
}

function oneHeader(request: RequestLikeV1, name: string): string | undefined {
  const headers = request.headers ?? {};
  const values = Object.entries(headers)
    .filter(([key]) => key.toLowerCase() === name)
    .map(([, value]) => value)
    .filter((value): value is string | readonly string[] => value !== undefined);
  if (values.length !== 1 || typeof values[0] !== 'string') return undefined;
  return values[0];
}

function correlationId(request: RequestLikeV1): string {
  try {
    return getRequestContext(request as never).correlationId;
  } catch {
    return oneHeader(request, 'x-correlation-id') ?? randomUUID();
  }
}

function idempotencyKey(request: RequestLikeV1): string {
  const header = oneHeader(request, 'idempotency-key');
  if (header !== undefined) return header;
  if (typeof request.method !== 'string' || !SAFE_METHODS_V1.has(request.method.toUpperCase())) {
    throw new RequestTenantContextProblemError('CONTEXT_INVALID');
  }
  if (typeof request.id === 'string' && request.id.length > 0) return request.id;
  return randomUUID();
}

function bearerToken(request: RequestLikeV1): string | undefined {
  const value = oneHeader(request, 'authorization');
  if (value === undefined) return undefined;
  const match = /^Bearer ([A-Za-z0-9._~-]{20,4096})$/u.exec(value);
  return match?.[1];
}

/** Resolve every protected request from the live IAM session, never from body scope hints. */
export class SessionRequestTenantContextAdapter implements RequestTenantContextPortV1 {
  public constructor(private readonly sessions: SessionPrincipalLookupV1) {}

  public async resolve(request: unknown) {
    const input = requestLike(request);
    const token = input === undefined ? undefined : bearerToken(input);
    if (input === undefined || token === undefined) {
      throw new RequestTenantContextProblemError('AUTHENTICATION_FAILED');
    }
    let principal: AuthenticatedPrincipalV1 | undefined;
    try {
      principal = await this.sessions.findPrincipalByAccessToken(token);
    } catch {
      throw new RequestTenantContextProblemError('AUTHENTICATION_UNAVAILABLE');
    }
    if (principal === undefined)
      throw new RequestTenantContextProblemError('AUTHENTICATION_FAILED');
    const context = createIamTenantContextV1({
      tenantScope: {
        scopeType: 'workspace',
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
      },
      actorId: principal.userId,
      correlationId: correlationId(input),
      idempotencyKey: idempotencyKey(input),
      authorizationEpoch: principal.securityEpoch,
      mfaRequired: principal.mfaRequired,
    });
    if (!context.accepted) throw new RequestTenantContextProblemError('CONTEXT_INVALID');
    return context.value;
  }
}

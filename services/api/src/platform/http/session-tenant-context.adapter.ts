import { randomUUID } from 'node:crypto';

import { type AuthenticatedPrincipalV1 } from '../../features/iam/application/authentication.port.js';
import type { WorkspaceAuthorizationEpochResolverPortV1 } from '../../features/iam/application/agent-grant-repository.port.js';
import { createIamTenantContextV1 } from '../../features/iam/application/tenant-context.js';
import {
  RequestTenantContextProblemError,
  type RequestTenantContextPortV1,
} from './request-tenant-context.port.js';
import { getRequestContext } from './request-context.js';

type HeaderValueV1 = string | readonly string[] | undefined;
const SAFE_METHODS_V1 = new Set(['GET', 'HEAD', 'OPTIONS']);

interface RequestLikeV1 {
  readonly id?: unknown;
  readonly method?: unknown;
  readonly headers?: Readonly<Record<string, HeaderValueV1>>;
}

export interface SessionPrincipalLookupV1 {
  findPrincipalByAccessToken(accessToken: unknown): Promise<AuthenticatedPrincipalV1 | undefined>;
  findSessionByAccessToken?(
    accessToken: unknown,
  ): Promise<
    { readonly sessionId: string; readonly principal: AuthenticatedPrincipalV1 } | undefined
  >;
}

export class UnavailableWorkspaceAuthorizationEpochResolverAdapter
  implements WorkspaceAuthorizationEpochResolverPortV1
{
  public async resolveWorkspaceAuthorizationEpoch(
    context: Parameters<
      WorkspaceAuthorizationEpochResolverPortV1['resolveWorkspaceAuthorizationEpoch']
    >[0],
  ): Promise<number> {
    void context;
    await Promise.resolve();
    throw new Error('IAM_AUTHORIZATION_EPOCH_UNAVAILABLE');
  }
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
  public constructor(
    private readonly sessions: SessionPrincipalLookupV1,
    private readonly workspaceEpoch: WorkspaceAuthorizationEpochResolverPortV1 = new UnavailableWorkspaceAuthorizationEpochResolverAdapter(),
  ) {}

  public async resolve(request: unknown) {
    const input = requestLike(request);
    const token = input === undefined ? undefined : bearerToken(input);
    if (input === undefined || token === undefined) {
      throw new RequestTenantContextProblemError('AUTHENTICATION_FAILED');
    }
    let principal: AuthenticatedPrincipalV1 | undefined;
    let sessionId: string | undefined;
    try {
      if (this.sessions.findSessionByAccessToken !== undefined) {
        const binding = await this.sessions.findSessionByAccessToken(token);
        principal = binding?.principal;
        sessionId = binding?.sessionId;
      } else {
        principal = await this.sessions.findPrincipalByAccessToken(token);
      }
    } catch {
      throw new RequestTenantContextProblemError('AUTHENTICATION_UNAVAILABLE');
    }
    if (principal === undefined)
      throw new RequestTenantContextProblemError('AUTHENTICATION_FAILED');
    if (typeof principal.mfaReenrollmentRequired !== 'boolean')
      throw new RequestTenantContextProblemError('CONTEXT_INVALID');
    const context = createIamTenantContextV1({
      ...(sessionId === undefined ? {} : { sessionId }),
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
      mfaReenrollmentRequired: principal.mfaReenrollmentRequired,
    });
    if (!context.accepted) throw new RequestTenantContextProblemError('CONTEXT_INVALID');
    let workspaceAuthorizationEpoch: number;
    try {
      workspaceAuthorizationEpoch = await this.workspaceEpoch.resolveWorkspaceAuthorizationEpoch(
        context.value,
      );
    } catch {
      throw new RequestTenantContextProblemError('AUTHENTICATION_UNAVAILABLE');
    }
    const resolved = createIamTenantContextV1({
      ...context.value,
      workspaceAuthorizationEpoch,
    });
    if (!resolved.accepted) throw new RequestTenantContextProblemError('CONTEXT_INVALID');
    return resolved.value;
  }
}

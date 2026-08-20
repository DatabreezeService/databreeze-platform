import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  isPlatformPrincipalV1,
  type SessionPrincipalV1,
} from '../../features/iam/application/authentication.port.js';
import { RequestTenantContextProblemError } from './request-tenant-context.port.js';
import type {
  RequestAuthenticatedActorPortV1,
  RequestAuthenticatedActorV1,
} from './request-authenticated-actor.port.js';

type HeaderValueV1 = string | readonly string[] | undefined;

interface RequestLikeV1 {
  readonly headers?: Readonly<Record<string, HeaderValueV1>>;
}

export interface SessionActorLookupV1 {
  findSessionByAccessToken(
    accessToken: unknown,
  ): Promise<{ readonly sessionId: string; readonly principal: SessionPrincipalV1 } | undefined>;
}

function bearerToken(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const headers = (input as RequestLikeV1).headers;
  if (headers === undefined || typeof headers !== 'object') return undefined;
  const values = Object.entries(headers)
    .filter(([name]) => name.toLowerCase() === 'authorization')
    .map(([, value]) => value)
    .filter((value): value is string | readonly string[] => value !== undefined);
  if (values.length !== 1 || typeof values[0] !== 'string') return undefined;
  return /^Bearer ([A-Za-z0-9._~-]{20,4096})$/u.exec(values[0])?.[1];
}

/** IAM-026: resolve identity without manufacturing organization or workspace scope. */
export class SessionRequestActorAdapter implements RequestAuthenticatedActorPortV1 {
  public constructor(private readonly sessions: SessionActorLookupV1) {}

  public async resolve(request: unknown): Promise<RequestAuthenticatedActorV1> {
    const token = bearerToken(request);
    if (token === undefined) throw new RequestTenantContextProblemError('AUTHENTICATION_FAILED');
    let binding: Awaited<ReturnType<SessionActorLookupV1['findSessionByAccessToken']>>;
    try {
      binding = await this.sessions.findSessionByAccessToken(token);
    } catch {
      throw new RequestTenantContextProblemError('AUTHENTICATION_UNAVAILABLE');
    }
    const sessionId = parseStableIdentifierV1(binding?.sessionId);
    const actorId = parseStableIdentifierV1(binding?.principal.userId);
    if (
      binding === undefined ||
      !sessionId.accepted ||
      !actorId.accepted ||
      !Number.isSafeInteger(binding.principal.securityEpoch) ||
      binding.principal.securityEpoch < 1 ||
      typeof binding.principal.mfaRequired !== 'boolean' ||
      typeof binding.principal.mfaReenrollmentRequired !== 'boolean'
    ) {
      throw new RequestTenantContextProblemError('AUTHENTICATION_FAILED');
    }
    return Object.freeze({
      sessionId: sessionId.value,
      actorId: actorId.value,
      scopeType: isPlatformPrincipalV1(binding.principal) ? 'PLATFORM' : 'TENANT',
      securityEpoch: binding.principal.securityEpoch,
      mfaRequired: binding.principal.mfaRequired,
      mfaReenrollmentRequired: binding.principal.mfaReenrollmentRequired,
    });
  }
}

import { RequestTenantContextProblemError } from './request-tenant-context.port.js';

export const REQUEST_AUTHENTICATED_ACTOR = Symbol('REQUEST_AUTHENTICATED_ACTOR');

export interface RequestAuthenticatedActorV1 {
  readonly sessionId: string;
  readonly actorId: string;
  readonly scopeType: 'TENANT' | 'PLATFORM';
  readonly securityEpoch: number;
  readonly mfaRequired: boolean;
  readonly mfaReenrollmentRequired: boolean;
}

export interface RequestAuthenticatedActorPortV1 {
  resolve(request: unknown): Promise<RequestAuthenticatedActorV1>;
}

export class UnavailableRequestAuthenticatedActorAdapter
  implements RequestAuthenticatedActorPortV1
{
  public async resolve(): Promise<never> {
    await Promise.resolve();
    throw new RequestTenantContextProblemError('AUTHENTICATION_UNAVAILABLE');
  }
}

import type { IamTenantContextV1 } from '../../features/iam/application/tenant-context.js';

export const REQUEST_TENANT_CONTEXT = Symbol('REQUEST_TENANT_CONTEXT');

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

/** Resolves an already-authenticated request to a scoped IAM context. */
export interface RequestTenantContextPortV1 {
  resolve(request: unknown): Promise<IamTenantContextV1>;
}

/** Safe default until the IAM bearer/session adapter is configured by the host. */
export class UnavailableRequestTenantContextAdapter implements RequestTenantContextPortV1 {
  public async resolve(request: unknown): Promise<IamTenantContextV1> {
    void request;
    await Promise.resolve();
    throw new RequestTenantContextProblemError('AUTHENTICATION_UNAVAILABLE');
  }
}

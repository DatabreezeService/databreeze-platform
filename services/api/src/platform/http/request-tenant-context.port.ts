import type { IamTenantContextV1 } from '../../features/iam/application/tenant-context.js';

export const REQUEST_TENANT_CONTEXT = Symbol('REQUEST_TENANT_CONTEXT');

/** Resolves an already-authenticated request to a scoped IAM context. */
export interface RequestTenantContextPortV1 {
  resolve(request: unknown): Promise<IamTenantContextV1>;
}

/** Safe default until the IAM bearer/session adapter is configured by the host. */
export class UnavailableRequestTenantContextAdapter implements RequestTenantContextPortV1 {
  public async resolve(_request: unknown): Promise<IamTenantContextV1> {
    await Promise.resolve();
    throw new Error('AUTHENTICATED_CONTEXT_UNAVAILABLE');
  }
}

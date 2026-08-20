import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../features/iam/application/tenant-context.js';

/** Resolve a server-owned dashboard project inside the authenticated tenant scope. */
export interface DashboardProjectResolverPortV1 {
  resolveDashboardProject(context: IamTenantContextV1): Promise<StableIdentifierV1 | undefined>;
}

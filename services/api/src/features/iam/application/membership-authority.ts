import { tenantScopeContainsV1, type StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamMembershipRecordV1 } from './iam-repository.port.js';
import type { IamTenantContextV1 } from './tenant-context.js';

function scopeSpecificity(scope: IamMembershipRecordV1['scope']): number {
  if (scope.scopeType === 'project') return 3;
  if (scope.scopeType === 'workspace') return 2;
  return 1;
}

/** Select the deterministic active authority that contains the requested tenant scope. */
export function selectAuthoritativeMembership(
  memberships: readonly IamMembershipRecordV1[],
  context: IamTenantContextV1,
  principalId: StableIdentifierV1,
): IamMembershipRecordV1 | undefined {
  return memberships
    .filter(
      (membership) =>
        membership.principalId === principalId &&
        membership.status === 'ACTIVE' &&
        tenantScopeContainsV1(membership.scope, context.tenantScope),
    )
    .sort(
      (left, right) =>
        scopeSpecificity(right.scope) - scopeSpecificity(left.scope) ||
        left.id.localeCompare(right.id),
    )[0];
}

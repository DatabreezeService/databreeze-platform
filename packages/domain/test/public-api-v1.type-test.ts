import { createScopedAuthorizationEvaluatorV1 } from '@databreeze/domain/authorization/v1';
import type {
  AuthorizationAuthorityProviderV1,
  AuthorizationRequestV1,
  ScopedResourceLookupQueryV1,
} from '@databreeze/domain/authorization/v1';
import type { StableIdentifierV1, TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

declare const scope: TenantScopeV1;
declare const stableId: StableIdentifierV1;

const provider: AuthorizationAuthorityProviderV1 = {
  resolveAuthenticatedPrincipalV1() {
    return { principalId: stableId };
  },
  lookupResourceV1(query: ScopedResourceLookupQueryV1) {
    return {
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      tenantScope: query.tenantScope,
    };
  },
  resolveMembershipV1() {
    return { roleId: 'viewer', membershipScope: scope, membershipActive: true };
  },
  evaluatePolicyV1() {
    return { satisfied: true };
  },
};

const evaluator = createScopedAuthorizationEvaluatorV1(provider);
const request: AuthorizationRequestV1 = {
  permission: 'artifact.record.read',
  channel: 'web',
  tenantFilter: scope,
  resource: { resourceType: 'artifact', resourceId: stableId },
};

void evaluator.authorizeV1(request);

const fabricatedAuthority: AuthorizationRequestV1 = {
  ...request,
  // @ts-expect-error -- request consumers cannot provide authoritative role facts.
  roleId: 'owner',
};

const allowedEvaluatorKey: keyof typeof evaluator = 'authorizeV1';
// @ts-expect-error -- the evaluator does not expose authority-minting methods.
const forbiddenEvaluatorKey: keyof typeof evaluator = 'createEvaluatedContextV1';

void allowedEvaluatorKey;
void forbiddenEvaluatorKey;
void fabricatedAuthority;

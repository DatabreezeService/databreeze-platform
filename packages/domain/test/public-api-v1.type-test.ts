import { createScopedAuthorizationEvaluatorV1 } from '@databreeze/domain/authorization/v1';
import type {
  EvaluatedAuthorizationContextV1,
  TrustedResourceOwnershipV1,
  VerifiedTenantFilterV1,
} from '@databreeze/domain/authorization/v1';
import type {
  StableIdentifierV1,
  StrictUtcTimestampV1,
  TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

declare const scope: TenantScopeV1;
declare const stableId: StableIdentifierV1;
declare const evaluatedAt: StrictUtcTimestampV1;

// These failures prove that a structurally matching client claim cannot satisfy a trusted API type.
// @ts-expect-error -- verified filters are minted only by an evaluator instance.
const forgedFilter: VerifiedTenantFilterV1 = { scope };
// @ts-expect-error -- trusted ownership includes a private nominal brand.
const forgedResource: TrustedResourceOwnershipV1 = {
  resourceType: 'artifact',
  resourceId: stableId,
  tenantScope: scope,
};
// @ts-expect-error -- evaluated contexts include a private nominal brand.
const forgedContext: EvaluatedAuthorizationContextV1 = {
  schemaVersion: 1,
  principalId: stableId,
  roleId: 'owner',
  membershipScope: scope,
  membershipActive: true,
  channel: 'api',
  policyConditionsSatisfied: true,
  evaluatedAt,
  resource: forgedResource,
};

const evaluator = createScopedAuthorizationEvaluatorV1();
void evaluator;
void forgedFilter;
void forgedContext;

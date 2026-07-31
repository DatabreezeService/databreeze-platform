import {
  isPermissionV1,
  isRoleIdV1,
  roleHasPermissionV1,
  type PermissionV1,
} from '../permissions/v1.ts';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.ts';

/** Partial foundation coverage: IAM-002, IAM-003, IAM-004, IAM-009, and IAM-019. */

export const AUTHORIZATION_SCHEMA_VERSION_V1 = 1 as const;

export const AUTHORIZATION_CHANNELS_V1 = Object.freeze([
  'api',
  'web',
  'desktop',
  'android',
  'worker',
  'sync',
  'stream',
  'shared-link',
] as const);

export type AuthorizationChannelV1 = (typeof AUTHORIZATION_CHANNELS_V1)[number];

export type AuthorizationDenialCodeV1 =
  | 'INACTIVE_MEMBERSHIP'
  | 'POLICY_CONDITIONS_REQUIRED'
  | 'RESOURCE_TYPE_MISMATCH'
  | 'ROLE_PERMISSION_MISSING'
  | 'TENANT_SCOPE_MISMATCH'
  | 'UNKNOWN_CHANNEL'
  | 'UNKNOWN_PERMISSION'
  | 'UNKNOWN_ROLE'
  | 'UNTRUSTED_CONTEXT';

export type AuthorizationDecisionV1 =
  | {
      readonly allowed: true;
      readonly permission: PermissionV1;
      readonly tenantScope: TenantScopeV1;
    }
  | { readonly allowed: false; readonly code: AuthorizationDenialCodeV1 };

declare const verifiedTenantFilterV1Brand: unique symbol;
declare const trustedResourceOwnershipV1Brand: unique symbol;
declare const evaluatedAuthorizationContextV1Brand: unique symbol;

export interface VerifiedTenantFilterV1 {
  readonly scope: TenantScopeV1;
  readonly [verifiedTenantFilterV1Brand]: true;
}

export interface TrustedResourceOwnershipV1 {
  readonly resourceType: string;
  readonly resourceId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly [trustedResourceOwnershipV1Brand]: true;
}

export interface EvaluatedAuthorizationContextV1 {
  readonly schemaVersion: typeof AUTHORIZATION_SCHEMA_VERSION_V1;
  readonly principalId: StableIdentifierV1;
  readonly roleId: string;
  readonly membershipScope: TenantScopeV1;
  readonly membershipActive: boolean;
  readonly channel: string;
  readonly policyConditionsSatisfied: boolean;
  readonly evaluatedAt: StrictUtcTimestampV1;
  readonly resource: TrustedResourceOwnershipV1;
  readonly [evaluatedAuthorizationContextV1Brand]: true;
}

export type TenantFilterResultV1 =
  | { readonly accepted: true; readonly value: VerifiedTenantFilterV1 }
  | {
      readonly accepted: false;
      readonly code:
        | 'INVALID_AUTHORITY_SCOPE'
        | 'TENANT_FILTER_INVALID'
        | 'TENANT_FILTER_MISMATCH'
        | 'TENANT_FILTER_REQUIRED';
    };

export type ResourceOwnershipResultV1 =
  | { readonly accepted: true; readonly value: TrustedResourceOwnershipV1 }
  | {
      readonly accepted: false;
      readonly code:
        | 'INVALID_RESOURCE_OWNERSHIP'
        | 'RESOURCE_OWNERSHIP_MISMATCH'
        | 'UNVERIFIED_TENANT_FILTER';
    };

export type EvaluatedContextResultV1 =
  | { readonly accepted: true; readonly value: EvaluatedAuthorizationContextV1 }
  | {
      readonly accepted: false;
      readonly code: 'INVALID_EVALUATED_CONTEXT' | 'UNTRUSTED_RESOURCE_OWNERSHIP';
    };

export interface ScopedAuthorizationEvaluatorV1 {
  readonly verifyTenantFilterV1: (authorityScope: unknown, filter: unknown) => TenantFilterResultV1;
  /** Accept only the minimal ownership tuple returned by an authoritative scoped lookup. */
  readonly acceptTrustedResourceLookupV1: (
    filter: unknown,
    lookupResult: unknown,
  ) => ResourceOwnershipResultV1;
  readonly createEvaluatedContextV1: (input: unknown) => EvaluatedContextResultV1;
  readonly authorizeV1: (context: unknown, permission: unknown) => AuthorizationDecisionV1;
}

type ResourceTypeV1 =
  | 'approval-request'
  | 'artifact'
  | 'billing-account'
  | 'device'
  | 'job'
  | 'organization'
  | 'project'
  | 'workspace';

const permissionResourceTypes: Readonly<Record<PermissionV1, ResourceTypeV1>> = Object.freeze({
  'organization.profile.read': 'organization',
  'organization.settings.manage': 'organization',
  'organization.ownership.transfer': 'organization',
  'workspace.settings.read': 'workspace',
  'workspace.settings.manage': 'workspace',
  'project.record.read': 'project',
  'project.record.manage': 'project',
  'artifact.record.read': 'artifact',
  'artifact.original.download': 'artifact',
  'artifact.derived.create': 'artifact',
  'job.execution.read': 'job',
  'job.execution.create': 'job',
  'job.execution.run': 'job',
  'job.execution.cancel': 'job',
  'approval.request.read': 'approval-request',
  'approval.decision.create': 'approval-request',
  'billing.account.read': 'billing-account',
  'billing.account.manage': 'billing-account',
  'device.identity.read': 'device',
  'device.identity.revoke': 'device',
});

const resourceScopeTypes: Readonly<Record<ResourceTypeV1, readonly TenantScopeV1['scopeType'][]>> =
  Object.freeze({
    'approval-request': Object.freeze(['workspace', 'project'] as const),
    artifact: Object.freeze(['workspace', 'project'] as const),
    'billing-account': Object.freeze(['organization'] as const),
    device: Object.freeze(['organization'] as const),
    job: Object.freeze(['workspace', 'project'] as const),
    organization: Object.freeze(['organization'] as const),
    project: Object.freeze(['project'] as const),
    workspace: Object.freeze(['workspace'] as const),
  });

const authorizationChannelSet = new Set<string>(AUTHORIZATION_CHANNELS_V1);
const resourceTypePattern = /^[a-z][a-z0-9-]{0,62}$/;

function isResourceTypeV1(input: string): input is ResourceTypeV1 {
  return Object.hasOwn(resourceScopeTypes, input);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function hasExactKeys(input: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(input).sort();
  const sortedExpected = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpected.length &&
    actualKeys.every((key, index) => key === sortedExpected[index])
  );
}

function rejectFilter(code: Exclude<TenantFilterResultV1, { accepted: true }>['code']) {
  return Object.freeze({ accepted: false as const, code });
}

function rejectResource(code: Exclude<ResourceOwnershipResultV1, { accepted: true }>['code']) {
  return Object.freeze({ accepted: false as const, code });
}

function rejectContext(code: Exclude<EvaluatedContextResultV1, { accepted: true }>['code']) {
  return Object.freeze({ accepted: false as const, code });
}

function deny(code: AuthorizationDenialCodeV1): AuthorizationDecisionV1 {
  return Object.freeze({ allowed: false, code });
}

export function createScopedAuthorizationEvaluatorV1(): ScopedAuthorizationEvaluatorV1 {
  const verifiedFilters = new WeakSet<object>();
  const trustedResources = new WeakSet<object>();
  const evaluatedContexts = new WeakSet<object>();

  function verifyTenantFilterV1(authorityScope: unknown, filter: unknown): TenantFilterResultV1 {
    const parsedAuthority = parseTenantScopeV1(authorityScope);
    if (!parsedAuthority.accepted) {
      return rejectFilter('INVALID_AUTHORITY_SCOPE');
    }
    if (filter === undefined || filter === null) {
      return rejectFilter('TENANT_FILTER_REQUIRED');
    }

    const parsedFilter = parseTenantScopeV1(filter);
    if (!parsedFilter.accepted) {
      return rejectFilter('TENANT_FILTER_INVALID');
    }
    if (!tenantScopesEqualV1(parsedAuthority.value, parsedFilter.value)) {
      return rejectFilter('TENANT_FILTER_MISMATCH');
    }

    const verified = Object.freeze({ scope: parsedFilter.value }) as VerifiedTenantFilterV1;
    verifiedFilters.add(verified);
    return Object.freeze({ accepted: true, value: verified });
  }

  function acceptTrustedResourceLookupV1(
    filter: unknown,
    lookupResult: unknown,
  ): ResourceOwnershipResultV1 {
    if (!isRecord(filter) || !verifiedFilters.has(filter)) {
      return rejectResource('UNVERIFIED_TENANT_FILTER');
    }
    const verifiedFilter = filter as unknown as VerifiedTenantFilterV1;

    if (
      !isRecord(lookupResult) ||
      !hasExactKeys(lookupResult, ['resourceId', 'resourceType', 'tenantScope'])
    ) {
      return rejectResource('INVALID_RESOURCE_OWNERSHIP');
    }

    const resourceType = lookupResult['resourceType'];
    if (
      typeof resourceType !== 'string' ||
      !resourceTypePattern.test(resourceType) ||
      !isResourceTypeV1(resourceType)
    ) {
      return rejectResource('INVALID_RESOURCE_OWNERSHIP');
    }

    const resourceId = parseStableIdentifierV1(lookupResult['resourceId']);
    const tenantScope = parseTenantScopeV1(lookupResult['tenantScope']);
    if (!resourceId.accepted || !tenantScope.accepted) {
      return rejectResource('INVALID_RESOURCE_OWNERSHIP');
    }
    if (!tenantScopesEqualV1(verifiedFilter.scope, tenantScope.value)) {
      return rejectResource('RESOURCE_OWNERSHIP_MISMATCH');
    }
    if (!resourceScopeTypes[resourceType].includes(tenantScope.value.scopeType)) {
      return rejectResource('INVALID_RESOURCE_OWNERSHIP');
    }

    const trusted = Object.freeze({
      resourceType,
      resourceId: resourceId.value,
      tenantScope: tenantScope.value,
    }) as TrustedResourceOwnershipV1;
    trustedResources.add(trusted);
    return Object.freeze({ accepted: true, value: trusted });
  }

  function createEvaluatedContextV1(input: unknown): EvaluatedContextResultV1 {
    if (
      !isRecord(input) ||
      !hasExactKeys(input, [
        'channel',
        'evaluatedAt',
        'membershipActive',
        'membershipScope',
        'policyConditionsSatisfied',
        'principalId',
        'resource',
        'roleId',
      ])
    ) {
      return rejectContext('INVALID_EVALUATED_CONTEXT');
    }
    const resource = input['resource'];
    if (!isRecord(resource) || !trustedResources.has(resource)) {
      return rejectContext('UNTRUSTED_RESOURCE_OWNERSHIP');
    }

    const principalId = parseStableIdentifierV1(input['principalId']);
    const membershipScope = parseTenantScopeV1(input['membershipScope']);
    const evaluatedAt = parseStrictUtcTimestampV1(input['evaluatedAt']);
    const roleId = input['roleId'];
    const channel = input['channel'];
    const membershipActive = input['membershipActive'];
    const policyConditionsSatisfied = input['policyConditionsSatisfied'];
    if (
      !principalId.accepted ||
      !membershipScope.accepted ||
      !evaluatedAt.accepted ||
      typeof roleId !== 'string' ||
      roleId.length === 0 ||
      typeof channel !== 'string' ||
      channel.length === 0 ||
      typeof membershipActive !== 'boolean' ||
      typeof policyConditionsSatisfied !== 'boolean'
    ) {
      return rejectContext('INVALID_EVALUATED_CONTEXT');
    }

    const context = Object.freeze({
      schemaVersion: AUTHORIZATION_SCHEMA_VERSION_V1,
      principalId: principalId.value,
      roleId,
      membershipScope: membershipScope.value,
      membershipActive,
      channel,
      policyConditionsSatisfied,
      evaluatedAt: evaluatedAt.value,
      resource: resource as unknown as TrustedResourceOwnershipV1,
    }) as EvaluatedAuthorizationContextV1;
    evaluatedContexts.add(context);
    return Object.freeze({ accepted: true, value: context });
  }

  function authorizeV1(context: unknown, permission: unknown): AuthorizationDecisionV1 {
    if (!isRecord(context) || !evaluatedContexts.has(context)) {
      return deny('UNTRUSTED_CONTEXT');
    }
    const evaluated = context as unknown as EvaluatedAuthorizationContextV1;

    if (!isRoleIdV1(evaluated.roleId)) {
      return deny('UNKNOWN_ROLE');
    }
    if (!isPermissionV1(permission)) {
      return deny('UNKNOWN_PERMISSION');
    }
    if (!authorizationChannelSet.has(evaluated.channel)) {
      return deny('UNKNOWN_CHANNEL');
    }
    if (!evaluated.membershipActive) {
      return deny('INACTIVE_MEMBERSHIP');
    }
    if (!evaluated.policyConditionsSatisfied) {
      return deny('POLICY_CONDITIONS_REQUIRED');
    }
    if (!roleHasPermissionV1(evaluated.roleId, permission)) {
      return deny('ROLE_PERMISSION_MISSING');
    }
    if (permissionResourceTypes[permission] !== evaluated.resource.resourceType) {
      return deny('RESOURCE_TYPE_MISMATCH');
    }
    if (!tenantScopeContainsV1(evaluated.membershipScope, evaluated.resource.tenantScope)) {
      return deny('TENANT_SCOPE_MISMATCH');
    }

    return Object.freeze({
      allowed: true,
      permission,
      tenantScope: evaluated.resource.tenantScope,
    });
  }

  return Object.freeze({
    verifyTenantFilterV1,
    acceptTrustedResourceLookupV1,
    createEvaluatedContextV1,
    authorizeV1,
  });
}

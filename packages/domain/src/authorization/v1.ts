import {
  AUTHORIZATION_CHANNELS_V1,
  PERMISSION_APPLICABILITY_V1,
  RESOURCE_TYPES_V1,
  isPermissionV1,
  isRoleIdV1,
  roleHasPermissionV1,
  type AuthorizationChannelV1,
  type InitialRoleIdV1,
  type PermissionV1,
  type ResourceTypeV1,
} from '../permissions/v1.js';
import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

export { AUTHORIZATION_CHANNELS_V1 } from '../permissions/v1.js';
export type { AuthorizationChannelV1 } from '../permissions/v1.js';

/** Partial foundation coverage: IAM-002, IAM-003, IAM-004, IAM-009, and IAM-019. */

export const AUTHORIZATION_SCHEMA_VERSION_V1 = 1 as const;

export type AuthorizationDenialCodeV1 =
  | 'AUTHORITY_INVALID'
  | 'AUTHORITY_UNAVAILABLE'
  | 'CHANNEL_NOT_ALLOWED'
  | 'INACTIVE_MEMBERSHIP'
  | 'INVALID_AUTHORIZATION_REQUEST'
  | 'INVALID_RESOURCE_SELECTOR'
  | 'POLICY_CONDITIONS_REQUIRED'
  | 'RESOURCE_IDENTITY_MISMATCH'
  | 'RESOURCE_OWNERSHIP_MISMATCH'
  | 'RESOURCE_TYPE_MISMATCH'
  | 'ROLE_PERMISSION_MISSING'
  | 'TENANT_FILTER_INVALID'
  | 'TENANT_FILTER_REQUIRED'
  | 'TENANT_SCOPE_MISMATCH'
  | 'UNKNOWN_CHANNEL'
  | 'UNKNOWN_PERMISSION'
  | 'UNKNOWN_ROLE';

export type AuthorizationDecisionV1 =
  | {
      readonly allowed: true;
      readonly permission: PermissionV1;
      readonly tenantScope: TenantScopeV1;
    }
  | { readonly allowed: false; readonly code: AuthorizationDenialCodeV1 };

export interface AuthorizationResourceSelectorV1 {
  readonly resourceType: ResourceTypeV1;
  readonly resourceId: StableIdentifierV1;
}

/** The only request-controlled inputs accepted by the evaluator. */
export interface AuthorizationRequestV1 {
  readonly permission: PermissionV1;
  readonly channel: AuthorizationChannelV1;
  readonly tenantFilter: TenantScopeV1;
  readonly resource: AuthorizationResourceSelectorV1;
}

export interface AuthoritativeResourceV1 extends AuthorizationResourceSelectorV1 {
  readonly tenantScope: TenantScopeV1;
}

export interface ScopedResourceLookupQueryV1 extends AuthorizationResourceSelectorV1 {
  readonly tenantScope: TenantScopeV1;
}

export interface MembershipResolutionQueryV1 {
  readonly principalId: StableIdentifierV1;
  readonly resource: AuthoritativeResourceV1;
}

export interface EvaluatedMembershipV1 {
  readonly roleId: InitialRoleIdV1;
  readonly membershipScope: TenantScopeV1;
  readonly membershipActive: true;
}

export interface PolicyEvaluationQueryV1 {
  readonly principalId: StableIdentifierV1;
  readonly permission: PermissionV1;
  readonly channel: AuthorizationChannelV1;
  readonly membership: EvaluatedMembershipV1;
  readonly resource: AuthoritativeResourceV1;
}

export type AwaitableV1<TValue> = TValue | PromiseLike<TValue>;

/**
 * Server-composed authority boundary. Implementations resolve every fact from authenticated,
 * tenant-scoped application state; request bodies must never implement this port.
 *
 * Results remain `unknown` so runtime validation is mandatory even for typed adapters.
 */
export interface AuthorizationAuthorityProviderV1 {
  readonly resolveAuthenticatedPrincipalV1: () => AwaitableV1<unknown>;
  readonly lookupResourceV1: (query: ScopedResourceLookupQueryV1) => AwaitableV1<unknown>;
  readonly resolveMembershipV1: (query: MembershipResolutionQueryV1) => AwaitableV1<unknown>;
  readonly evaluatePolicyV1: (query: PolicyEvaluationQueryV1) => AwaitableV1<unknown>;
}

export interface ScopedAuthorizationEvaluatorV1 {
  readonly authorizeV1: (request: unknown) => Promise<AuthorizationDecisionV1>;
}

export interface ScopedAuthorizationEvaluatorOptionsV1 {
  /** Maximum time allowed for each call to the provider bound to this evaluator. */
  readonly providerCallTimeoutMs: number;
}

interface ParsedMembershipV1 {
  readonly roleId: string;
  readonly membershipScope: TenantScopeV1;
  readonly membershipActive: boolean;
}

type ParsedValueV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false };

const authorizationChannelSet = new Set<string>(AUTHORIZATION_CHANNELS_V1);
const resourceTypeSet = new Set<string>(RESOURCE_TYPES_V1);
const DEFAULT_PROVIDER_CALL_TIMEOUT_MS_V1 = 1_000;
const MAX_PROVIDER_CALL_TIMEOUT_MS_V1 = 60_000;

interface AuthorizationTimerRuntimeV1 {
  readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

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

function providerCallTimeoutMsV1(input: unknown): number {
  if (input === undefined) {
    return DEFAULT_PROVIDER_CALL_TIMEOUT_MS_V1;
  }
  if (!isRecord(input) || !hasExactKeys(input, ['providerCallTimeoutMs'])) {
    throw new TypeError('Invalid authorization evaluator options');
  }

  const timeoutMs = input['providerCallTimeoutMs'];
  if (
    typeof timeoutMs !== 'number' ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_PROVIDER_CALL_TIMEOUT_MS_V1
  ) {
    throw new TypeError('Invalid authorization provider call timeout');
  }
  return timeoutMs;
}

function timerRuntimeV1(): AuthorizationTimerRuntimeV1 {
  const runtime = globalThis as unknown as Partial<AuthorizationTimerRuntimeV1>;
  if (typeof runtime.setTimeout !== 'function' || typeof runtime.clearTimeout !== 'function') {
    throw new TypeError('Authorization evaluator requires timer support');
  }
  return Object.freeze({
    setTimeout: runtime.setTimeout.bind(globalThis),
    clearTimeout: runtime.clearTimeout.bind(globalThis),
  });
}

async function withProviderCallTimeoutV1<TValue>(
  operation: () => AwaitableV1<TValue>,
  timeoutMs: number,
  timers: AuthorizationTimerRuntimeV1,
): Promise<TValue> {
  let scheduled = false;
  let timeoutHandle: unknown;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = timers.setTimeout(() => reject(new Error('AUTHORITY_TIMEOUT')), timeoutMs);
    scheduled = true;
  });

  try {
    return await Promise.race([Promise.resolve().then(operation), timeout]);
  } finally {
    if (scheduled) {
      timers.clearTimeout(timeoutHandle);
    }
  }
}

function isAuthorizationChannelV1(input: unknown): input is AuthorizationChannelV1 {
  return typeof input === 'string' && authorizationChannelSet.has(input);
}

function isResourceTypeV1(input: unknown): input is ResourceTypeV1 {
  return typeof input === 'string' && resourceTypeSet.has(input);
}

function accepted<TValue>(value: TValue): ParsedValueV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected<TValue>(): ParsedValueV1<TValue> {
  return Object.freeze({ accepted: false });
}

function deny(code: AuthorizationDenialCodeV1): AuthorizationDecisionV1 {
  return Object.freeze({ allowed: false, code });
}

function parseResourceSelectorV1(input: unknown): ParsedValueV1<AuthorizationResourceSelectorV1> {
  if (!isRecord(input) || !hasExactKeys(input, ['resourceId', 'resourceType'])) {
    return rejected();
  }

  const resourceType = input['resourceType'];
  const resourceId = parseStableIdentifierV1(input['resourceId']);
  if (!isResourceTypeV1(resourceType) || !resourceId.accepted) {
    return rejected();
  }

  return accepted(Object.freeze({ resourceType, resourceId: resourceId.value }));
}

function parsePrincipalV1(input: unknown): ParsedValueV1<StableIdentifierV1> {
  if (!isRecord(input) || !hasExactKeys(input, ['principalId'])) {
    return rejected();
  }

  const principalId = parseStableIdentifierV1(input['principalId']);
  return principalId.accepted ? accepted(principalId.value) : rejected();
}

function parseAuthoritativeResourceV1(input: unknown): ParsedValueV1<AuthoritativeResourceV1> {
  if (!isRecord(input) || !hasExactKeys(input, ['resourceId', 'resourceType', 'tenantScope'])) {
    return rejected();
  }

  const resourceType = input['resourceType'];
  const resourceId = parseStableIdentifierV1(input['resourceId']);
  const tenantScope = parseTenantScopeV1(input['tenantScope']);
  if (!isResourceTypeV1(resourceType) || !resourceId.accepted || !tenantScope.accepted) {
    return rejected();
  }
  if (!resourceScopeTypes[resourceType].includes(tenantScope.value.scopeType)) {
    return rejected();
  }

  return accepted(
    Object.freeze({
      resourceType,
      resourceId: resourceId.value,
      tenantScope: tenantScope.value,
    }),
  );
}

function parseMembershipV1(input: unknown): ParsedValueV1<ParsedMembershipV1> {
  if (!isRecord(input) || !hasExactKeys(input, ['membershipActive', 'membershipScope', 'roleId'])) {
    return rejected();
  }

  const roleId = input['roleId'];
  const membershipActive = input['membershipActive'];
  const membershipScope = parseTenantScopeV1(input['membershipScope']);
  if (
    typeof roleId !== 'string' ||
    roleId.length === 0 ||
    typeof membershipActive !== 'boolean' ||
    !membershipScope.accepted
  ) {
    return rejected();
  }

  return accepted(
    Object.freeze({ roleId, membershipScope: membershipScope.value, membershipActive }),
  );
}

function parsePolicyResultV1(input: unknown): ParsedValueV1<boolean> {
  if (!isRecord(input) || !hasExactKeys(input, ['satisfied'])) {
    return rejected();
  }

  return typeof input['satisfied'] === 'boolean' ? accepted(input['satisfied']) : rejected();
}

function resourceIdentityIsCoherentV1(resource: AuthoritativeResourceV1): boolean {
  if (resource.resourceType === 'organization') {
    return (
      resource.tenantScope.scopeType === 'organization' &&
      resource.resourceId === resource.tenantScope.organizationId
    );
  }
  if (resource.resourceType === 'workspace') {
    return (
      resource.tenantScope.scopeType === 'workspace' &&
      resource.resourceId === resource.tenantScope.workspaceId
    );
  }
  if (resource.resourceType === 'project') {
    return (
      resource.tenantScope.scopeType === 'project' &&
      resource.resourceId === resource.tenantScope.projectId
    );
  }

  return true;
}

function bindAuthorityMethodV1<TKey extends keyof AuthorizationAuthorityProviderV1>(
  provider: AuthorizationAuthorityProviderV1,
  key: TKey,
): AuthorizationAuthorityProviderV1[TKey] {
  const method = provider[key];
  if (typeof method !== 'function') {
    throw new TypeError(`Authorization authority provider is missing ${key}`);
  }

  return method.bind(provider) as AuthorizationAuthorityProviderV1[TKey];
}

export function createScopedAuthorizationEvaluatorV1(
  provider: AuthorizationAuthorityProviderV1,
  options?: ScopedAuthorizationEvaluatorOptionsV1,
): ScopedAuthorizationEvaluatorV1 {
  const providerCallTimeoutMs = providerCallTimeoutMsV1(options);
  const timers = timerRuntimeV1();
  const resolveAuthenticatedPrincipalV1 = bindAuthorityMethodV1(
    provider,
    'resolveAuthenticatedPrincipalV1',
  );
  const lookupResourceV1 = bindAuthorityMethodV1(provider, 'lookupResourceV1');
  const resolveMembershipV1 = bindAuthorityMethodV1(provider, 'resolveMembershipV1');
  const evaluatePolicyV1 = bindAuthorityMethodV1(provider, 'evaluatePolicyV1');

  async function authorizeV1(request: unknown): Promise<AuthorizationDecisionV1> {
    if (!isRecord(request)) {
      return deny('INVALID_AUTHORIZATION_REQUEST');
    }
    if (!Object.hasOwn(request, 'tenantFilter') || request['tenantFilter'] == null) {
      return deny('TENANT_FILTER_REQUIRED');
    }
    if (!hasExactKeys(request, ['channel', 'permission', 'resource', 'tenantFilter'])) {
      return deny('INVALID_AUTHORIZATION_REQUEST');
    }

    const permission = request['permission'];
    if (!isPermissionV1(permission)) {
      return deny('UNKNOWN_PERMISSION');
    }

    const channel = request['channel'];
    if (!isAuthorizationChannelV1(channel)) {
      return deny('UNKNOWN_CHANNEL');
    }

    const applicability = PERMISSION_APPLICABILITY_V1[permission];
    if (!applicability.allowedChannels.includes(channel)) {
      return deny('CHANNEL_NOT_ALLOWED');
    }

    const tenantFilter = parseTenantScopeV1(request['tenantFilter']);
    if (!tenantFilter.accepted) {
      return deny('TENANT_FILTER_INVALID');
    }

    const resourceSelector = parseResourceSelectorV1(request['resource']);
    if (!resourceSelector.accepted) {
      return deny('INVALID_RESOURCE_SELECTOR');
    }
    if (resourceSelector.value.resourceType !== applicability.resourceType) {
      return deny('RESOURCE_TYPE_MISMATCH');
    }

    try {
      const principal = parsePrincipalV1(
        await withProviderCallTimeoutV1(
          () => resolveAuthenticatedPrincipalV1(),
          providerCallTimeoutMs,
          timers,
        ),
      );
      if (!principal.accepted) {
        return deny('AUTHORITY_INVALID');
      }

      const lookupQuery: ScopedResourceLookupQueryV1 = Object.freeze({
        resourceType: resourceSelector.value.resourceType,
        resourceId: resourceSelector.value.resourceId,
        tenantScope: tenantFilter.value,
      });
      const resource = parseAuthoritativeResourceV1(
        await withProviderCallTimeoutV1(
          () => lookupResourceV1(lookupQuery),
          providerCallTimeoutMs,
          timers,
        ),
      );
      if (!resource.accepted) {
        return deny('AUTHORITY_INVALID');
      }
      if (
        resource.value.resourceType !== resourceSelector.value.resourceType ||
        resource.value.resourceId !== resourceSelector.value.resourceId ||
        !tenantScopesEqualV1(resource.value.tenantScope, tenantFilter.value)
      ) {
        return deny('RESOURCE_OWNERSHIP_MISMATCH');
      }
      if (!resourceIdentityIsCoherentV1(resource.value)) {
        return deny('RESOURCE_IDENTITY_MISMATCH');
      }

      const membershipQuery: MembershipResolutionQueryV1 = Object.freeze({
        principalId: principal.value,
        resource: resource.value,
      });
      const membership = parseMembershipV1(
        await withProviderCallTimeoutV1(
          () => resolveMembershipV1(membershipQuery),
          providerCallTimeoutMs,
          timers,
        ),
      );
      if (!membership.accepted) {
        return deny('AUTHORITY_INVALID');
      }
      if (!isRoleIdV1(membership.value.roleId)) {
        return deny('UNKNOWN_ROLE');
      }
      if (!membership.value.membershipActive) {
        return deny('INACTIVE_MEMBERSHIP');
      }
      if (!tenantScopeContainsV1(membership.value.membershipScope, resource.value.tenantScope)) {
        return deny('TENANT_SCOPE_MISMATCH');
      }
      if (!roleHasPermissionV1(membership.value.roleId, permission)) {
        return deny('ROLE_PERMISSION_MISSING');
      }

      const evaluatedMembership: EvaluatedMembershipV1 = Object.freeze({
        roleId: membership.value.roleId,
        membershipScope: membership.value.membershipScope,
        membershipActive: true,
      });
      const policyQuery: PolicyEvaluationQueryV1 = Object.freeze({
        principalId: principal.value,
        permission,
        channel,
        membership: evaluatedMembership,
        resource: resource.value,
      });
      const policy = parsePolicyResultV1(
        await withProviderCallTimeoutV1(
          () => evaluatePolicyV1(policyQuery),
          providerCallTimeoutMs,
          timers,
        ),
      );
      if (!policy.accepted) {
        return deny('AUTHORITY_INVALID');
      }
      if (!policy.value) {
        return deny('POLICY_CONDITIONS_REQUIRED');
      }

      return Object.freeze({
        allowed: true,
        permission,
        tenantScope: resource.value.tenantScope,
      });
    } catch {
      return deny('AUTHORITY_UNAVAILABLE');
    }
  }

  return Object.freeze({ authorizeV1 });
}

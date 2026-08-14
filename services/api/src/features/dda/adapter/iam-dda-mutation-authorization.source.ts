import { isPermissionV1, type PermissionV1 } from '@databreeze/domain/permissions/v1';
import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  createIamTenantContextV1,
  type IamTenantContextV1,
} from '../../../platform/iam-tenant-context.js';

/**
 * Server-only seam for the canonical IAM evaluator. DDA adapters derive the
 * permission and resources; callers cannot supply a role or alternate action.
 */
export interface IamDdaMutationAuthorizationSourceV1 {
  authorize(input: {
    readonly context: IamTenantContextV1;
    readonly action: PermissionV1;
    readonly resourceIds: readonly StableIdentifierV1[];
  }): Promise<IamDdaMutationAuthorizationDecisionV1>;
}

export type IamDdaMutationAuthorizationFailureCodeV1 =
  | 'FORBIDDEN'
  | 'AUTHORIZATION_UNAVAILABLE'
  | 'STALE_AUTHORIZATION';

export type IamDdaMutationAuthorizationDecisionV1 =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly code: IamDdaMutationAuthorizationFailureCodeV1;
    };

export type IamDdaMutationAuthorizationResultV1 =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly code: 'FORBIDDEN' | 'AUTHORIZATION_UNAVAILABLE' };

function unavailable(): IamDdaMutationAuthorizationResultV1 {
  return { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}

function hasExactKeys(
  input: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): boolean {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  return (
    requiredKeys.every((key) => Object.hasOwn(input, key)) &&
    Object.keys(input).every((key) => allowedKeys.has(key))
  );
}

/** Require the canonical lowercase identifier representation at the boundary. */
export function parseExactStableIdentifierV1(input: unknown): StableIdentifierV1 | undefined {
  if (typeof input !== 'string') return undefined;
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted && parsed.value === input ? parsed.value : undefined;
}

/** Require a fully qualified, canonical tenant scope without normalization. */
export function parseExactTenantScopeV1(input: unknown): TenantScopeV1 | undefined {
  if (!isRecord(input)) return undefined;
  const parsed = parseTenantScopeV1(input);
  if (!parsed.accepted) return undefined;

  const requiredScopeKeys =
    parsed.value.scopeType === 'organization'
      ? ['scopeType', 'organizationId']
      : parsed.value.scopeType === 'workspace'
        ? ['scopeType', 'organizationId', 'workspaceId']
        : ['scopeType', 'organizationId', 'workspaceId', 'projectId'];
  if (!hasExactKeys(input, requiredScopeKeys)) return undefined;

  const organizationId = parseExactStableIdentifierV1(input['organizationId']);
  if (organizationId === undefined || organizationId !== parsed.value.organizationId)
    return undefined;
  if (input['scopeType'] !== parsed.value.scopeType) return undefined;

  if (parsed.value.scopeType === 'organization') return parsed.value;

  const workspaceId = parseExactStableIdentifierV1(input['workspaceId']);
  if (workspaceId === undefined || workspaceId !== parsed.value.workspaceId) return undefined;
  if (parsed.value.scopeType === 'workspace') return parsed.value;

  const projectId = parseExactStableIdentifierV1(input['projectId']);
  if (projectId === undefined || projectId !== parsed.value.projectId) return undefined;
  return parsed.value;
}

/**
 * Re-parse server context before it reaches the IAM source. Workspace and
 * project decisions require the exact workspace policy epoch.
 */
export function parseExactIamTenantContextV1(input: unknown): IamTenantContextV1 | undefined {
  if (!isRecord(input)) return undefined;

  const tenantScope = parseExactTenantScopeV1(input['tenantScope']);
  const actorId = parseExactStableIdentifierV1(input['actorId']);
  const correlationId = parseExactStableIdentifierV1(input['correlationId']);
  if (tenantScope === undefined || actorId === undefined || correlationId === undefined) {
    return undefined;
  }
  const requiredContextKeys = [
    'tenantScope',
    'actorId',
    'correlationId',
    'idempotencyKey',
    'authorizationEpoch',
    'mfaReenrollmentRequired',
  ];
  if (tenantScope.scopeType !== 'organization')
    requiredContextKeys.push('workspaceAuthorizationEpoch');
  if (
    !hasExactKeys(input, requiredContextKeys, [
      'workspaceAuthorizationEpoch',
      'mfaRequired',
      'expectedRevision',
    ])
  ) {
    return undefined;
  }
  if (typeof input['mfaReenrollmentRequired'] !== 'boolean') return undefined;
  if (
    tenantScope.scopeType !== 'organization' &&
    typeof input['workspaceAuthorizationEpoch'] !== 'number'
  ) {
    return undefined;
  }

  const parsed = createIamTenantContextV1({
    tenantScope,
    actorId,
    correlationId,
    idempotencyKey: input['idempotencyKey'],
    authorizationEpoch: input['authorizationEpoch'],
    workspaceAuthorizationEpoch: input['workspaceAuthorizationEpoch'],
    mfaRequired: input['mfaRequired'],
    mfaReenrollmentRequired: input['mfaReenrollmentRequired'],
    expectedRevision: input['expectedRevision'],
  });
  if (!parsed.accepted) return undefined;

  const context = parsed.value;
  if (
    !tenantScopesEqualV1(context.tenantScope, tenantScope) ||
    context.actorId !== actorId ||
    context.correlationId !== correlationId ||
    context.idempotencyKey !== input['idempotencyKey'] ||
    context.authorizationEpoch !== input['authorizationEpoch'] ||
    context.workspaceAuthorizationEpoch !== input['workspaceAuthorizationEpoch'] ||
    context.mfaRequired !== input['mfaRequired'] ||
    context.mfaReenrollmentRequired !== input['mfaReenrollmentRequired'] ||
    context.expectedRevision !== input['expectedRevision']
  ) {
    return undefined;
  }
  return context;
}

function mapDecision(input: unknown): IamDdaMutationAuthorizationResultV1 {
  if (!isRecord(input)) return unavailable();
  if (input['allowed'] === true) {
    return hasExactKeys(input, ['allowed']) ? { accepted: true } : unavailable();
  }
  if (input['allowed'] !== false) return unavailable();
  if (!hasExactKeys(input, ['allowed', 'code'])) return unavailable();

  if (input['code'] === 'FORBIDDEN') return { accepted: false, code: 'FORBIDDEN' };
  if (input['code'] === 'AUTHORIZATION_UNAVAILABLE' || input['code'] === 'STALE_AUTHORIZATION') {
    return unavailable();
  }
  return unavailable();
}

export async function authorizeIamDdaMutationV1(
  source: IamDdaMutationAuthorizationSourceV1,
  contextInput: unknown,
  actionInput: unknown,
  resourceIdInputs: readonly unknown[],
): Promise<IamDdaMutationAuthorizationResultV1> {
  const context = parseExactIamTenantContextV1(contextInput);
  if (context === undefined || !isPermissionV1(actionInput)) return unavailable();
  if (!Array.isArray(resourceIdInputs) || resourceIdInputs.length === 0) return unavailable();

  const resourceIds: StableIdentifierV1[] = [];
  for (const resourceIdInput of resourceIdInputs) {
    const resourceId = parseExactStableIdentifierV1(resourceIdInput);
    if (resourceId === undefined) return unavailable();
    resourceIds.push(resourceId);
  }

  try {
    const decision = await source.authorize({
      context,
      action: actionInput,
      resourceIds: Object.freeze(resourceIds),
    });
    return mapDecision(decision);
  } catch {
    return unavailable();
  }
}

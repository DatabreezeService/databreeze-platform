import {
  parseV1Contract,
  type Identifier,
  type TenantScope,
  type UtcTimestamp,
} from '@databreeze/contracts/v1';

/** Partial foundation coverage: IAM-001, IAM-009, and IAM-019. */

declare const stableIdentifierV1Brand: unique symbol;
declare const strictUtcTimestampV1Brand: unique symbol;

export type StableIdentifierV1 = Identifier & {
  readonly [stableIdentifierV1Brand]: 'StableIdentifierV1';
};

export type StrictUtcTimestampV1 = UtcTimestamp & {
  readonly [strictUtcTimestampV1Brand]: 'StrictUtcTimestampV1';
};

export interface OrganizationTenantScopeV1 {
  readonly scopeType: 'organization';
  readonly organizationId: StableIdentifierV1;
}

export interface WorkspaceTenantScopeV1 {
  readonly scopeType: 'workspace';
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
}

export interface ProjectTenantScopeV1 {
  readonly scopeType: 'project';
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly projectId: StableIdentifierV1;
}

export type TenantScopeV1 =
  | OrganizationTenantScopeV1
  | WorkspaceTenantScopeV1
  | ProjectTenantScopeV1;

export type ParseValueResultV1<TValue, TCode extends string> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: TCode };

const identifierSchemaId = 'https://schemas.databreeze.dev/contracts/v1/identifier';
const utcTimestampSchemaId = 'https://schemas.databreeze.dev/contracts/v1/utc-timestamp';
const tenantScopeSchemaId = 'https://schemas.databreeze.dev/contracts/v1/tenant-scope';

// UUIDv4 and UUIDv7 are random/time-sortable non-guessable identifiers used by DataBreeze.
const nonGuessableUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rejected<TCode extends string>(
  code: TCode,
): { readonly accepted: false; readonly code: TCode } {
  return Object.freeze({ accepted: false, code });
}

function accepted<TValue>(value: TValue): { readonly accepted: true; readonly value: TValue } {
  return Object.freeze({ accepted: true, value });
}

export function parseStableIdentifierV1(
  input: unknown,
): ParseValueResultV1<StableIdentifierV1, 'INVALID_IDENTIFIER'> {
  const parsed = parseV1Contract<string>(identifierSchemaId, input);
  if (!parsed.accepted || !nonGuessableUuidPattern.test(parsed.value)) {
    return rejected('INVALID_IDENTIFIER');
  }

  return accepted(parsed.value.toLowerCase() as StableIdentifierV1);
}

export function parseStrictUtcTimestampV1(
  input: unknown,
): ParseValueResultV1<StrictUtcTimestampV1, 'INVALID_UTC_TIMESTAMP'> {
  const parsed = parseV1Contract<string>(utcTimestampSchemaId, input);
  if (!parsed.accepted) {
    return rejected('INVALID_UTC_TIMESTAMP');
  }

  return accepted(parsed.value as StrictUtcTimestampV1);
}

function identifierFrom(input: unknown): StableIdentifierV1 | undefined {
  const result = parseStableIdentifierV1(input);
  return result.accepted ? result.value : undefined;
}

export function parseTenantScopeV1(
  input: unknown,
): ParseValueResultV1<TenantScopeV1, 'INVALID_TENANT_SCOPE'> {
  const parsed = parseV1Contract<TenantScope>(tenantScopeSchemaId, input);
  if (!parsed.accepted) {
    return rejected('INVALID_TENANT_SCOPE');
  }

  const organizationId = identifierFrom(parsed.value.organizationId);
  if (organizationId === undefined) {
    return rejected('INVALID_TENANT_SCOPE');
  }

  if (parsed.value.scopeType === 'organization') {
    return accepted(Object.freeze({ scopeType: 'organization', organizationId }));
  }

  const workspaceId = identifierFrom(parsed.value.workspaceId);
  if (workspaceId === undefined) {
    return rejected('INVALID_TENANT_SCOPE');
  }

  if (parsed.value.scopeType === 'workspace') {
    return accepted(Object.freeze({ scopeType: 'workspace', organizationId, workspaceId }));
  }

  const projectId = identifierFrom(parsed.value.projectId);
  if (projectId === undefined) {
    return rejected('INVALID_TENANT_SCOPE');
  }

  return accepted(Object.freeze({ scopeType: 'project', organizationId, workspaceId, projectId }));
}

export function tenantScopesEqualV1(left: TenantScopeV1, right: TenantScopeV1): boolean {
  if (left.scopeType !== right.scopeType || left.organizationId !== right.organizationId) {
    return false;
  }

  if (left.scopeType === 'organization' || right.scopeType === 'organization') {
    return left.scopeType === right.scopeType;
  }

  if (left.workspaceId !== right.workspaceId) {
    return false;
  }

  if (left.scopeType === 'workspace' || right.scopeType === 'workspace') {
    return left.scopeType === right.scopeType;
  }

  return left.projectId === right.projectId;
}

export function tenantScopeContainsV1(container: TenantScopeV1, candidate: TenantScopeV1): boolean {
  if (container.organizationId !== candidate.organizationId) {
    return false;
  }

  if (container.scopeType === 'organization') {
    return true;
  }

  if (candidate.scopeType === 'organization' || container.workspaceId !== candidate.workspaceId) {
    return false;
  }

  if (container.scopeType === 'workspace') {
    return true;
  }

  return candidate.scopeType === 'project' && container.projectId === candidate.projectId;
}

/** Stable storage and cursor key for a fully qualified tenant scope. */
export function tenantScopeKeyV1(scope: TenantScopeV1): string {
  if (scope.scopeType === 'organization') return `organization:${scope.organizationId}`;
  if (scope.scopeType === 'workspace')
    return `workspace:${scope.organizationId}:${scope.workspaceId}`;
  return `project:${scope.organizationId}:${scope.workspaceId}:${scope.projectId}`;
}

export function narrowTenantScopeV1(
  current: TenantScopeV1,
  candidate: TenantScopeV1,
): TenantScopeV1 | undefined {
  return tenantScopeContainsV1(current, candidate) ? candidate : undefined;
}

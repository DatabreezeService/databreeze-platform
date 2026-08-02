import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** DSM-025..DSM-027: one canonical, versioned workspace reference identity. */
export const REFERENCE_ENTITY_SCHEMA_VERSION_V1 = 1 as const;

export type BusinessPartyRoleV1 = 'SUPPLIER' | 'CUSTOMER' | 'CARRIER' | 'OTHER';
export type BusinessPartyStatusV1 = 'ACTIVE' | 'INACTIVE' | 'MERGED';
export type BusinessPartyVisibilityV1 = 'WORKSPACE' | 'PROJECT';

export interface ExternalIdentifierV1 {
  readonly namespace: string;
  readonly value: string;
}

export interface BusinessPartyVersionV1 {
  readonly schemaVersion: typeof REFERENCE_ENTITY_SCHEMA_VERSION_V1;
  readonly entityId: StableIdentifierV1;
  readonly versionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly entityType: 'BUSINESS_PARTY';
  readonly displayName: string;
  readonly roles: readonly BusinessPartyRoleV1[];
  readonly aliases: readonly string[];
  readonly externalIdentifiers: readonly ExternalIdentifierV1[];
  readonly status: BusinessPartyStatusV1;
  readonly visibility: BusinessPartyVisibilityV1;
  readonly canonicalHash: string;
  readonly createdAt: StrictUtcTimestampV1;
}

export interface BusinessPartyResolutionV1 {
  readonly schemaVersion: typeof REFERENCE_ENTITY_SCHEMA_VERSION_V1;
  readonly resolutionId: StableIdentifierV1;
  readonly resolutionType: 'MERGE';
  readonly sourceEntityId: StableIdentifierV1;
  readonly targetEntityId: StableIdentifierV1;
  readonly actorId: StableIdentifierV1;
  readonly reason: string;
  readonly evidenceId: StableIdentifierV1;
  readonly resolvedAt: StrictUtcTimestampV1;
}

export type ReferenceEntityErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TEXT'
  | 'INVALID_ROLE'
  | 'DUPLICATE_VALUE'
  | 'INVALID_STATE'
  | 'INVALID_HASH'
  | 'SAME_ENTITY'
  | 'CROSS_SCOPE';

export type ReferenceEntityResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ReferenceEntityErrorCodeV1 };

function accepted<TValue>(value: TValue): ReferenceEntityResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: ReferenceEntityErrorCodeV1): ReferenceEntityResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function identifier(input: unknown): StableIdentifierV1 | undefined {
  const result = parseStableIdentifierV1(input);
  return result.accepted ? result.value : undefined;
}

function scope(input: unknown): TenantScopeV1 | undefined {
  const result = parseTenantScopeV1(input);
  return result.accepted ? result.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const result = parseStrictUtcTimestampV1(input);
  return result.accepted ? result.value : undefined;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input)
    ? input.toLowerCase()
    : undefined;
}

export function createBusinessPartyVersionV1(input: {
  readonly entityId: unknown;
  readonly versionId: unknown;
  readonly tenantScope: unknown;
  readonly displayName: unknown;
  readonly roles: unknown;
  readonly aliases?: unknown;
  readonly externalIdentifiers?: unknown;
  readonly status?: unknown;
  readonly visibility?: unknown;
  readonly canonicalHash: unknown;
  readonly createdAt: unknown;
}): ReferenceEntityResultV1<BusinessPartyVersionV1> {
  const entityId = identifier(input.entityId);
  const versionId = identifier(input.versionId);
  const tenantScope = scope(input.tenantScope);
  const displayName = text(input.displayName, 255);
  const canonicalHash = hash(input.canonicalHash);
  const createdAt = timestamp(input.createdAt);
  if (!entityId || !versionId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope || tenantScope.scopeType === 'organization') return rejected('INVALID_SCOPE');
  if (!displayName) return rejected('INVALID_TEXT');
  if (!canonicalHash) return rejected('INVALID_HASH');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (!Array.isArray(input.roles) || input.roles.length === 0 || input.roles.length > 8)
    return rejected('INVALID_ROLE');
  const roles = input.roles.filter((role): role is BusinessPartyRoleV1 =>
    ['SUPPLIER', 'CUSTOMER', 'CARRIER', 'OTHER'].includes(role as string),
  );
  if (roles.length !== input.roles.length || new Set(roles).size !== roles.length)
    return rejected('INVALID_ROLE');
  const aliasesInput = input.aliases === undefined ? [] : input.aliases;
  if (!Array.isArray(aliasesInput) || aliasesInput.length > 64) return rejected('INVALID_TEXT');
  const aliases = aliasesInput.map((alias) => text(alias, 255));
  if (aliases.some((alias): alias is undefined => alias === undefined))
    return rejected('INVALID_TEXT');
  const externalInput = input.externalIdentifiers === undefined ? [] : input.externalIdentifiers;
  if (!Array.isArray(externalInput) || externalInput.length > 64) return rejected('INVALID_TEXT');
  const externalIdentifiers: ExternalIdentifierV1[] = [];
  for (const candidate of externalInput) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
      return rejected('INVALID_TEXT');
    const record = candidate as Record<string, unknown>;
    const namespace = text(record['namespace'], 64);
    const value = text(record['value'], 255);
    if (!namespace || !value) return rejected('INVALID_TEXT');
    externalIdentifiers.push(Object.freeze({ namespace, value }));
  }
  const externalKeys = externalIdentifiers.map((item) => `${item.namespace}:${item.value}`);
  if (new Set(externalKeys).size !== externalKeys.length) return rejected('DUPLICATE_VALUE');
  const status = input.status ?? 'ACTIVE';
  const visibility = input.visibility ?? 'WORKSPACE';
  if (!['ACTIVE', 'INACTIVE', 'MERGED'].includes(status as string))
    return rejected('INVALID_STATE');
  if (!['WORKSPACE', 'PROJECT'].includes(visibility as string)) return rejected('INVALID_STATE');
  return accepted(
    Object.freeze({
      schemaVersion: REFERENCE_ENTITY_SCHEMA_VERSION_V1,
      entityId,
      versionId,
      tenantScope,
      entityType: 'BUSINESS_PARTY' as const,
      displayName,
      roles: Object.freeze(roles),
      aliases: Object.freeze(aliases as string[]),
      externalIdentifiers: Object.freeze(externalIdentifiers),
      status: status as BusinessPartyStatusV1,
      visibility: visibility as BusinessPartyVisibilityV1,
      canonicalHash,
      createdAt,
    }),
  );
}

export function mergeBusinessPartyVersionsV1(input: {
  readonly source: BusinessPartyVersionV1;
  readonly target: BusinessPartyVersionV1;
  readonly resolutionId: unknown;
  readonly actorId: unknown;
  readonly reason: unknown;
  readonly evidenceId: unknown;
  readonly resolvedAt: unknown;
}): ReferenceEntityResultV1<BusinessPartyResolutionV1> {
  const resolutionId = identifier(input.resolutionId);
  const actorId = identifier(input.actorId);
  const evidenceId = identifier(input.evidenceId);
  const reason = text(input.reason, 512);
  const resolvedAt = timestamp(input.resolvedAt);
  if (!resolutionId || !actorId || !evidenceId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScopesEqualV1(input.source.tenantScope, input.target.tenantScope))
    return rejected('CROSS_SCOPE');
  if (input.source.entityId === input.target.entityId) return rejected('SAME_ENTITY');
  if (!reason || !resolvedAt) return rejected(reason ? 'INVALID_TIMESTAMP' : 'INVALID_TEXT');
  return accepted(
    Object.freeze({
      schemaVersion: REFERENCE_ENTITY_SCHEMA_VERSION_V1,
      resolutionId,
      resolutionType: 'MERGE' as const,
      sourceEntityId: input.source.entityId,
      targetEntityId: input.target.entityId,
      actorId,
      reason,
      evidenceId,
      resolvedAt,
    }),
  );
}

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '../tenant-scope/v1.js';
import { isPermissionV1, type PermissionV1 } from '../permissions/v1.js';

/** IAM-013: organization-owned, non-interactive, action-scoped service identities. */
export const SERVICE_ACCOUNT_SCHEMA_VERSION_V1 = 1 as const;
export const SERVICE_ACCOUNT_MAX_PERMISSION_COUNT_V1 = 64 as const;
export const SERVICE_ACCOUNT_MAX_LIFETIME_SECONDS_V1 = 365 * 24 * 60 * 60;

export type ServiceAccountStatusV1 = 'ACTIVE' | 'REVOKED';

export interface ServiceAccountV1 {
  readonly schemaVersion: typeof SERVICE_ACCOUNT_SCHEMA_VERSION_V1;
  readonly id: StableIdentifierV1;
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId?: StableIdentifierV1;
  readonly name: string;
  readonly permissions: readonly PermissionV1[];
  readonly status: ServiceAccountStatusV1;
  readonly secretDigest: string;
  readonly secretVersion: number;
  readonly secretIssuedAt: StrictUtcTimestampV1;
  readonly secretExpiresAt?: StrictUtcTimestampV1;
  readonly lastUsedAt?: StrictUtcTimestampV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly revokedAt?: StrictUtcTimestampV1;
  readonly revision: number;
}

export type ServiceAccountErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_TEXT'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_LIFETIME'
  | 'INVALID_PERMISSION'
  | 'INVALID_DIGEST'
  | 'INVALID_REVISION'
  | 'INVALID_STATE'
  | 'SECRET_REVOKED'
  | 'SECRET_EXPIRED'
  | 'REVISION_CONFLICT';

export type ServiceAccountResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ServiceAccountErrorCodeV1 };

function accepted<TValue>(value: TValue): ServiceAccountResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: ServiceAccountErrorCodeV1): ServiceAccountResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stableId(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function boundedText(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function digest(input: unknown): string | undefined {
  return typeof input === 'string' && /^[a-f0-9]{64}$/u.test(input) ? input : undefined;
}

function positiveInteger(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

function lifetimeWithin(
  issuedAt: StrictUtcTimestampV1,
  expiresAt: StrictUtcTimestampV1,
): boolean {
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  return (
    Number.isFinite(issued) &&
    Number.isFinite(expires) &&
    expires > issued &&
    expires - issued <= SERVICE_ACCOUNT_MAX_LIFETIME_SECONDS_V1 * 1_000
  );
}

function permissions(input: unknown): readonly PermissionV1[] | undefined {
  if (!Array.isArray(input) || input.length === 0 || input.length > SERVICE_ACCOUNT_MAX_PERMISSION_COUNT_V1)
    return undefined;
  const values = input.filter((permission): permission is PermissionV1 => isPermissionV1(permission));
  if (values.length !== input.length) return undefined;
  return Object.freeze([...new Set(values)]);
}

function validSecretWindow(
  issuedAt: StrictUtcTimestampV1,
  expiresAt: StrictUtcTimestampV1 | undefined,
): boolean {
  return expiresAt === undefined || lifetimeWithin(issuedAt, expiresAt);
}

/** Create a service account record from a keyed digest; raw credentials never enter this value. */
export function createServiceAccountV1(input: {
  readonly id: unknown;
  readonly organizationId: unknown;
  readonly workspaceId?: unknown;
  readonly name: unknown;
  readonly permissions: unknown;
  readonly secretDigest: unknown;
  readonly secretIssuedAt: unknown;
  readonly secretExpiresAt?: unknown;
  readonly createdAt: unknown;
}): ServiceAccountResultV1<ServiceAccountV1> {
  const id = stableId(input.id);
  const organizationId = stableId(input.organizationId);
  const workspaceId = input.workspaceId === undefined ? undefined : stableId(input.workspaceId);
  const name = boundedText(input.name, 200);
  const permissionValues = permissions(input.permissions);
  const secretDigest = digest(input.secretDigest);
  const secretIssuedAt = timestamp(input.secretIssuedAt);
  const secretExpiresAt =
    input.secretExpiresAt === undefined ? undefined : timestamp(input.secretExpiresAt);
  const createdAt = timestamp(input.createdAt);
  if (!id || !organizationId || (input.workspaceId !== undefined && !workspaceId))
    return rejected('INVALID_IDENTIFIER');
  if (!name) return rejected('INVALID_TEXT');
  if (!permissionValues) return rejected('INVALID_PERMISSION');
  if (!secretDigest) return rejected('INVALID_DIGEST');
  if (!secretIssuedAt || !createdAt) return rejected('INVALID_TIMESTAMP');
  if (input.secretExpiresAt !== undefined && !secretExpiresAt)
    return rejected('INVALID_TIMESTAMP');
  if (!validSecretWindow(secretIssuedAt, secretExpiresAt)) return rejected('INVALID_LIFETIME');
  return accepted(
    Object.freeze({
      schemaVersion: SERVICE_ACCOUNT_SCHEMA_VERSION_V1,
      id,
      organizationId,
      ...(workspaceId === undefined ? {} : { workspaceId }),
      name,
      permissions: permissionValues,
      status: 'ACTIVE' as const,
      secretDigest,
      secretVersion: 1,
      secretIssuedAt,
      ...(secretExpiresAt === undefined ? {} : { secretExpiresAt }),
      createdAt,
      revision: 1,
    }),
  );
}

/** Rotate the stored digest atomically; the old secret must be rejected after this successor version. */
export function rotateServiceAccountSecretV1(
  current: ServiceAccountV1,
  input: {
    readonly secretDigest: unknown;
    readonly issuedAt: unknown;
    readonly expiresAt?: unknown;
    readonly expectedRevision: unknown;
  },
): ServiceAccountResultV1<ServiceAccountV1> {
  const secretDigest = digest(input.secretDigest);
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = input.expiresAt === undefined ? undefined : timestamp(input.expiresAt);
  const expectedRevision = positiveInteger(input.expectedRevision);
  if (!secretDigest) return rejected('INVALID_DIGEST');
  if (!issuedAt || (input.expiresAt !== undefined && !expiresAt)) return rejected('INVALID_TIMESTAMP');
  if (!expectedRevision || expectedRevision !== current.revision) return rejected('REVISION_CONFLICT');
  if (current.status !== 'ACTIVE') return rejected('SECRET_REVOKED');
  if (!validSecretWindow(issuedAt, expiresAt)) return rejected('INVALID_LIFETIME');
  if (Date.parse(issuedAt) < Date.parse(current.secretIssuedAt)) return rejected('INVALID_TIMESTAMP');
  if (expiresAt === undefined) {
    const { secretExpiresAt: _previousExpiry, ...withoutExpiry } = current;
    return accepted(
      Object.freeze({
        ...withoutExpiry,
        secretDigest,
        secretVersion: current.secretVersion + 1,
        secretIssuedAt: issuedAt,
        revision: current.revision + 1,
      }),
    );
  }
  return accepted(
    Object.freeze({
      ...current,
      secretDigest,
      secretVersion: current.secretVersion + 1,
      secretIssuedAt: issuedAt,
      secretExpiresAt: expiresAt,
      revision: current.revision + 1,
    }),
  );
}

/** Mark use without changing permissions or secret material; timestamps may only move forward. */
export function markServiceAccountUsedV1(
  current: ServiceAccountV1,
  usedAtInput: unknown,
): ServiceAccountResultV1<ServiceAccountV1> {
  const usedAt = timestamp(usedAtInput);
  if (!usedAt) return rejected('INVALID_TIMESTAMP');
  if (current.status !== 'ACTIVE') return rejected('SECRET_REVOKED');
  if (current.secretExpiresAt && Date.parse(usedAt) >= Date.parse(current.secretExpiresAt))
    return rejected('SECRET_EXPIRED');
  if (Date.parse(usedAt) < Date.parse(current.secretIssuedAt)) return rejected('INVALID_TIMESTAMP');
  if (current.lastUsedAt && Date.parse(usedAt) < Date.parse(current.lastUsedAt))
    return rejected('INVALID_TIMESTAMP');
  return accepted(
    Object.freeze({
      ...current,
      lastUsedAt: usedAt,
      revision: current.revision + 1,
    }),
  );
}

/** Revocation is permanent; callers must create a new account instead of reactivating this identity. */
export function revokeServiceAccountV1(
  current: ServiceAccountV1,
  revokedAtInput: unknown,
  expectedRevisionInput: unknown,
): ServiceAccountResultV1<ServiceAccountV1> {
  const revokedAt = timestamp(revokedAtInput);
  const expectedRevision = positiveInteger(expectedRevisionInput);
  if (!revokedAt) return rejected('INVALID_TIMESTAMP');
  if (!expectedRevision || expectedRevision !== current.revision) return rejected('REVISION_CONFLICT');
  if (current.status !== 'ACTIVE') return rejected('SECRET_REVOKED');
  if (Date.parse(revokedAt) < Date.parse(current.createdAt)) return rejected('INVALID_TIMESTAMP');
  return accepted(
    Object.freeze({
      ...current,
      status: 'REVOKED' as const,
      revokedAt,
      revision: current.revision + 1,
    }),
  );
}

export function isServiceAccountSecretUsableV1(
  account: ServiceAccountV1,
  nowInput: unknown,
): ServiceAccountResultV1<true> {
  const now = timestamp(nowInput);
  if (!now) return rejected('INVALID_TIMESTAMP');
  if (account.status !== 'ACTIVE') return rejected('SECRET_REVOKED');
  if (account.secretExpiresAt && Date.parse(now) >= Date.parse(account.secretExpiresAt))
    return rejected('SECRET_EXPIRED');
  return Object.freeze({ accepted: true, value: true });
}

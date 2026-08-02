import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** IAM-020..IAM-021 and DSO-002..DSO-005: signed device authority and opaque grants. */
export const DEVICE_AUTHORIZATION_SCHEMA_VERSION_V1 = 1 as const;
export const DEVICE_AUTHORIZATION_MAX_SECONDS_V1 = 24 * 60 * 60;

export type DeviceDataModeV1 = 'Local' | 'Hybrid' | 'Cloud';
export type DeviceAuthorizationEffectV1 = 'READ' | 'WRITE_DERIVATIVE' | 'WATCH';

export interface AuthorizationSnapshotV1 {
  readonly schemaVersion: typeof DEVICE_AUTHORIZATION_SCHEMA_VERSION_V1;
  readonly snapshotId: StableIdentifierV1;
  readonly deviceId: StableIdentifierV1;
  readonly userId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly authorizationEpoch: number;
  readonly revision: number;
  readonly permissions: readonly string[];
  readonly dataMode: DeviceDataModeV1;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly payload: string;
  readonly signature: string;
}

export interface OpaqueDeviceGrantV1 {
  readonly schemaVersion: typeof DEVICE_AUTHORIZATION_SCHEMA_VERSION_V1;
  readonly grantId: StableIdentifierV1;
  readonly deviceId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly bindingId: StableIdentifierV1;
  readonly capabilityDigest: string;
  readonly effects: readonly ('READ' | 'WRITE_DERIVATIVE' | 'WATCH')[];
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  readonly revision: number;
}

export interface SnapshotSignerV1 {
  sign(payload: string): string;
  verify(payload: string, signature: string): boolean;
}

export type DeviceAuthorizationErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_EPOCH'
  | 'INVALID_REVISION'
  | 'INVALID_PERMISSION'
  | 'INVALID_MODE'
  | 'INVALID_TEXT'
  | 'INVALID_EFFECT'
  | 'INVALID_LIFETIME'
  | 'SIGNATURE_INVALID'
  | 'SNAPSHOT_STALE'
  | 'GRANT_REVOKED'
  | 'GRANT_EXPIRED'
  | 'GRANT_SCOPE_DENIED'
  | 'EFFECT_DENIED';

export type DeviceAuthorizationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DeviceAuthorizationErrorCodeV1 };

function rejected(code: DeviceAuthorizationErrorCodeV1): DeviceAuthorizationResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stableId(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function scope(input: unknown): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function positiveInteger(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function sameScope(left: TenantScopeV1, right: TenantScopeV1): boolean {
  if (left.scopeType !== right.scopeType || left.organizationId !== right.organizationId)
    return false;
  if (left.scopeType === 'organization' || right.scopeType === 'organization')
    return left.scopeType === right.scopeType;
  if (left.workspaceId !== right.workspaceId) return false;
  if (left.scopeType === 'workspace' || right.scopeType === 'workspace')
    return left.scopeType === right.scopeType;
  return (
    left.scopeType === 'project' &&
    right.scopeType === 'project' &&
    left.projectId === right.projectId
  );
}

function lifetimeWithin(issuedAt: StrictUtcTimestampV1, expiresAt: StrictUtcTimestampV1): boolean {
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  return (
    Number.isFinite(issued) &&
    Number.isFinite(expires) &&
    expires > issued &&
    expires - issued <= DEVICE_AUTHORIZATION_MAX_SECONDS_V1 * 1_000
  );
}

function canonicalSnapshot(input: Omit<AuthorizationSnapshotV1, 'payload' | 'signature'>): string {
  return JSON.stringify({
    schemaVersion: input.schemaVersion,
    snapshotId: input.snapshotId,
    deviceId: input.deviceId,
    userId: input.userId,
    tenantScope: input.tenantScope,
    authorizationEpoch: input.authorizationEpoch,
    revision: input.revision,
    permissions: input.permissions,
    dataMode: input.dataMode,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
}

export function createAuthorizationSnapshotV1(
  input: {
    readonly snapshotId: unknown;
    readonly deviceId: unknown;
    readonly userId: unknown;
    readonly tenantScope: unknown;
    readonly authorizationEpoch: unknown;
    readonly revision: unknown;
    readonly permissions: unknown;
    readonly dataMode: unknown;
    readonly issuedAt: unknown;
    readonly expiresAt: unknown;
  },
  signer: SnapshotSignerV1,
): DeviceAuthorizationResultV1<AuthorizationSnapshotV1> {
  const snapshotId = stableId(input.snapshotId);
  const deviceId = stableId(input.deviceId);
  const userId = stableId(input.userId);
  const tenantScope = scope(input.tenantScope);
  const authorizationEpoch = positiveInteger(input.authorizationEpoch);
  const revision = positiveInteger(input.revision);
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = timestamp(input.expiresAt);
  if (!snapshotId || !deviceId || !userId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!authorizationEpoch) return rejected('INVALID_EPOCH');
  if (!revision) return rejected('INVALID_REVISION');
  if (!issuedAt || !expiresAt) return rejected('INVALID_TIMESTAMP');
  if (!lifetimeWithin(issuedAt, expiresAt)) return rejected('INVALID_LIFETIME');
  if (input.dataMode !== 'Local' && input.dataMode !== 'Hybrid' && input.dataMode !== 'Cloud')
    return rejected('INVALID_MODE');
  if (
    !Array.isArray(input.permissions) ||
    input.permissions.length > 128 ||
    input.permissions.some(
      (permission) =>
        typeof permission !== 'string' ||
        !/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/u.test(permission) ||
        permission === '*',
    )
  )
    return rejected('INVALID_PERMISSION');
  const unsigned: Omit<AuthorizationSnapshotV1, 'payload' | 'signature'> = {
    schemaVersion: DEVICE_AUTHORIZATION_SCHEMA_VERSION_V1,
    snapshotId,
    deviceId,
    userId,
    tenantScope,
    authorizationEpoch,
    revision,
    permissions: Object.freeze([...new Set(input.permissions as string[])]),
    dataMode: input.dataMode,
    issuedAt,
    expiresAt,
  };
  const payload = canonicalSnapshot(unsigned);
  const signature = text(signer.sign(payload), 2048);
  if (!signature) return rejected('SIGNATURE_INVALID');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({ ...unsigned, payload, signature }),
  });
}

export function verifyAuthorizationSnapshotV1(
  snapshot: AuthorizationSnapshotV1,
  input: {
    readonly now: unknown;
    readonly deviceId: unknown;
    readonly tenantScope: unknown;
    readonly authorizationEpoch: unknown;
    readonly minimumRevision: unknown;
  },
  signer: SnapshotSignerV1,
): DeviceAuthorizationResultV1<true> {
  const now = timestamp(input.now);
  const deviceId = stableId(input.deviceId);
  const tenantScope = scope(input.tenantScope);
  const authorizationEpoch = positiveInteger(input.authorizationEpoch);
  const minimumRevision = positiveInteger(input.minimumRevision);
  if (!now) return rejected('INVALID_TIMESTAMP');
  if (!deviceId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!authorizationEpoch || !minimumRevision) return rejected('INVALID_REVISION');
  if (
    snapshot.deviceId !== deviceId ||
    !sameScope(snapshot.tenantScope, tenantScope) ||
    snapshot.authorizationEpoch !== authorizationEpoch ||
    snapshot.revision < minimumRevision
  )
    return rejected('SNAPSHOT_STALE');
  if (
    Date.parse(now) < Date.parse(snapshot.issuedAt) ||
    Date.parse(now) >= Date.parse(snapshot.expiresAt)
  )
    return rejected('SNAPSHOT_STALE');
  const { payload, signature, ...unsigned } = snapshot;
  if (canonicalSnapshot(unsigned) !== payload || !signer.verify(payload, signature))
    return rejected('SIGNATURE_INVALID');
  return Object.freeze({ accepted: true, value: true });
}

export function createOpaqueDeviceGrantV1(input: {
  readonly grantId: unknown;
  readonly deviceId: unknown;
  readonly tenantScope: unknown;
  readonly bindingId: unknown;
  readonly capabilityDigest: unknown;
  readonly effects: unknown;
  readonly issuedAt: unknown;
  readonly expiresAt: unknown;
}): DeviceAuthorizationResultV1<OpaqueDeviceGrantV1> {
  const grantId = stableId(input.grantId);
  const deviceId = stableId(input.deviceId);
  const tenantScope = scope(input.tenantScope);
  const bindingId = stableId(input.bindingId);
  const capabilityDigest = text(input.capabilityDigest, 512);
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = timestamp(input.expiresAt);
  if (!grantId || !deviceId || !bindingId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!capabilityDigest) return rejected('INVALID_TEXT');
  if (!issuedAt || !expiresAt) return rejected('INVALID_TIMESTAMP');
  if (!lifetimeWithin(issuedAt, expiresAt)) return rejected('INVALID_LIFETIME');
  if (
    !Array.isArray(input.effects) ||
    input.effects.length === 0 ||
    input.effects.some(
      (effect) => effect !== 'READ' && effect !== 'WRITE_DERIVATIVE' && effect !== 'WATCH',
    )
  )
    return rejected('INVALID_EFFECT');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: DEVICE_AUTHORIZATION_SCHEMA_VERSION_V1,
      grantId,
      deviceId,
      tenantScope,
      bindingId,
      capabilityDigest,
      effects: Object.freeze([...new Set(input.effects as OpaqueDeviceGrantV1['effects'])]),
      issuedAt,
      expiresAt,
      status: 'ACTIVE' as const,
      revision: 1,
    }),
  });
}

export function checkOpaqueDeviceGrantV1(
  grant: OpaqueDeviceGrantV1,
  input: { readonly now: unknown; readonly deviceId: unknown; readonly tenantScope: unknown },
): DeviceAuthorizationResultV1<true> {
  const now = timestamp(input.now);
  const deviceId = stableId(input.deviceId);
  const tenantScope = scope(input.tenantScope);
  if (!now) return rejected('INVALID_TIMESTAMP');
  if (!deviceId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (grant.status === 'REVOKED') return rejected('GRANT_REVOKED');
  if (grant.status === 'EXPIRED' || Date.parse(now) >= Date.parse(grant.expiresAt))
    return rejected('GRANT_EXPIRED');
  if (grant.deviceId !== deviceId || !sameScope(grant.tenantScope, tenantScope))
    return rejected('SNAPSHOT_STALE');
  return Object.freeze({ accepted: true, value: true });
}

export function checkOpaqueDeviceGrantEffectV1(
  grant: OpaqueDeviceGrantV1,
  effect: unknown,
): DeviceAuthorizationResultV1<true> {
  if (effect !== 'READ' && effect !== 'WRITE_DERIVATIVE' && effect !== 'WATCH')
    return rejected('INVALID_EFFECT');
  return grant.effects.includes(effect)
    ? Object.freeze({ accepted: true, value: true })
    : rejected('EFFECT_DENIED');
}

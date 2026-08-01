import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.ts';

/** IAM-001..IAM-021: pure identity, membership, session, and device invariants. */
export const IDENTITY_SCHEMA_VERSION_V1 = 1 as const;
export const DEFAULT_LOCALE_V1 = 'vi-VN' as const;
export const ACCESS_TOKEN_MAX_SECONDS_V1 = 15 * 60;
export const STEP_UP_MAX_SECONDS_V1 = 10 * 60;
export const OFFLINE_AUTHORIZATION_MAX_SECONDS_V1 = 24 * 60 * 60;
export const INVITATION_MAX_SECONDS_V1 = 7 * 24 * 60 * 60;

export type LocaleV1 = 'vi-VN' | 'en';
export type UserStatusV1 = 'ACTIVE' | 'LOCKED' | 'SUSPENDED' | 'DEACTIVATED';
export type MembershipStatusV1 = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
export type PrincipalTypeV1 = 'USER' | 'SERVICE_ACCOUNT';
export type InitialRoleIdForIdentityV1 =
  | 'owner'
  | 'admin'
  | 'analyst'
  | 'operator'
  | 'approver'
  | 'viewer';
export type DevicePlatformV1 = 'WINDOWS' | 'ANDROID';
export type DeviceStatusV1 = 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface UserIdentityV1 {
  readonly schemaVersion: typeof IDENTITY_SCHEMA_VERSION_V1;
  readonly id: StableIdentifierV1;
  readonly status: UserStatusV1;
  readonly displayName: string;
  readonly locale: LocaleV1;
  readonly securityEpoch: number;
  readonly createdAt: StrictUtcTimestampV1;
}

export interface OrganizationIdentityV1 {
  readonly schemaVersion: typeof IDENTITY_SCHEMA_VERSION_V1;
  readonly id: StableIdentifierV1;
  readonly name: string;
  readonly personal: boolean;
  readonly status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  readonly createdAt: StrictUtcTimestampV1;
}

export interface WorkspaceIdentityV1 {
  readonly schemaVersion: typeof IDENTITY_SCHEMA_VERSION_V1;
  readonly id: StableIdentifierV1;
  readonly organizationId: StableIdentifierV1;
  readonly name: string;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly authorizationEpoch: number;
  readonly createdAt: StrictUtcTimestampV1;
}

export interface ProjectIdentityV1 {
  readonly schemaVersion: typeof IDENTITY_SCHEMA_VERSION_V1;
  readonly id: StableIdentifierV1;
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly kind: 'INTERNAL' | 'CLIENT' | 'LOCATION' | 'ENGAGEMENT';
  readonly name: string;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly createdAt: StrictUtcTimestampV1;
}

export interface MembershipIdentityV1 {
  readonly schemaVersion: typeof IDENTITY_SCHEMA_VERSION_V1;
  readonly id: StableIdentifierV1;
  readonly principalType: PrincipalTypeV1;
  readonly principalId: StableIdentifierV1;
  readonly scope: TenantScopeV1;
  readonly roleId: InitialRoleIdForIdentityV1;
  readonly status: MembershipStatusV1;
  readonly startsAt?: StrictUtcTimestampV1;
  readonly expiresAt?: StrictUtcTimestampV1;
  readonly revision: number;
}

export interface PersonalOrganizationBootstrapV1 {
  readonly user: UserIdentityV1;
  readonly organization: OrganizationIdentityV1;
  readonly workspace: WorkspaceIdentityV1;
  readonly project: ProjectIdentityV1;
  readonly membership: MembershipIdentityV1;
}

export interface SessionRecordV1 {
  readonly schemaVersion: typeof IDENTITY_SCHEMA_VERSION_V1;
  readonly sessionId: StableIdentifierV1;
  readonly userId: StableIdentifierV1;
  readonly familyId: StableIdentifierV1;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly accessExpiresAt: StrictUtcTimestampV1;
  readonly inactivityExpiresAt: StrictUtcTimestampV1;
  readonly absoluteExpiresAt: StrictUtcTimestampV1;
  readonly status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}

export interface RefreshRotationResultV1 {
  readonly accepted: boolean;
  readonly code: 'ROTATED' | 'REUSE_DETECTED' | 'REVOKED_FAMILY' | 'EXPIRED';
  readonly familyStatus: 'ACTIVE' | 'REVOKED';
  readonly nextTokenId?: StableIdentifierV1;
}

export interface DeviceIdentityV1 {
  readonly schemaVersion: typeof IDENTITY_SCHEMA_VERSION_V1;
  readonly id: StableIdentifierV1;
  readonly userId: StableIdentifierV1;
  readonly organizationId: StableIdentifierV1;
  readonly platform: DevicePlatformV1;
  readonly publicKey: string;
  readonly keyAlgorithm: 'ED25519';
  readonly status: DeviceStatusV1;
  readonly securityEpoch: number;
  readonly enrolledAt: StrictUtcTimestampV1;
  readonly activatedAt?: StrictUtcTimestampV1;
  readonly revokedAt?: StrictUtcTimestampV1;
  readonly revision: number;
}

export interface StepUpAssertionV1 {
  readonly assertionId: StableIdentifierV1;
  readonly principalId: StableIdentifierV1;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly method: 'TOTP' | 'WEBAUTHN';
}

export type IdentityErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TEXT'
  | 'INVALID_LOCALE'
  | 'INVALID_EPOCH'
  | 'INVALID_SCOPE'
  | 'INVALID_LIFETIME'
  | 'INVALID_ROLE'
  | 'INVALID_STATE';

export type IdentityResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: IdentityErrorCodeV1 };

function accepted<TValue>(value: TValue): IdentityResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: IdentityErrorCodeV1): IdentityResultV1<never> {
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
  if (containsControlCharacterV1(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function containsControlCharacterV1(input: string): boolean {
  for (const character of input) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

function positiveEpoch(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

function isLocale(input: unknown): input is LocaleV1 {
  return input === 'vi-VN' || input === 'en';
}

function isRole(input: unknown): input is InitialRoleIdForIdentityV1 {
  return (
    input === 'owner' ||
    input === 'admin' ||
    input === 'analyst' ||
    input === 'operator' ||
    input === 'approver' ||
    input === 'viewer'
  );
}

function durationWithin(
  start: StrictUtcTimestampV1,
  end: StrictUtcTimestampV1,
  maxSeconds: number,
): boolean {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return (
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    endMs > startMs &&
    endMs - startMs <= maxSeconds * 1_000
  );
}

export function normalizeEmailAddressV1(input: unknown): IdentityResultV1<string> {
  if (
    typeof input !== 'string' ||
    input.length > 254 ||
    /\s/u.test(input) ||
    containsControlCharacterV1(input)
  )
    return rejected('INVALID_TEXT');
  const normalized = input.normalize('NFC').toLowerCase();
  const at = normalized.indexOf('@');
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (
    at <= 0 ||
    at !== normalized.lastIndexOf('@') ||
    !/^[^@.][^@]*$/u.test(local) ||
    local.length > 64 ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(domain) ||
    domain.includes('..')
  )
    return rejected('INVALID_TEXT');
  return accepted(normalized);
}

export function createUserIdentityV1(input: {
  readonly id: unknown;
  readonly displayName: unknown;
  readonly locale?: unknown;
  readonly securityEpoch?: unknown;
  readonly createdAt: unknown;
  readonly status?: unknown;
}): IdentityResultV1<UserIdentityV1> {
  const id = stableId(input.id);
  const displayName = boundedText(input.displayName, 200);
  const createdAt = timestamp(input.createdAt);
  const locale = input.locale ?? DEFAULT_LOCALE_V1;
  const securityEpoch = input.securityEpoch === undefined ? 1 : positiveEpoch(input.securityEpoch);
  const status = input.status ?? 'ACTIVE';
  if (!id) return rejected('INVALID_IDENTIFIER');
  if (!displayName) return rejected('INVALID_TEXT');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (!isLocale(locale)) return rejected('INVALID_LOCALE');
  if (!securityEpoch) return rejected('INVALID_EPOCH');
  if (
    status !== 'ACTIVE' &&
    status !== 'LOCKED' &&
    status !== 'SUSPENDED' &&
    status !== 'DEACTIVATED'
  )
    return rejected('INVALID_STATE');
  return accepted(
    Object.freeze({ schemaVersion: 1, id, status, displayName, locale, securityEpoch, createdAt }),
  );
}

export function bootstrapPersonalOrganizationV1(input: {
  readonly user: Parameters<typeof createUserIdentityV1>[0];
  readonly organizationId: unknown;
  readonly workspaceId: unknown;
  readonly projectId: unknown;
  readonly membershipId: unknown;
  readonly createdAt: unknown;
}): IdentityResultV1<PersonalOrganizationBootstrapV1> {
  const user = createUserIdentityV1(input.user);
  const organizationId = stableId(input.organizationId);
  const workspaceId = stableId(input.workspaceId);
  const projectId = stableId(input.projectId);
  const membershipId = stableId(input.membershipId);
  const createdAt = timestamp(input.createdAt);
  if (!user.accepted) return user;
  if (!organizationId || !workspaceId || !projectId || !membershipId)
    return rejected('INVALID_IDENTIFIER');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  const organization = Object.freeze({
    schemaVersion: 1 as const,
    id: organizationId,
    name: `${user.value.displayName}'s DataBreeze`,
    personal: true,
    status: 'ACTIVE' as const,
    createdAt,
  });
  const workspace = Object.freeze({
    schemaVersion: 1 as const,
    id: workspaceId,
    organizationId,
    name: 'Personal workspace',
    status: 'ACTIVE' as const,
    authorizationEpoch: 1,
    createdAt,
  });
  const project = Object.freeze({
    schemaVersion: 1 as const,
    id: projectId,
    organizationId,
    workspaceId,
    kind: 'INTERNAL' as const,
    name: 'Personal project',
    status: 'ACTIVE' as const,
    createdAt,
  });
  const membership = Object.freeze({
    schemaVersion: 1 as const,
    id: membershipId,
    principalType: 'USER' as const,
    principalId: user.value.id,
    scope: Object.freeze({ scopeType: 'organization' as const, organizationId }),
    roleId: 'owner' as const,
    status: 'ACTIVE' as const,
    revision: 1,
  });
  return accepted(
    Object.freeze({ user: user.value, organization, workspace, project, membership }),
  );
}

export function validateMembershipV1(input: unknown): IdentityResultV1<MembershipIdentityV1> {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return rejected('INVALID_STATE');
  const record = input as Record<string, unknown>;
  const id = stableId(record['id']);
  const principalId = stableId(record['principalId']);
  const scope = parseTenantScopeV1(record['scope']);
  const revision = positiveEpoch(record['revision']);
  if (!id || !principalId || !scope.accepted || !revision)
    return rejected(!scope.accepted ? 'INVALID_SCOPE' : 'INVALID_IDENTIFIER');
  if (record['principalType'] !== 'USER' && record['principalType'] !== 'SERVICE_ACCOUNT')
    return rejected('INVALID_STATE');
  if (!isRole(record['roleId'])) return rejected('INVALID_ROLE');
  const status = record['status'];
  if (status !== 'INVITED' && status !== 'ACTIVE' && status !== 'SUSPENDED' && status !== 'REMOVED')
    return rejected('INVALID_STATE');
  const startsAt = record['startsAt'] === undefined ? undefined : timestamp(record['startsAt']);
  const expiresAt = record['expiresAt'] === undefined ? undefined : timestamp(record['expiresAt']);
  if (
    (record['startsAt'] !== undefined && !startsAt) ||
    (record['expiresAt'] !== undefined && !expiresAt)
  )
    return rejected('INVALID_TIMESTAMP');
  if (startsAt && expiresAt && !durationWithin(startsAt, expiresAt, INVITATION_MAX_SECONDS_V1))
    return rejected('INVALID_LIFETIME');
  return accepted(
    Object.freeze({
      schemaVersion: 1,
      id,
      principalType: record['principalType'],
      principalId,
      scope: scope.value,
      roleId: record['roleId'],
      status,
      ...(startsAt ? { startsAt } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      revision,
    }),
  );
}

export function checkOwnerRemovalV1(
  memberships: readonly MembershipIdentityV1[],
  targetId: StableIdentifierV1,
): 'ALLOWED' | 'LAST_OWNER' | 'NOT_ACTIVE' | 'NOT_FOUND' {
  const target = memberships.find((membership) => membership.id === targetId);
  if (!target) return 'NOT_FOUND';
  if (target.status !== 'ACTIVE') return 'NOT_ACTIVE';
  if (target.roleId !== 'owner') return 'ALLOWED';
  return memberships.filter(
    (membership) => membership.status === 'ACTIVE' && membership.roleId === 'owner',
  ).length <= 1
    ? 'LAST_OWNER'
    : 'ALLOWED';
}

export function createSessionRecordV1(input: {
  readonly sessionId: unknown;
  readonly userId: unknown;
  readonly familyId: unknown;
  readonly issuedAt: unknown;
  readonly accessExpiresAt: unknown;
  readonly inactivityExpiresAt: unknown;
  readonly absoluteExpiresAt: unknown;
}): IdentityResultV1<SessionRecordV1> {
  const ids = [stableId(input.sessionId), stableId(input.userId), stableId(input.familyId)];
  const times = [
    timestamp(input.issuedAt),
    timestamp(input.accessExpiresAt),
    timestamp(input.inactivityExpiresAt),
    timestamp(input.absoluteExpiresAt),
  ];
  if (ids.some((value) => !value)) return rejected('INVALID_IDENTIFIER');
  if (times.some((value) => !value)) return rejected('INVALID_TIMESTAMP');
  const issuedAt = times[0] as StrictUtcTimestampV1;
  const accessExpiresAt = times[1] as StrictUtcTimestampV1;
  const inactivityExpiresAt = times[2] as StrictUtcTimestampV1;
  const absoluteExpiresAt = times[3] as StrictUtcTimestampV1;
  if (
    !durationWithin(issuedAt, accessExpiresAt, ACCESS_TOKEN_MAX_SECONDS_V1) ||
    Date.parse(inactivityExpiresAt) <= Date.parse(issuedAt) ||
    Date.parse(inactivityExpiresAt) > Date.parse(absoluteExpiresAt) ||
    !durationWithin(issuedAt, absoluteExpiresAt, 30 * 24 * 60 * 60)
  )
    return rejected('INVALID_LIFETIME');
  return accepted(
    Object.freeze({
      schemaVersion: 1,
      sessionId: ids[0] as StableIdentifierV1,
      userId: ids[1] as StableIdentifierV1,
      familyId: ids[2] as StableIdentifierV1,
      issuedAt,
      accessExpiresAt,
      inactivityExpiresAt,
      absoluteExpiresAt,
      status: 'ACTIVE' as const,
    }),
  );
}

export function rotateRefreshFamilyV1(input: {
  readonly now: unknown;
  readonly presentedTokenId: StableIdentifierV1;
  readonly activeTokenId: StableIdentifierV1;
  readonly nextTokenId: StableIdentifierV1;
  readonly familyStatus: 'ACTIVE' | 'REVOKED';
  readonly tokenExpiresAt: StrictUtcTimestampV1;
}): RefreshRotationResultV1 {
  const now = timestamp(input.now);
  const tokenExpiresAt = timestamp(input.tokenExpiresAt);
  if (!now || input.familyStatus === 'REVOKED')
    return Object.freeze({ accepted: false, code: 'REVOKED_FAMILY', familyStatus: 'REVOKED' });
  if (!tokenExpiresAt || Date.parse(now) >= Date.parse(tokenExpiresAt))
    return Object.freeze({ accepted: false, code: 'EXPIRED', familyStatus: 'ACTIVE' });
  if (input.presentedTokenId !== input.activeTokenId)
    return Object.freeze({ accepted: false, code: 'REUSE_DETECTED', familyStatus: 'REVOKED' });
  return Object.freeze({
    accepted: true,
    code: 'ROTATED',
    familyStatus: 'ACTIVE',
    nextTokenId: input.nextTokenId,
  });
}

export function transitionDeviceIdentityV1(
  device: DeviceIdentityV1,
  transition: 'ACTIVATE' | 'REVOKE',
  at: unknown,
): IdentityResultV1<DeviceIdentityV1> {
  const timestampValue = timestamp(at);
  if (!timestampValue) return rejected('INVALID_TIMESTAMP');
  if (transition === 'ACTIVATE' && device.status !== 'PENDING') return rejected('INVALID_STATE');
  if (transition === 'REVOKE' && device.status === 'REVOKED') return rejected('INVALID_STATE');
  if (transition === 'ACTIVATE')
    return accepted(
      Object.freeze({
        ...device,
        status: 'ACTIVE' as const,
        securityEpoch: device.securityEpoch + 1,
        activatedAt: timestampValue,
        revision: device.revision + 1,
      }),
    );
  return accepted(
    Object.freeze({
      ...device,
      status: 'REVOKED' as const,
      securityEpoch: device.securityEpoch + 1,
      revokedAt: timestampValue,
      revision: device.revision + 1,
    }),
  );
}

export function isFreshStepUpV1(
  assertion: StepUpAssertionV1,
  principalId: StableIdentifierV1,
  now: unknown,
): boolean {
  const nowValue = timestamp(now);
  if (!nowValue || assertion.principalId !== principalId) return false;
  const age = Date.parse(nowValue) - Date.parse(assertion.issuedAt);
  return age >= 0 && age <= STEP_UP_MAX_SECONDS_V1 * 1_000;
}

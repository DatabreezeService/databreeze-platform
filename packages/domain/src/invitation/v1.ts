import {
  INVITATION_MAX_SECONDS_V1,
  type InitialRoleIdForIdentityV1,
} from '../identity/v1.js';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** IAM-010: persisted invitation tokens never contain the raw bearer value. */
export const INVITATION_TOKEN_SCHEMA_VERSION_V1 = 1 as const;
export { INVITATION_MAX_SECONDS_V1 } from '../identity/v1.js';

export type InvitationTokenStatusV1 = 'ACTIVE' | 'REDEEMED' | 'REVOKED';

export interface InvitationTokenV1 {
  readonly schemaVersion: typeof INVITATION_TOKEN_SCHEMA_VERSION_V1;
  readonly id: StableIdentifierV1;
  readonly membershipId: StableIdentifierV1;
  readonly principalId: StableIdentifierV1;
  readonly scope: TenantScopeV1;
  readonly roleId: InitialRoleIdForIdentityV1;
  readonly tokenDigest: string;
  readonly emailDigest: string;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly status: InvitationTokenStatusV1;
  readonly consumedAt?: StrictUtcTimestampV1;
  readonly revision: number;
}

export type InvitationTokenErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_ROLE'
  | 'INVALID_DIGEST'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_LIFETIME'
  | 'INVALID_STATE'
  | 'ALREADY_CONSUMED'
  | 'EXPIRED';

export type InvitationTokenResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: InvitationTokenErrorCodeV1 };

function accepted<TValue>(value: TValue): InvitationTokenResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: InvitationTokenErrorCodeV1): InvitationTokenResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function digest(input: unknown): string | undefined {
  return typeof input === 'string' && /^[a-f0-9]{64}$/u.test(input) ? input : undefined;
}

function role(input: unknown): input is InitialRoleIdForIdentityV1 {
  return (
    input === 'owner' ||
    input === 'admin' ||
    input === 'analyst' ||
    input === 'operator' ||
    input === 'approver' ||
    input === 'viewer'
  );
}

function positiveRevision(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

export function createInvitationTokenV1(input: {
  readonly id: unknown;
  readonly membershipId: unknown;
  readonly principalId: unknown;
  readonly scope: unknown;
  readonly roleId: unknown;
  readonly tokenDigest: unknown;
  readonly emailDigest: unknown;
  readonly issuedAt: unknown;
  readonly expiresAt: unknown;
  readonly revision?: unknown;
}): InvitationTokenResultV1<InvitationTokenV1> {
  const id = stable(input.id);
  const membershipId = stable(input.membershipId);
  const principalId = stable(input.principalId);
  const scope = parseTenantScopeV1(input.scope);
  const tokenDigest = digest(input.tokenDigest);
  const emailDigest = digest(input.emailDigest);
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = timestamp(input.expiresAt);
  const revision = input.revision === undefined ? 1 : positiveRevision(input.revision);
  if (!id || !membershipId || !principalId) return rejected('INVALID_IDENTIFIER');
  if (!scope.accepted) return rejected('INVALID_SCOPE');
  if (!role(input.roleId)) return rejected('INVALID_ROLE');
  if (!tokenDigest || !emailDigest) return rejected('INVALID_DIGEST');
  if (!issuedAt || !expiresAt) return rejected('INVALID_TIMESTAMP');
  if (!revision) return rejected('INVALID_STATE');
  const duration = Date.parse(expiresAt) - Date.parse(issuedAt);
  if (!Number.isFinite(duration) || duration <= 0 || duration > INVITATION_MAX_SECONDS_V1 * 1_000)
    return rejected('INVALID_LIFETIME');
  return accepted(
    Object.freeze({
      schemaVersion: INVITATION_TOKEN_SCHEMA_VERSION_V1,
      id,
      membershipId,
      principalId,
      scope: scope.value,
      roleId: input.roleId,
      tokenDigest,
      emailDigest,
      issuedAt,
      expiresAt,
      status: 'ACTIVE' as const,
      revision,
    }),
  );
}

export function consumeInvitationTokenV1(
  token: InvitationTokenV1,
  at: unknown,
): InvitationTokenResultV1<InvitationTokenV1> {
  const timestampValue = timestamp(at);
  if (!timestampValue) return rejected('INVALID_TIMESTAMP');
  if (token.status !== 'ACTIVE') return rejected('ALREADY_CONSUMED');
  const nowMs = Date.parse(timestampValue);
  const issuedMs = Date.parse(token.issuedAt);
  const expiresMs = Date.parse(token.expiresAt);
  if (!Number.isFinite(nowMs) || nowMs < issuedMs) return rejected('INVALID_TIMESTAMP');
  if (nowMs >= expiresMs) return rejected('EXPIRED');
  return accepted(
    Object.freeze({
      ...token,
      status: 'REDEEMED' as const,
      consumedAt: timestampValue,
      revision: token.revision + 1,
    }),
  );
}

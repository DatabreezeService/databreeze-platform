import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** JRA-009..JRA-011 and JRA-028: canonical policy/request/decision contracts. */
export const APPROVAL_SCHEMA_VERSION_V1 = 1 as const;

export type ApprovalPolicyStatusV1 = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export type ApprovalRequestStatusV1 = 'OPEN' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
export type ApprovalDecisionV1 = 'APPROVE' | 'REJECT';

export interface ApprovalPolicyV1 {
  readonly schemaVersion: typeof APPROVAL_SCHEMA_VERSION_V1;
  readonly policyId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly version: number;
  readonly actionMatcher: Readonly<Record<string, string>>;
  readonly minimumApprovals: number;
  readonly eligibleRoles: readonly string[];
  readonly selfApprovalAllowed: boolean;
  readonly expiresAfterMinutes: number;
  readonly requireMfa: boolean;
  readonly status: ApprovalPolicyStatusV1;
}

export interface ApprovalRequestV1 {
  readonly schemaVersion: typeof APPROVAL_SCHEMA_VERSION_V1;
  readonly requestId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly subjectType: string;
  readonly subjectId: StableIdentifierV1;
  readonly subjectVersion: number;
  readonly subjectHash: string;
  readonly requestedAction: string;
  readonly policyId: StableIdentifierV1;
  readonly policyVersion: number;
  readonly requestedBy: StableIdentifierV1;
  readonly status: ApprovalRequestStatusV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly dueAt?: StrictUtcTimestampV1;
  readonly revision: number;
}

export interface ApprovalDecisionRecordV1 {
  readonly schemaVersion: typeof APPROVAL_SCHEMA_VERSION_V1;
  readonly decisionId: StableIdentifierV1;
  readonly requestId: StableIdentifierV1;
  readonly actorId: StableIdentifierV1;
  readonly decision: ApprovalDecisionV1;
  readonly reason?: string;
  readonly mfaAssertionId?: StableIdentifierV1;
  readonly subjectHash: string;
  readonly decidedAt: StrictUtcTimestampV1;
}

export type ApprovalErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TEXT'
  | 'INVALID_HASH'
  | 'INVALID_VERSION'
  | 'INVALID_COUNT'
  | 'INVALID_EXPIRY'
  | 'INVALID_ROLE'
  | 'INVALID_STATUS'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_DECISION'
  | 'SUBJECT_HASH_MISMATCH'
  | 'SELF_APPROVAL_FORBIDDEN'
  | 'MFA_REQUIRED'
  | 'REQUEST_NOT_OPEN';

export type ApprovalResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ApprovalErrorCodeV1 };

function rejected(code: ApprovalErrorCodeV1): ApprovalResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
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

function text(input: unknown, maximum: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maximum) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined;
}

function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input) ? input : undefined;
}

function roleList(input: unknown): readonly string[] | undefined {
  if (!Array.isArray(input) || input.length === 0 || input.length > 32) return undefined;
  const roles = input.map((role) => text(role, 64));
  return roles.every((role): role is string => Boolean(role))
    ? Object.freeze([...new Set(roles)])
    : undefined;
}

const policyStatuses: readonly ApprovalPolicyStatusV1[] = ['DRAFT', 'ACTIVE', 'RETIRED'];
function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

export function createApprovalPolicyV1(input: {
  readonly policyId: unknown;
  readonly workspaceId: unknown;
  readonly version: unknown;
  readonly actionMatcher: unknown;
  readonly minimumApprovals: unknown;
  readonly eligibleRoles: unknown;
  readonly selfApprovalAllowed: unknown;
  readonly expiresAfterMinutes: unknown;
  readonly requireMfa: unknown;
  readonly status?: unknown;
}): ApprovalResultV1<ApprovalPolicyV1> {
  const policyId = stable(input.policyId);
  const workspaceId = stable(input.workspaceId);
  const roles = roleList(input.eligibleRoles);
  const status = input.status ?? 'DRAFT';
  if (!policyId || !workspaceId) return rejected('INVALID_IDENTIFIER');
  if (!Number.isSafeInteger(input.version) || (input.version as number) < 1)
    return rejected('INVALID_VERSION');
  if (!isRecord(input.actionMatcher)) return rejected('INVALID_TEXT');
  if (!Number.isSafeInteger(input.minimumApprovals) || (input.minimumApprovals as number) < 1)
    return rejected('INVALID_COUNT');
  if (!roles || (input.minimumApprovals as number) > roles.length) return rejected('INVALID_ROLE');
  if (
    !Number.isSafeInteger(input.expiresAfterMinutes) ||
    (input.expiresAfterMinutes as number) < 1 ||
    (input.expiresAfterMinutes as number) > 43_200
  )
    return rejected('INVALID_EXPIRY');
  if (typeof input.selfApprovalAllowed !== 'boolean' || typeof input.requireMfa !== 'boolean')
    return rejected('INVALID_STATUS');
  if (!policyStatuses.includes(status as ApprovalPolicyStatusV1)) return rejected('INVALID_STATUS');
  const matcher: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.actionMatcher)) {
    const normalizedKey = text(key, 64);
    const normalizedValue = text(value, 128);
    if (!normalizedKey || !normalizedValue) return rejected('INVALID_TEXT');
    matcher[normalizedKey] = normalizedValue;
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: APPROVAL_SCHEMA_VERSION_V1,
      policyId,
      workspaceId,
      version: input.version as number,
      actionMatcher: Object.freeze(matcher),
      minimumApprovals: input.minimumApprovals as number,
      eligibleRoles: roles,
      selfApprovalAllowed: input.selfApprovalAllowed,
      expiresAfterMinutes: input.expiresAfterMinutes as number,
      requireMfa: input.requireMfa,
      status: status as ApprovalPolicyStatusV1,
    }),
  });
}

export function createApprovalRequestV1(input: {
  readonly requestId: unknown;
  readonly tenantScope: unknown;
  readonly subjectType: unknown;
  readonly subjectId: unknown;
  readonly subjectVersion: unknown;
  readonly subjectHash: unknown;
  readonly requestedAction: unknown;
  readonly policyId: unknown;
  readonly policyVersion: unknown;
  readonly requestedBy: unknown;
  readonly createdAt: unknown;
  readonly dueAt?: unknown;
}): ApprovalResultV1<ApprovalRequestV1> {
  const requestId = stable(input.requestId);
  const tenantScope = scope(input.tenantScope);
  const subjectType = text(input.subjectType, 80);
  const subjectId = stable(input.subjectId);
  const subjectHash = hash(input.subjectHash);
  const requestedAction = text(input.requestedAction, 80);
  const policyId = stable(input.policyId);
  const requestedBy = stable(input.requestedBy);
  const createdAt = timestamp(input.createdAt);
  const dueAt = input.dueAt === undefined ? undefined : timestamp(input.dueAt);
  if (!requestId || !subjectId || !policyId || !requestedBy) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!subjectType || !requestedAction) return rejected('INVALID_TEXT');
  if (!subjectHash) return rejected('INVALID_HASH');
  if (!Number.isSafeInteger(input.subjectVersion) || (input.subjectVersion as number) < 1)
    return rejected('INVALID_VERSION');
  if (!Number.isSafeInteger(input.policyVersion) || (input.policyVersion as number) < 1)
    return rejected('INVALID_VERSION');
  if (!createdAt || (input.dueAt !== undefined && !dueAt)) return rejected('INVALID_TIMESTAMP');
  if (dueAt && Date.parse(dueAt) < Date.parse(createdAt)) return rejected('INVALID_EXPIRY');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: APPROVAL_SCHEMA_VERSION_V1,
      requestId,
      tenantScope,
      subjectType,
      subjectId,
      subjectVersion: input.subjectVersion as number,
      subjectHash,
      requestedAction,
      policyId,
      policyVersion: input.policyVersion as number,
      requestedBy,
      status: 'OPEN' as const,
      createdAt,
      ...(dueAt ? { dueAt } : {}),
      revision: 1,
    }),
  });
}

export function createApprovalDecisionV1(input: {
  readonly decisionId: unknown;
  readonly request: ApprovalRequestV1;
  readonly actorId: unknown;
  readonly decision: unknown;
  readonly reason?: unknown;
  readonly mfaAssertionId?: unknown;
  readonly subjectHash: unknown;
  readonly decidedAt: unknown;
  readonly actorRole: unknown;
  readonly selfApprovalAllowed: boolean;
  readonly requireMfa: boolean;
}): ApprovalResultV1<ApprovalDecisionRecordV1> {
  const decisionId = stable(input.decisionId);
  const actorId = stable(input.actorId);
  const subjectHash = hash(input.subjectHash);
  const decidedAt = timestamp(input.decidedAt);
  const reason = input.reason === undefined ? undefined : text(input.reason, 512);
  const mfaAssertionId =
    input.mfaAssertionId === undefined ? undefined : stable(input.mfaAssertionId);
  const actorRole = text(input.actorRole, 64);
  if (!decisionId || !actorId) return rejected('INVALID_IDENTIFIER');
  if (!subjectHash || subjectHash !== input.request.subjectHash)
    return rejected('SUBJECT_HASH_MISMATCH');
  if (!decidedAt || (input.reason !== undefined && !reason)) return rejected('INVALID_TIMESTAMP');
  if (input.decision !== 'APPROVE' && input.decision !== 'REJECT')
    return rejected('INVALID_DECISION');
  if (input.request.status !== 'OPEN') return rejected('REQUEST_NOT_OPEN');
  if (!actorRole) return rejected('INVALID_ROLE');
  if (!input.selfApprovalAllowed && actorId === input.request.requestedBy)
    return rejected('SELF_APPROVAL_FORBIDDEN');
  if (input.requireMfa && !mfaAssertionId) return rejected('MFA_REQUIRED');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: APPROVAL_SCHEMA_VERSION_V1,
      decisionId,
      requestId: input.request.requestId,
      actorId,
      decision: input.decision,
      ...(reason ? { reason } : {}),
      ...(mfaAssertionId ? { mfaAssertionId } : {}),
      subjectHash,
      decidedAt,
    }),
  });
}

export function applyApprovalDecisionV1(
  request: ApprovalRequestV1,
  decision: ApprovalDecisionRecordV1,
  approvedDecisionCount: number,
  minimumApprovals: number,
): ApprovalResultV1<ApprovalRequestV1> {
  if (request.status !== 'OPEN') return rejected('REQUEST_NOT_OPEN');
  if (decision.requestId !== request.requestId || decision.subjectHash !== request.subjectHash)
    return rejected('SUBJECT_HASH_MISMATCH');
  const status: ApprovalRequestStatusV1 =
    decision.decision === 'REJECT'
      ? 'REJECTED'
      : approvedDecisionCount >= minimumApprovals
        ? 'APPROVED'
        : 'OPEN';
  return Object.freeze({
    accepted: true,
    value: Object.freeze({ ...request, status, revision: request.revision + 1 }),
  });
}

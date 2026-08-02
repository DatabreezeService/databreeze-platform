import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** JRA-026 and JRA-027: canonical actionable findings and review tasks. */
export const FINDING_SCHEMA_VERSION_V1 = 1 as const;

export type FindingSeverityV1 = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FindingWorkflowStateV1 = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED' | 'SUPPRESSED';
export type FindingDispositionV1 = 'FIXED' | 'DISMISSED' | 'SUPPRESSED';
export type ReviewTaskStateV1 = 'OPEN' | 'CLAIMED' | 'RETURNED' | 'COMPLETED';

export interface FindingV1 {
  readonly schemaVersion: typeof FINDING_SCHEMA_VERSION_V1;
  readonly findingId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly sourceSubsystem: string;
  readonly findingType: string;
  readonly fingerprint: string;
  readonly diagnosticDetailRef: string;
  readonly severity: FindingSeverityV1;
  readonly workflowState: FindingWorkflowStateV1;
  readonly assignedTo?: StableIdentifierV1;
  readonly evidenceReferences: readonly StableIdentifierV1[];
  readonly disposition?: FindingDispositionV1;
  readonly resolutionNote?: string;
  readonly revision: number;
  readonly createdAt: StrictUtcTimestampV1;
  readonly resolvedAt?: StrictUtcTimestampV1;
}

export interface ReviewTaskV1 {
  readonly schemaVersion: typeof FINDING_SCHEMA_VERSION_V1;
  readonly reviewTaskId: StableIdentifierV1;
  readonly findingId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly reason: string;
  readonly eligibleRole: string;
  readonly assigneeId?: StableIdentifierV1;
  readonly dueAt?: StrictUtcTimestampV1;
  readonly state: ReviewTaskStateV1;
  readonly revision: number;
  readonly createdAt: StrictUtcTimestampV1;
}

export type FindingResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: FindingErrorCodeV1 };

export type FindingErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TEXT'
  | 'INVALID_HASH'
  | 'INVALID_SEVERITY'
  | 'INVALID_STATE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_DISPOSITION'
  | 'INVALID_REVISION'
  | 'INVALID_TRANSITION'
  | 'INVALID_EVIDENCE';

function rejected<TValue>(code: FindingErrorCodeV1): FindingResultV1<TValue> {
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

function evidence(input: unknown): readonly StableIdentifierV1[] | undefined {
  if (!Array.isArray(input) || input.length > 100) return undefined;
  const values = input.map(stable);
  if (values.some((value) => value === undefined)) return undefined;
  return Object.freeze([...new Set(values as StableIdentifierV1[])]);
}

export function createFindingV1(input: {
  readonly findingId: unknown;
  readonly tenantScope: unknown;
  readonly sourceSubsystem: unknown;
  readonly findingType: unknown;
  readonly fingerprint: unknown;
  readonly diagnosticDetailRef: unknown;
  readonly severity: unknown;
  readonly evidenceReferences: unknown;
  readonly assignedTo?: unknown;
  readonly createdAt: unknown;
}): FindingResultV1<FindingV1> {
  const findingId = stable(input.findingId);
  const tenantScope = scope(input.tenantScope);
  const sourceSubsystem = text(input.sourceSubsystem, 80);
  const findingType = text(input.findingType, 120);
  const fingerprint = hash(input.fingerprint);
  const diagnosticDetailRef = text(input.diagnosticDetailRef, 256);
  const severity = input.severity;
  const evidenceReferences = evidence(input.evidenceReferences);
  const assignedTo = input.assignedTo === undefined ? undefined : stable(input.assignedTo);
  const createdAt = timestamp(input.createdAt);
  if (!findingId || (input.assignedTo !== undefined && !assignedTo))
    return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!sourceSubsystem || !findingType || !diagnosticDetailRef) return rejected('INVALID_TEXT');
  if (!fingerprint) return rejected('INVALID_HASH');
  if (!evidenceReferences) return rejected('INVALID_EVIDENCE');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (!['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity as string))
    return rejected('INVALID_SEVERITY');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: FINDING_SCHEMA_VERSION_V1,
      findingId,
      tenantScope,
      sourceSubsystem,
      findingType,
      fingerprint,
      diagnosticDetailRef,
      severity: severity as FindingSeverityV1,
      workflowState: 'OPEN' as const,
      ...(assignedTo ? { assignedTo } : {}),
      evidenceReferences,
      revision: 1,
      createdAt,
    }),
  });
}

export function resolveFindingV1(
  finding: FindingV1,
  dispositionInput: unknown,
  resolvedAtInput: unknown,
  resolutionNoteInput?: unknown,
): FindingResultV1<FindingV1> {
  if (
    finding.workflowState === 'RESOLVED' ||
    finding.workflowState === 'DISMISSED' ||
    finding.workflowState === 'SUPPRESSED'
  )
    return rejected('INVALID_STATE');
  if (
    dispositionInput !== 'FIXED' &&
    dispositionInput !== 'DISMISSED' &&
    dispositionInput !== 'SUPPRESSED'
  )
    return rejected('INVALID_DISPOSITION');
  const resolvedAt = timestamp(resolvedAtInput);
  const resolutionNote = text(resolutionNoteInput ?? '', 1_000);
  if (!resolvedAt || Date.parse(resolvedAt) < Date.parse(finding.createdAt))
    return rejected('INVALID_TIMESTAMP');
  if (!resolutionNote) return rejected('INVALID_TEXT');
  const workflowState = dispositionInput === 'FIXED' ? 'RESOLVED' : dispositionInput;
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      ...finding,
      workflowState,
      disposition: dispositionInput as FindingDispositionV1,
      resolutionNote,
      resolvedAt,
      revision: finding.revision + 1,
    }),
  });
}

export function createReviewTaskV1(input: {
  readonly reviewTaskId: unknown;
  readonly findingId: unknown;
  readonly tenantScope: unknown;
  readonly reason: unknown;
  readonly eligibleRole: unknown;
  readonly assigneeId?: unknown;
  readonly dueAt?: unknown;
  readonly createdAt: unknown;
}): FindingResultV1<ReviewTaskV1> {
  const reviewTaskId = stable(input.reviewTaskId);
  const findingId = stable(input.findingId);
  const tenantScope = scope(input.tenantScope);
  const reason = text(input.reason, 512);
  const eligibleRole = text(input.eligibleRole, 64);
  const assigneeId = input.assigneeId === undefined ? undefined : stable(input.assigneeId);
  const dueAt = input.dueAt === undefined ? undefined : timestamp(input.dueAt);
  const createdAt = timestamp(input.createdAt);
  if (!reviewTaskId || !findingId || (input.assigneeId !== undefined && !assigneeId))
    return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!reason || !eligibleRole) return rejected('INVALID_TEXT');
  if (!createdAt || (input.dueAt !== undefined && !dueAt)) return rejected('INVALID_TIMESTAMP');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: FINDING_SCHEMA_VERSION_V1,
      reviewTaskId,
      findingId,
      tenantScope,
      reason,
      eligibleRole,
      ...(assigneeId ? { assigneeId } : {}),
      ...(dueAt ? { dueAt } : {}),
      state: 'OPEN' as const,
      revision: 1,
      createdAt,
    }),
  });
}

export function transitionReviewTaskV1(
  task: ReviewTaskV1,
  nextStateInput: unknown,
  expectedRevision: number,
): FindingResultV1<ReviewTaskV1> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== task.revision)
    return rejected('INVALID_REVISION');
  if (!['OPEN', 'CLAIMED', 'RETURNED', 'COMPLETED'].includes(nextStateInput as string))
    return rejected('INVALID_STATE');
  const nextState = nextStateInput as ReviewTaskStateV1;
  const allowed: Readonly<Record<ReviewTaskStateV1, readonly ReviewTaskStateV1[]>> = {
    OPEN: ['CLAIMED', 'COMPLETED'],
    CLAIMED: ['RETURNED', 'COMPLETED'],
    RETURNED: ['CLAIMED', 'COMPLETED'],
    COMPLETED: [],
  };
  if (!allowed[task.state].includes(nextState)) return rejected('INVALID_TRANSITION');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({ ...task, state: nextState, revision: task.revision + 1 }),
  });
}

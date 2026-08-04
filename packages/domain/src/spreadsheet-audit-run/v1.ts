import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** SA-001: content-free admission vocabulary for a Spreadsheet Auditor run. */
export const SPREADSHEET_AUDIT_RUN_SCHEMA_VERSION_V1 = 1 as const;

export type SpreadsheetAuditRunStateV1 = 'ADMITTED';

export interface SpreadsheetAuditRunAdmissionRequestV1 {
  readonly artifactVersionId: StableIdentifierV1;
  readonly processorVersion: string;
}

export interface SpreadsheetAuditRunV1 {
  readonly schemaVersion: typeof SPREADSHEET_AUDIT_RUN_SCHEMA_VERSION_V1;
  readonly runId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly processorVersion: string;
  /** Stored for idempotency replay; never included in the public handle. */
  readonly idempotencyKey: string;
  readonly state: SpreadsheetAuditRunStateV1;
  readonly createdAt: StrictUtcTimestampV1;
}

export type SpreadsheetAuditRunHandleV1 = Omit<
  SpreadsheetAuditRunV1,
  'tenantScope' | 'idempotencyKey'
>;

export type SpreadsheetAuditRunErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TEXT'
  | 'INVALID_TIMESTAMP';

export type SpreadsheetAuditRunResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: SpreadsheetAuditRunErrorCodeV1 };

function accepted<TValue>(value: TValue): SpreadsheetAuditRunResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: SpreadsheetAuditRunErrorCodeV1): SpreadsheetAuditRunResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
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

function boundedText(input: unknown, maximum: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maximum) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined;
}

export function createSpreadsheetAuditRunAdmissionRequestV1(input: {
  readonly artifactVersionId: unknown;
  readonly processorVersion: unknown;
}): SpreadsheetAuditRunResultV1<SpreadsheetAuditRunAdmissionRequestV1> {
  const artifactVersionId = stable(input.artifactVersionId);
  const processorVersion = boundedText(input.processorVersion, 128);
  if (!artifactVersionId) return rejected('INVALID_IDENTIFIER');
  if (!processorVersion) return rejected('INVALID_TEXT');
  return accepted(Object.freeze({ artifactVersionId, processorVersion }));
}

export function createSpreadsheetAuditRunV1(input: {
  readonly runId: unknown;
  readonly jobId: unknown;
  readonly tenantScope: unknown;
  readonly artifactVersionId: unknown;
  readonly processorVersion: unknown;
  readonly idempotencyKey: unknown;
  readonly createdAt: unknown;
}): SpreadsheetAuditRunResultV1<SpreadsheetAuditRunV1> {
  const runId = stable(input.runId);
  const jobId = stable(input.jobId);
  const tenantScope = scope(input.tenantScope);
  const artifactVersionId = stable(input.artifactVersionId);
  const processorVersion = boundedText(input.processorVersion, 128);
  const idempotencyKey = boundedText(input.idempotencyKey, 200);
  const createdAt = timestamp(input.createdAt);
  if (!runId || !jobId || !artifactVersionId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!processorVersion || !idempotencyKey) return rejected('INVALID_TEXT');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  return accepted(
    Object.freeze({
      schemaVersion: SPREADSHEET_AUDIT_RUN_SCHEMA_VERSION_V1,
      runId,
      jobId,
      tenantScope,
      artifactVersionId,
      processorVersion,
      idempotencyKey,
      state: 'ADMITTED' as const,
      createdAt,
    }),
  );
}

export function toSpreadsheetAuditRunHandleV1(
  run: SpreadsheetAuditRunV1,
): SpreadsheetAuditRunHandleV1 {
  return Object.freeze({
    schemaVersion: run.schemaVersion,
    runId: run.runId,
    jobId: run.jobId,
    artifactVersionId: run.artifactVersionId,
    processorVersion: run.processorVersion,
    state: run.state,
    createdAt: run.createdAt,
  });
}

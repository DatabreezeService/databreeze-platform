import { createHash } from 'node:crypto';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeKeyV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  ConversationContextEventRecordV1,
  ConversationContextAdvanceInputV1,
  ConversationContextAdvanceResultV1,
  ConversationCreateResultV1,
  ConversationMessageAppendResultV1,
  ConversationMessageRecordV1,
  ConversationRecordV1,
  ConversationRetentionStateV1,
  ConversationRepositoryPortV1,
  ConversationSummaryRecordV1,
  ConversationPageV1,
} from '../application/conversation-repository.port.js';
import type { DdaDatabaseClientV1 } from '../../adapter/dda-database.client.js';

const MAX_CONVERSATION_TITLE_LENGTH = 200;
const MAX_FILTER_CONTEXT_LENGTH = 4_000;
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_SUMMARY_LENGTH = 8_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_DATASET_COUNT = 100;
const MAX_TRANSACTION_RETRIES = 3;

type Where = Readonly<Record<string, unknown>>;
type OrderBy = Readonly<Record<string, 'asc' | 'desc'>>;

export interface DdaConversationRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly title: string;
  readonly activeDatasetIds: unknown;
  readonly activeDatasetVersionIds: unknown;
  readonly dashboardId: string | null;
  readonly filterContext: string | null;
  readonly retentionState: string;
  readonly retentionHold: boolean;
  readonly nextSequence: number;
  readonly revision: number;
  readonly createIdempotencyScopeKey: string;
  readonly createIdempotencyKey: string;
  readonly createRequestFingerprint: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DdaConversationMessageRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly conversationId: string;
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly role: string;
  readonly text: string;
  readonly textDigest: string;
  readonly textLength: number;
  readonly datasetVersionId: string | null;
  readonly createdAt: Date;
}

export interface DdaConversationContextEventRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly conversationId: string;
  readonly sequence: number;
  readonly datasetId: string | null;
  readonly idempotencyScopeKey: string | null;
  readonly idempotencyKey: string | null;
  readonly requestFingerprint: string | null;
  readonly kind: string;
  readonly beforeVersionId: string | null;
  readonly afterVersionId: string | null;
  readonly occurredAt: Date;
  readonly createdAt: Date;
}

export interface DdaConversationSummaryRowV1 {
  readonly conversationId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly text: string;
  readonly summaryDigest: string;
  readonly revision: number;
  readonly updatedAt: Date;
}

interface ConversationDelegateV1<TRow> {
  findFirst(input: {
    readonly where: Where;
    readonly orderBy?: readonly OrderBy[];
  }): Promise<TRow | null>;
  findMany(input: {
    readonly where: Where;
    readonly orderBy?: readonly OrderBy[];
    readonly take?: number;
  }): Promise<readonly TRow[]>;
  create(input: { readonly data: Record<string, unknown> }): Promise<TRow>;
  updateMany(input: {
    readonly where: Where;
    readonly data: Record<string, unknown>;
  }): Promise<{ readonly count: number }>;
}

export interface PrismaConversationTransactionClientV1 {
  readonly ddaConversation: ConversationDelegateV1<DdaConversationRowV1>;
  readonly ddaConversationMessage: ConversationDelegateV1<DdaConversationMessageRowV1>;
  readonly ddaConversationContextEvent: ConversationDelegateV1<DdaConversationContextEventRowV1>;
  readonly ddaConversationSummary: ConversationDelegateV1<DdaConversationSummaryRowV1>;
}

export interface PrismaConversationDatabaseClientV1 extends PrismaConversationTransactionClientV1 {
  $transaction<TValue>(
    work: (transaction: PrismaConversationTransactionClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

interface NormalizedConversationInput {
  readonly scope: TenantScopeV1;
  readonly conversationId: string;
  readonly title: string;
  readonly activeDatasetIds: readonly string[];
  readonly activeDatasetVersionIds: Readonly<Record<string, string>>;
  readonly dashboardId?: string;
  readonly filterContext?: string;
  readonly retentionHold: boolean;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface NormalizedMessageInput {
  readonly scope: TenantScopeV1;
  readonly messageId: string;
  readonly conversationId: string;
  readonly role: ConversationMessageRecordV1['role'];
  readonly text: string;
  readonly idempotencyKey: string;
  readonly datasetVersionId?: string;
  readonly createdAt: Date;
}

interface NormalizedContextEventInput {
  readonly scope: TenantScopeV1;
  readonly eventId: string;
  readonly conversationId: string;
  readonly kind: ConversationContextEventRecordV1['kind'];
  readonly datasetId?: string;
  readonly beforeVersionId?: string;
  readonly afterVersionId?: string;
  readonly occurredAt: Date;
}

interface NormalizedContextAdvanceInput {
  readonly scope: TenantScopeV1;
  readonly conversationId: string;
  readonly datasetId: string;
  readonly beforeVersionId: string;
  readonly afterVersionId: string;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly occurredAt: Date;
}

interface NormalizedSummaryInput {
  readonly scope: TenantScopeV1;
  readonly conversationId: string;
  readonly text: string;
  readonly revision: number;
  readonly updatedAt: Date;
}

function error(code: string): Error {
  return new Error(code);
}

const INTEGRITY_UNAVAILABLE = 'DDA_CONVERSATION_INTEGRITY_UNAVAILABLE';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(typeof value);
}

function digestText(text: string): string {
  return stableHash(text);
}

function safeText(value: unknown, maximum: number, allowEmpty: boolean): string | undefined {
  if (typeof value !== 'string' || value.length > maximum || /\p{Cc}/u.test(value)) {
    return undefined;
  }
  const normalized = value.normalize('NFC');
  if (!allowEmpty && normalized.length === 0) return undefined;
  return normalized;
}

function stableId(value: unknown): string | undefined {
  const parsed = parseStableIdentifierV1(value);
  return parsed.accepted ? parsed.value : undefined;
}

function dateValue(value: unknown): Date | undefined {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return undefined;
  return new Date(value.getTime());
}

function inputDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !parseStrictUtcTimestampV1(value).accepted) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function isoDate(value: unknown): string | undefined {
  const parsed = dateValue(value);
  if (parsed === undefined) return undefined;
  const iso = parsed.toISOString();
  return parseStrictUtcTimestampV1(iso).accepted ? iso : undefined;
}

function positiveRevision(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}

function validSequence(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}

function idempotencyKey(value: unknown): string | undefined {
  return safeText(value, MAX_IDEMPOTENCY_KEY_LENGTH, false);
}

function scopeColumns(scopeInput: TenantScopeV1): Readonly<{
  readonly scopeType: 'workspace' | 'project';
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
}> {
  const parsed = parseTenantScopeV1(scopeInput);
  if (!parsed.accepted || parsed.value.scopeType === 'organization') {
    throw error('DDA_CONVERSATION_SCOPE_REQUIRED');
  }
  return Object.freeze({
    scopeType: parsed.value.scopeType,
    organizationId: parsed.value.organizationId,
    workspaceId: parsed.value.workspaceId,
    projectId: parsed.value.scopeType === 'project' ? parsed.value.projectId : null,
  });
}

function rowScope(row: {
  readonly scopeType: unknown;
  readonly organizationId: unknown;
  readonly workspaceId: unknown;
  readonly projectId: unknown;
}): TenantScopeV1 | undefined {
  if (typeof row.projectId !== 'string' && row.projectId !== null) return undefined;
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  return parsed.accepted ? parsed.value : undefined;
}

function jsonStringArray(value: unknown, allowEmpty = false): readonly string[] | undefined {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.length > MAX_DATASET_COUNT
  ) {
    return undefined;
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const parsed = stableId(item);
    if (parsed === undefined || seen.has(parsed)) return undefined;
    seen.add(parsed);
    result.push(parsed);
  }
  return Object.freeze(result);
}

function jsonVersionMap(value: unknown): Readonly<Record<string, string>> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = stableId(rawKey);
    const version = stableId(rawValue);
    if (key === undefined || version === undefined) return undefined;
    result[key] = version;
  }
  return Object.freeze(result);
}

function storedOptionalId(value: unknown): string | undefined | null {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return stableId(value);
}

function inputOptionalId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return stableId(value);
}

function recordFromConversationRow(row: unknown): ConversationRecordV1 | undefined {
  if (!isRecord(row)) return undefined;
  const persisted = row as unknown as DdaConversationRowV1;
  const conversationId = stableId(persisted.id);
  const scope = rowScope(persisted);
  const title = safeText(persisted.title, MAX_CONVERSATION_TITLE_LENGTH, false);
  const legacyMigrationRow =
    conversationId !== undefined &&
    persisted.createIdempotencyKey === `legacy:${conversationId}` &&
    persisted.createRequestFingerprint === '0'.repeat(64);
  const activeDatasetIds = jsonStringArray(persisted.activeDatasetIds, legacyMigrationRow);
  const activeDatasetVersionIds = jsonVersionMap(persisted.activeDatasetVersionIds);
  const dashboardId = storedOptionalId(persisted.dashboardId);
  const filterContext =
    persisted.filterContext === null
      ? null
      : safeText(persisted.filterContext, MAX_FILTER_CONTEXT_LENGTH, true);
  const createdAt = isoDate(persisted.createdAt);
  const updatedAt = isoDate(persisted.updatedAt);
  const revision = positiveRevision(persisted.revision);
  const retentionState = persisted.retentionState;
  if (
    conversationId === undefined ||
    scope === undefined ||
    scope.scopeType === 'organization' ||
    title === undefined ||
    activeDatasetIds === undefined ||
    activeDatasetVersionIds === undefined ||
    activeDatasetVersionIdsKeysMismatch(activeDatasetIds, activeDatasetVersionIds) ||
    dashboardId === undefined ||
    filterContext === undefined ||
    typeof persisted.retentionHold !== 'boolean' ||
    validSequence(persisted.nextSequence) === undefined ||
    (retentionState !== 'ACTIVE' &&
      retentionState !== 'PENDING_DELETE' &&
      retentionState !== 'DELETED') ||
    retentionState === 'DELETED' ||
    revision === undefined ||
    idempotencyKey(persisted.createIdempotencyScopeKey) === undefined ||
    idempotencyKey(persisted.createIdempotencyKey) === undefined ||
    persisted.createIdempotencyScopeKey !== tenantScopeKeyV1(scope) ||
    typeof persisted.createRequestFingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(persisted.createRequestFingerprint) ||
    (!legacyMigrationRow && persisted.createRequestFingerprint === '0'.repeat(64)) ||
    createdAt === undefined ||
    updatedAt === undefined
  ) {
    return undefined;
  }
  return Object.freeze({
    conversationId,
    tenantScope: scope,
    title,
    activeDatasetIds,
    activeDatasetVersionIds,
    ...(dashboardId === null ? {} : { dashboardId }),
    ...(filterContext === null ? {} : { filterContext }),
    retentionState: retentionState as ConversationRetentionStateV1,
    retentionHold: persisted.retentionHold,
    revision,
    createdAt,
    updatedAt,
  });
}

function activeDatasetVersionIdsKeysMismatch(
  datasetIds: readonly string[],
  versions: Readonly<Record<string, string>>,
): boolean {
  const datasetKeys = [...datasetIds].sort();
  const versionKeys = Object.keys(versions).sort();
  return (
    datasetKeys.length !== versionKeys.length ||
    datasetKeys.some((datasetId, index) => datasetId !== versionKeys[index])
  );
}

function conversationForWrite(record: ConversationRecordV1): NormalizedConversationInput {
  const conversationId = stableId(record.conversationId);
  const scopeParsed = parseTenantScopeV1(record.tenantScope);
  const scope = scopeParsed.accepted ? scopeParsed.value : undefined;
  const title = safeText(record.title, MAX_CONVERSATION_TITLE_LENGTH, false);
  const activeDatasetIds = jsonStringArray(record.activeDatasetIds);
  const activeDatasetVersionIds = jsonVersionMap(record.activeDatasetVersionIds);
  const dashboardId = inputOptionalId(record.dashboardId);
  const filterContext =
    record.filterContext === undefined
      ? undefined
      : safeText(record.filterContext, MAX_FILTER_CONTEXT_LENGTH, true);
  const createdAt = inputDate(record.createdAt);
  const updatedAt = inputDate(record.updatedAt);
  const revision = positiveRevision(record.revision);
  if (
    conversationId === undefined ||
    scope === undefined ||
    scope.scopeType === 'organization' ||
    title === undefined ||
    activeDatasetIds === undefined ||
    activeDatasetVersionIds === undefined ||
    activeDatasetVersionIdsKeysMismatch(activeDatasetIds, activeDatasetVersionIds) ||
    (record.dashboardId !== undefined && dashboardId === undefined) ||
    filterContext === null ||
    typeof record.retentionHold !== 'boolean' ||
    createdAt === undefined ||
    updatedAt === undefined ||
    revision === undefined
  ) {
    throw error('DDA_CONVERSATION_INPUT_INVALID');
  }
  return Object.freeze({
    scope,
    conversationId,
    title,
    activeDatasetIds,
    activeDatasetVersionIds,
    ...(dashboardId === undefined ? {} : { dashboardId }),
    ...(filterContext === undefined ? {} : { filterContext }),
    retentionHold: record.retentionHold,
    revision,
    createdAt,
    updatedAt,
  });
}

function messageForWrite(record: ConversationMessageRecordV1): NormalizedMessageInput {
  const messageId = stableId(record.messageId);
  const conversationId = stableId(record.conversationId);
  const scopeParsed = parseTenantScopeV1(record.tenantScope);
  const scope = scopeParsed.accepted ? scopeParsed.value : undefined;
  const text = safeText(record.text, MAX_MESSAGE_LENGTH, true);
  const key = idempotencyKey(record.idempotencyKey);
  const datasetVersionId = inputOptionalId(record.datasetVersionId);
  const createdAt = inputDate(record.createdAt);
  if (
    messageId === undefined ||
    conversationId === undefined ||
    scope === undefined ||
    scope.scopeType === 'organization' ||
    (record.role !== 'USER' && record.role !== 'AGENT' && record.role !== 'SYSTEM') ||
    text === undefined ||
    key === undefined ||
    (record.datasetVersionId !== undefined && datasetVersionId === undefined) ||
    createdAt === undefined
  ) {
    throw error('DDA_CONVERSATION_MESSAGE_INPUT_INVALID');
  }
  return Object.freeze({
    scope,
    messageId,
    conversationId,
    role: record.role,
    text,
    idempotencyKey: key,
    ...(datasetVersionId === undefined ? {} : { datasetVersionId }),
    createdAt,
  });
}

const contextKinds = new Set<ConversationContextEventRecordV1['kind']>([
  'CONTEXT_RESTORED',
  'DATASET_VERSION_ADVANCED',
  'DATASET_ATTACHED',
  'DATASET_DETACHED',
  'DASHBOARD_VERSION_ADVANCED',
  'FILTER_CONTEXT_CHANGED',
]);
const datasetContextKinds = new Set<ConversationContextEventRecordV1['kind']>([
  'DATASET_VERSION_ADVANCED',
  'DATASET_ATTACHED',
  'DATASET_DETACHED',
]);

function contextEventForWrite(
  record: ConversationContextEventRecordV1,
): NormalizedContextEventInput {
  const eventId = stableId(record.eventId);
  const conversationId = stableId(record.conversationId);
  const scopeParsed = parseTenantScopeV1(record.tenantScope);
  const scope = scopeParsed.accepted ? scopeParsed.value : undefined;
  const datasetId = inputOptionalId(record.datasetId);
  const beforeVersionId = inputOptionalId(record.beforeVersionId);
  const afterVersionId = inputOptionalId(record.afterVersionId);
  const occurredAt = inputDate(record.occurredAt);
  if (
    eventId === undefined ||
    conversationId === undefined ||
    scope === undefined ||
    scope.scopeType === 'organization' ||
    !contextKinds.has(record.kind) ||
    (record.datasetId !== undefined && datasetId === undefined) ||
    (record.beforeVersionId !== undefined && beforeVersionId === undefined) ||
    (record.afterVersionId !== undefined && afterVersionId === undefined) ||
    occurredAt === undefined
  ) {
    throw error('DDA_CONVERSATION_CONTEXT_EVENT_INPUT_INVALID');
  }
  return Object.freeze({
    scope,
    eventId,
    conversationId,
    kind: record.kind,
    ...(datasetId === undefined ? {} : { datasetId }),
    ...(beforeVersionId === null || beforeVersionId === undefined ? {} : { beforeVersionId }),
    ...(afterVersionId === null || afterVersionId === undefined ? {} : { afterVersionId }),
    occurredAt,
  });
}

function summaryForWrite(record: ConversationSummaryRecordV1): NormalizedSummaryInput {
  const conversationId = stableId(record.conversationId);
  const scopeParsed = parseTenantScopeV1(record.tenantScope);
  const scope = scopeParsed.accepted ? scopeParsed.value : undefined;
  const text = safeText(record.text, MAX_SUMMARY_LENGTH, true);
  const updatedAt = inputDate(record.updatedAt);
  if (
    conversationId === undefined ||
    scope === undefined ||
    scope.scopeType === 'organization' ||
    text === undefined ||
    positiveRevision(record.revision) === undefined ||
    updatedAt === undefined
  ) {
    throw error('DDA_CONVERSATION_SUMMARY_INPUT_INVALID');
  }
  return Object.freeze({
    scope,
    conversationId,
    text,
    revision: record.revision,
    updatedAt,
  });
}

function contextAdvanceForWrite(
  input: ConversationContextAdvanceInputV1,
): NormalizedContextAdvanceInput {
  const scopeParsed = parseTenantScopeV1(input.tenantScope);
  const scope = scopeParsed.accepted ? scopeParsed.value : undefined;
  const conversationId = stableId(input.conversationId);
  const datasetId = stableId(input.datasetId);
  const beforeVersionId = stableId(input.beforeVersionId);
  const afterVersionId = stableId(input.afterVersionId);
  const eventId = stableId(input.eventId);
  const idempotency = idempotencyKey(input.idempotencyKey);
  const occurredAt = inputDate(input.occurredAt);
  if (
    scope === undefined ||
    scope.scopeType === 'organization' ||
    conversationId === undefined ||
    datasetId === undefined ||
    beforeVersionId === undefined ||
    afterVersionId === undefined ||
    eventId === undefined ||
    idempotency === undefined ||
    occurredAt === undefined
  ) {
    throw error('DDA_CONVERSATION_CONTEXT_ADVANCE_INPUT_INVALID');
  }
  return Object.freeze({
    scope,
    conversationId,
    datasetId,
    beforeVersionId,
    afterVersionId,
    eventId,
    idempotencyKey: idempotency,
    occurredAt,
  });
}

function conversationFingerprint(input: NormalizedConversationInput): string {
  return stableHash(
    canonical({
      tenantScope: input.scope,
      title: input.title,
      datasetIds: [...input.activeDatasetIds].sort(),
      datasetVersionIds: input.activeDatasetVersionIds,
      dashboardId: input.dashboardId ?? null,
      filterContext: input.filterContext ?? null,
      retentionHold: input.retentionHold,
    }),
  );
}

function messageFingerprint(input: NormalizedMessageInput): string {
  return stableHash(
    canonical({
      tenantScope: input.scope,
      messageId: input.messageId,
      conversationId: input.conversationId,
      role: input.role,
      text: input.text,
      datasetVersionId: input.datasetVersionId,
    }),
  );
}

function contextAdvanceFingerprint(input: NormalizedContextAdvanceInput): string {
  return stableHash(
    canonical({
      tenantScope: input.scope,
      conversationId: input.conversationId,
      datasetId: input.datasetId,
      beforeVersionId: input.beforeVersionId,
      afterVersionId: input.afterVersionId,
    }),
  );
}

function scopeMatches(scope: TenantScopeV1, row: { readonly tenantScope: TenantScopeV1 }): boolean {
  return tenantScopesEqualV1(scope, row.tenantScope);
}

function conversationMatchesInput(
  input: NormalizedConversationInput,
  conversation: ConversationRecordV1,
): boolean {
  return (
    scopeMatches(input.scope, conversation) &&
    conversation.conversationId === input.conversationId &&
    conversation.title === input.title &&
    JSON.stringify([...conversation.activeDatasetIds].sort()) ===
      JSON.stringify([...input.activeDatasetIds].sort()) &&
    canonical(conversation.activeDatasetVersionIds) === canonical(input.activeDatasetVersionIds) &&
    (conversation.dashboardId ?? null) === (input.dashboardId ?? null) &&
    (conversation.filterContext ?? null) === (input.filterContext ?? null) &&
    conversation.retentionHold === input.retentionHold &&
    conversation.revision === input.revision &&
    conversation.createdAt === input.createdAt.toISOString() &&
    conversation.updatedAt === input.updatedAt.toISOString()
  );
}

function requireConversation(row: unknown): ConversationRecordV1 {
  const mapped = recordFromConversationRow(row);
  if (mapped === undefined) throw error(INTEGRITY_UNAVAILABLE);
  return mapped;
}

function messageFromRow(row: unknown): ConversationMessageRecordV1 {
  if (!isRecord(row)) throw error(INTEGRITY_UNAVAILABLE);
  const persisted = row as unknown as DdaConversationMessageRowV1;
  const messageId = stableId(persisted.id);
  const conversationId = stableId(persisted.conversationId);
  const scope = rowScope(persisted);
  const key = idempotencyKey(persisted.idempotencyKey);
  const role = persisted.role;
  const text = safeText(persisted.text, MAX_MESSAGE_LENGTH, true);
  const sequence = validSequence(persisted.sequence);
  const textDigest = persisted.textDigest;
  const requestFingerprint = persisted.requestFingerprint;
  const datasetVersionId = storedOptionalId(persisted.datasetVersionId);
  const createdAt = isoDate(persisted.createdAt);
  if (
    messageId === undefined ||
    conversationId === undefined ||
    scope === undefined ||
    scope.scopeType === 'organization' ||
    key === undefined ||
    (role !== 'USER' && role !== 'AGENT' && role !== 'SYSTEM') ||
    text === undefined ||
    sequence === undefined ||
    typeof textDigest !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(textDigest) ||
    textDigest !== digestText(text) ||
    persisted.textLength !== text.length ||
    typeof requestFingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(requestFingerprint) ||
    datasetVersionId === undefined ||
    createdAt === undefined
  ) {
    throw error(INTEGRITY_UNAVAILABLE);
  }
  const result: ConversationMessageRecordV1 = {
    messageId,
    conversationId,
    tenantScope: scope,
    role,
    text,
    sequence,
    idempotencyKey: key,
    ...(datasetVersionId === null ? {} : { datasetVersionId }),
    createdAt,
  } as ConversationMessageRecordV1;
  if (
    messageFingerprint({
      scope,
      messageId,
      conversationId,
      role,
      text,
      idempotencyKey: key,
      ...(datasetVersionId === null ? {} : { datasetVersionId }),
      createdAt: new Date(createdAt),
    }) !== requestFingerprint
  ) {
    throw error(INTEGRITY_UNAVAILABLE);
  }
  return Object.freeze(result);
}

function contextEventFromRow(row: unknown): ConversationContextEventRecordV1 {
  if (!isRecord(row)) throw error(INTEGRITY_UNAVAILABLE);
  const persisted = row as unknown as DdaConversationContextEventRowV1;
  const eventId = stableId(persisted.id);
  const conversationId = stableId(persisted.conversationId);
  const scope = rowScope(persisted);
  const sequence = validSequence(persisted.sequence);
  const datasetId = storedOptionalId(persisted.datasetId);
  const idempotencyScopeKey = persisted.idempotencyScopeKey;
  const eventIdempotencyKey = persisted.idempotencyKey;
  const requestFingerprint = persisted.requestFingerprint;
  const beforeVersionId = storedOptionalId(persisted.beforeVersionId);
  const afterVersionId = storedOptionalId(persisted.afterVersionId);
  const occurredAt = isoDate(persisted.occurredAt);
  if (
    eventId === undefined ||
    conversationId === undefined ||
    scope === undefined ||
    scope.scopeType === 'organization' ||
    sequence === undefined ||
    !contextKinds.has(persisted.kind as ConversationContextEventRecordV1['kind']) ||
    !Object.prototype.hasOwnProperty.call(persisted, 'datasetId') ||
    !Object.prototype.hasOwnProperty.call(persisted, 'idempotencyScopeKey') ||
    !Object.prototype.hasOwnProperty.call(persisted, 'idempotencyKey') ||
    !Object.prototype.hasOwnProperty.call(persisted, 'requestFingerprint') ||
    (persisted.datasetId !== null && datasetId === undefined) ||
    (idempotencyScopeKey !== null &&
      idempotencyScopeKey !== undefined &&
      idempotencyScopeKey !== tenantScopeKeyV1(scope)) ||
    (datasetContextKinds.has(persisted.kind as ConversationContextEventRecordV1['kind']) &&
      (datasetId === null || datasetId === undefined)) ||
    (persisted.kind === 'DATASET_VERSION_ADVANCED' &&
      (datasetId === null ||
        datasetId === undefined ||
        beforeVersionId === null ||
        beforeVersionId === undefined ||
        afterVersionId === null ||
        afterVersionId === undefined)) ||
    !validContextEventIdempotency(idempotencyScopeKey, eventIdempotencyKey, requestFingerprint) ||
    !Object.prototype.hasOwnProperty.call(persisted, 'beforeVersionId') ||
    !Object.prototype.hasOwnProperty.call(persisted, 'afterVersionId') ||
    beforeVersionId === undefined ||
    afterVersionId === undefined ||
    (persisted.beforeVersionId !== null &&
      persisted.beforeVersionId !== undefined &&
      beforeVersionId === undefined) ||
    (persisted.afterVersionId !== null &&
      persisted.afterVersionId !== undefined &&
      afterVersionId === undefined) ||
    occurredAt === undefined ||
    isoDate(persisted.createdAt) === undefined
  ) {
    throw error(INTEGRITY_UNAVAILABLE);
  }
  const result: ConversationContextEventRecordV1 = {
    eventId,
    conversationId,
    tenantScope: scope,
    kind: persisted.kind as ConversationContextEventRecordV1['kind'],
    ...(datasetId === null || datasetId === undefined ? {} : { datasetId }),
    ...(beforeVersionId === null || beforeVersionId === undefined ? {} : { beforeVersionId }),
    ...(afterVersionId === null || afterVersionId === undefined ? {} : { afterVersionId }),
    sequence,
    occurredAt,
  };
  return Object.freeze(result);
}

function validContextEventIdempotency(
  scopeKey: unknown,
  key: unknown,
  fingerprint: unknown,
): boolean {
  if (scopeKey === null && key === null && fingerprint === null) return true;
  return (
    typeof scopeKey === 'string' &&
    idempotencyKey(scopeKey) !== undefined &&
    typeof key === 'string' &&
    idempotencyKey(key) !== undefined &&
    typeof fingerprint === 'string' &&
    /^[a-f0-9]{64}$/u.test(fingerprint)
  );
}

function summaryFromRow(row: unknown): ConversationSummaryRecordV1 {
  if (!isRecord(row)) throw error(INTEGRITY_UNAVAILABLE);
  const persisted = row as unknown as DdaConversationSummaryRowV1;
  const conversationId = stableId(persisted.conversationId);
  const scope = rowScope(persisted);
  const text = safeText(persisted.text, MAX_SUMMARY_LENGTH, true);
  const revision = positiveRevision(persisted.revision);
  const updatedAt = isoDate(persisted.updatedAt);
  if (
    conversationId === undefined ||
    scope === undefined ||
    scope.scopeType === 'organization' ||
    text === undefined ||
    revision === undefined ||
    updatedAt === undefined ||
    typeof persisted.summaryDigest !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(persisted.summaryDigest) ||
    persisted.summaryDigest !== digestText(text)
  ) {
    throw error(INTEGRITY_UNAVAILABLE);
  }
  return Object.freeze({
    conversationId,
    tenantScope: scope,
    text,
    revision,
    updatedAt,
  });
}

function limitValue(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1) return 1;
  return Math.min(limit, 50);
}

interface ConversationCursorV1 {
  readonly kind: 'conversation';
  readonly scopeKey: string;
  readonly updatedAt: string;
  readonly id: string;
}

interface MessageCursorV1 {
  readonly kind: 'message';
  readonly scopeKey: string;
  readonly conversationId: string;
  readonly sequence: number;
  readonly id: string;
}

function encodeOpaqueCursor(value: ConversationCursorV1 | MessageCursorV1): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeOpaqueCursor(
  cursor: string | undefined,
  kind: ConversationCursorV1['kind'] | MessageCursorV1['kind'],
): ConversationCursorV1 | MessageCursorV1 | undefined {
  if (cursor === undefined) return undefined;
  if (cursor.length < 16 || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(cursor)) {
    throw error('DDA_CONVERSATION_CURSOR_INVALID');
  }
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const value: unknown = JSON.parse(decoded);
    if (!isRecord(value) || value['kind'] !== kind) {
      throw error('DDA_CONVERSATION_CURSOR_INVALID');
    }
    const encoded = encodeOpaqueCursor(value as unknown as ConversationCursorV1 | MessageCursorV1);
    if (encoded !== cursor) throw error('DDA_CONVERSATION_CURSOR_INVALID');
    if (
      typeof value['scopeKey'] !== 'string' ||
      typeof value['id'] !== 'string' ||
      stableId(value['id']) === undefined ||
      (typeof value['conversationId'] === 'string' &&
        stableId(value['conversationId']) === undefined)
    ) {
      throw error('DDA_CONVERSATION_CURSOR_INVALID');
    }
    if (kind === 'conversation') {
      if (
        typeof value['updatedAt'] !== 'string' ||
        !parseStrictUtcTimestampV1(value['updatedAt']).accepted ||
        Object.keys(value).some((key) => !['kind', 'scopeKey', 'updatedAt', 'id'].includes(key))
      ) {
        throw error('DDA_CONVERSATION_CURSOR_INVALID');
      }
      return value as unknown as ConversationCursorV1;
    }
    if (
      typeof value['conversationId'] !== 'string' ||
      !Number.isSafeInteger(value['sequence']) ||
      (value['sequence'] as number) < 1 ||
      Object.keys(value).some(
        (key) => !['kind', 'scopeKey', 'conversationId', 'sequence', 'id'].includes(key),
      )
    ) {
      throw error('DDA_CONVERSATION_CURSOR_INVALID');
    }
    return value as unknown as MessageCursorV1;
  } catch (caught: unknown) {
    if (caught instanceof Error && caught.message === 'DDA_CONVERSATION_CURSOR_INVALID') {
      throw caught;
    }
    throw error('DDA_CONVERSATION_CURSOR_INVALID');
  }
}

function retryableTransactionError(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const code = (value as { readonly code?: unknown }).code;
  return code === 'P2002' || code === 'P2034';
}

function conversationData(
  input: NormalizedConversationInput,
  scope: ReturnType<typeof scopeColumns>,
  idempotency: {
    readonly scopeKey: string;
    readonly key: string;
    readonly fingerprint: string;
  },
): Record<string, unknown> {
  return {
    id: input.conversationId,
    ...scope,
    title: input.title,
    activeDatasetIds: [...input.activeDatasetIds],
    activeDatasetVersionIds: { ...input.activeDatasetVersionIds },
    dashboardId: input.dashboardId ?? null,
    filterContext: input.filterContext ?? null,
    retentionState: 'ACTIVE',
    retentionHold: input.retentionHold,
    nextSequence: 1,
    revision: input.revision,
    createIdempotencyScopeKey: idempotency.scopeKey,
    createIdempotencyKey: idempotency.key,
    createRequestFingerprint: idempotency.fingerprint,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function messageData(
  input: NormalizedMessageInput,
  scope: ReturnType<typeof scopeColumns>,
  sequence: number,
): Record<string, unknown> {
  return {
    id: input.messageId,
    ...scope,
    conversationId: input.conversationId,
    sequence,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: messageFingerprint(input),
    role: input.role,
    text: input.text,
    textDigest: digestText(input.text),
    textLength: input.text.length,
    datasetVersionId: input.datasetVersionId ?? null,
    createdAt: input.createdAt,
  };
}

function contextEventData(
  input: NormalizedContextEventInput,
  scope: ReturnType<typeof scopeColumns>,
  sequence: number,
  idempotency?: {
    readonly scopeKey: string;
    readonly key: string;
    readonly fingerprint: string;
  },
): Record<string, unknown> {
  return {
    id: input.eventId,
    ...scope,
    conversationId: input.conversationId,
    sequence,
    datasetId: input.datasetId ?? null,
    idempotencyScopeKey: idempotency?.scopeKey ?? null,
    idempotencyKey: idempotency?.key ?? null,
    requestFingerprint: idempotency?.fingerprint ?? null,
    kind: input.kind,
    beforeVersionId: input.beforeVersionId ?? null,
    afterVersionId: input.afterVersionId ?? null,
    occurredAt: input.occurredAt,
    createdAt: input.occurredAt,
  };
}

function contextAdvanceData(
  input: NormalizedContextAdvanceInput,
  scope: ReturnType<typeof scopeColumns>,
  sequence: number,
): Record<string, unknown> {
  return contextEventData(
    {
      scope: input.scope,
      eventId: input.eventId,
      conversationId: input.conversationId,
      kind: 'DATASET_VERSION_ADVANCED',
      datasetId: input.datasetId,
      beforeVersionId: input.beforeVersionId,
      afterVersionId: input.afterVersionId,
      occurredAt: input.occurredAt,
    },
    scope,
    sequence,
    {
      scopeKey: tenantScopeKeyV1(input.scope),
      key: input.idempotencyKey,
      fingerprint: contextAdvanceFingerprint(input),
    },
  );
}

function summaryData(
  input: NormalizedSummaryInput,
  scope: ReturnType<typeof scopeColumns>,
): Record<string, unknown> {
  return {
    conversationId: input.conversationId,
    ...scope,
    text: input.text,
    summaryDigest: digestText(input.text),
    revision: input.revision,
    updatedAt: input.updatedAt,
  };
}

async function reserveNextSequence(
  transaction: PrismaConversationTransactionClientV1,
  scope: ReturnType<typeof scopeColumns>,
  conversationId: string,
  currentRow: DdaConversationRowV1,
): Promise<number> {
  const nextSequence = validSequence(currentRow.nextSequence);
  if (nextSequence === undefined) throw error(INTEGRITY_UNAVAILABLE);
  const updated = await transaction.ddaConversation.updateMany({
    where: { ...scope, id: conversationId, nextSequence },
    data: { nextSequence: nextSequence + 1 },
  });
  if (updated.count !== 1) {
    throw Object.assign(error('DDA_CONVERSATION_SEQUENCE_RETRY'), { code: 'P2034' });
  }
  return nextSequence;
}

/** DDA-055/DDA-056: durable, content-bounded conversation storage with fail-closed scope checks. */
export class PrismaConversationRepositoryAdapter implements ConversationRepositoryPortV1 {
  private readonly client: PrismaConversationDatabaseClientV1;

  public constructor(client: PrismaConversationDatabaseClientV1 | DdaDatabaseClientV1) {
    // Production composition already narrows the generated client to DdaDatabaseClientV1;
    // this adapter owns the stricter conversation delegate contract at its boundary.
    this.client = client as unknown as PrismaConversationDatabaseClientV1;
  }

  public async create(record: ConversationRecordV1): Promise<ConversationRecordV1> {
    const input = conversationForWrite(record);
    const scope = scopeColumns(input.scope);
    const row = await this.client.ddaConversation.create({
      data: conversationData(input, scope, {
        scopeKey: tenantScopeKeyV1(input.scope),
        key: `direct:${input.conversationId}`,
        fingerprint: conversationFingerprint(input),
      }),
    });
    const conversation = requireConversation(row);
    if (
      !conversationMatchesInput(input, conversation) ||
      row.createIdempotencyScopeKey !== tenantScopeKeyV1(input.scope) ||
      row.createIdempotencyKey !== `direct:${input.conversationId}` ||
      row.createRequestFingerprint !== conversationFingerprint(input)
    ) {
      throw error(INTEGRITY_UNAVAILABLE);
    }
    return conversation;
  }

  public async createWithIdempotency(
    record: ConversationRecordV1,
    rawIdempotencyKey: string,
  ): Promise<ConversationCreateResultV1> {
    const input = conversationForWrite(record);
    const key = idempotencyKey(rawIdempotencyKey);
    if (key === undefined) throw error('DDA_CONVERSATION_IDEMPOTENCY_KEY_INVALID');
    const scope = scopeColumns(input.scope);
    const fingerprint = conversationFingerprint(input);
    const scopeKey = tenantScopeKeyV1(input.scope);
    return this.withTransactionRetry(async (transaction) => {
      const existing = await transaction.ddaConversation.findFirst({
        where: {
          ...scope,
          createIdempotencyScopeKey: scopeKey,
          createIdempotencyKey: key,
        },
      });
      if (existing !== null) {
        const conversation = requireConversation(existing);
        if (!scopeMatches(input.scope, conversation)) {
          throw error(INTEGRITY_UNAVAILABLE);
        }
        if (
          existing.createIdempotencyScopeKey !== scopeKey ||
          existing.createIdempotencyKey !== key ||
          !/^[a-f0-9]{64}$/u.test(existing.createRequestFingerprint)
        ) {
          throw error(INTEGRITY_UNAVAILABLE);
        }
        if (existing.createRequestFingerprint !== fingerprint) {
          return 'IDEMPOTENCY_CONFLICT';
        }
        return Object.freeze({ conversation, replayed: true });
      }
      const created = await transaction.ddaConversation.create({
        data: conversationData(input, scope, {
          scopeKey,
          key,
          fingerprint,
        }),
      });
      const conversation = requireConversation(created);
      if (
        !conversationMatchesInput(input, conversation) ||
        created.createIdempotencyScopeKey !== scopeKey ||
        created.createIdempotencyKey !== key ||
        created.createRequestFingerprint !== fingerprint
      ) {
        throw error(INTEGRITY_UNAVAILABLE);
      }
      return Object.freeze({ conversation, replayed: false });
    });
  }

  public async findById(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<ConversationRecordV1 | undefined> {
    const scope = scopeColumns(tenantScope);
    const id = stableId(conversationId);
    if (id === undefined) return undefined;
    const row = await this.client.ddaConversation.findFirst({ where: { ...scope, id } });
    if (row === null) return undefined;
    const conversation = requireConversation(row);
    if (!scopeMatches(tenantScope, conversation)) throw error(INTEGRITY_UNAVAILABLE);
    return conversation;
  }

  public async list(
    tenantScope: TenantScopeV1,
    cursor: string | undefined,
    limit: number,
  ): Promise<readonly ConversationRecordV1[]> {
    return (await this.listPage(tenantScope, cursor, limit)).items;
  }

  public async listPage(
    tenantScope: TenantScopeV1,
    cursor: string | undefined,
    limit: number,
  ): Promise<ConversationPageV1<ConversationRecordV1>> {
    const scope = scopeColumns(tenantScope);
    const capped = limitValue(limit);
    const parsedCursor = decodeOpaqueCursor(cursor, 'conversation') as
      | ConversationCursorV1
      | undefined;
    if (parsedCursor !== undefined) {
      if (parsedCursor.scopeKey !== tenantScopeKeyV1(tenantScope)) {
        throw error('DDA_CONVERSATION_CURSOR_INVALID');
      }
      const cursorRow = await this.client.ddaConversation.findFirst({
        where: { ...scope, id: parsedCursor.id },
      });
      if (cursorRow === null) throw error('DDA_CONVERSATION_CURSOR_INVALID');
      const cursorRecord = requireConversation(cursorRow);
      if (
        !scopeMatches(tenantScope, cursorRecord) ||
        cursorRecord.conversationId !== parsedCursor.id ||
        cursorRecord.updatedAt !== parsedCursor.updatedAt
      ) {
        throw error('DDA_CONVERSATION_CURSOR_INVALID');
      }
    }
    const where: Record<string, unknown> = { ...scope };
    if (parsedCursor !== undefined) {
      where['OR'] = [
        { updatedAt: { lt: new Date(parsedCursor.updatedAt) } },
        {
          updatedAt: new Date(parsedCursor.updatedAt),
          id: { lt: parsedCursor.id },
        },
      ];
    }
    const rows = await this.client.ddaConversation.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: capped + 1,
    });
    const records = rows.map((row) => {
      const record = requireConversation(row);
      if (!scopeMatches(tenantScope, record)) throw error(INTEGRITY_UNAVAILABLE);
      return record;
    });
    const items = records.slice(0, capped);
    const nextCursor =
      records.length > capped && items.at(-1) !== undefined
        ? encodeOpaqueCursor({
            kind: 'conversation',
            scopeKey: tenantScopeKeyV1(tenantScope),
            updatedAt: items.at(-1)?.updatedAt as string,
            id: items.at(-1)?.conversationId as string,
          })
        : undefined;
    return Object.freeze({
      items: Object.freeze(items),
      ...(nextCursor === undefined ? {} : { nextCursor }),
    });
  }

  public async update(record: ConversationRecordV1): Promise<ConversationRecordV1> {
    const input = conversationForWrite(record);
    const scope = scopeColumns(input.scope);
    return this.withTransactionRetry(async (transaction) => {
      const existingRow = await transaction.ddaConversation.findFirst({
        where: { ...scope, id: input.conversationId },
      });
      if (existingRow === null) throw error('DDA_CONVERSATION_NOT_FOUND');
      const existing = requireConversation(existingRow);
      if (!scopeMatches(input.scope, existing)) throw error('DDA_CONVERSATION_NOT_FOUND');
      const count = await transaction.ddaConversation.updateMany({
        where: { ...scope, id: input.conversationId },
        data: {
          title: input.title,
          activeDatasetIds: [...input.activeDatasetIds],
          activeDatasetVersionIds: { ...input.activeDatasetVersionIds },
          dashboardId: input.dashboardId ?? null,
          filterContext: input.filterContext ?? null,
          retentionState: existingRow.retentionState,
          retentionHold: existing.retentionHold || input.retentionHold,
          revision: input.revision,
          updatedAt: input.updatedAt,
        },
      });
      if (count.count !== 1) throw error('DDA_CONVERSATION_NOT_FOUND');
      const updated = await transaction.ddaConversation.findFirst({
        where: { ...scope, id: input.conversationId },
      });
      if (updated === null) throw error('DDA_CONVERSATION_NOT_FOUND');
      const updatedConversation = requireConversation(updated);
      if (
        !scopeMatches(input.scope, updatedConversation) ||
        updatedConversation.conversationId !== input.conversationId
      ) {
        throw error(INTEGRITY_UNAVAILABLE);
      }
      return updatedConversation;
    });
  }

  public async appendMessage(
    record: ConversationMessageRecordV1,
  ): Promise<ConversationMessageAppendResultV1> {
    const input = messageForWrite(record);
    const scope = scopeColumns(input.scope);
    return this.withTransactionRetry(async (transaction) => {
      const conversationRow = await transaction.ddaConversation.findFirst({
        where: { ...scope, id: input.conversationId },
      });
      if (conversationRow === null) throw error('DDA_CONVERSATION_NOT_FOUND');
      const conversation = requireConversation(conversationRow);
      if (!scopeMatches(input.scope, conversation)) throw error('DDA_CONVERSATION_NOT_FOUND');
      if (conversation.retentionHold) throw error('DDA_CONVERSATION_RETENTION_HOLD');

      const existingByKey = await transaction.ddaConversationMessage.findFirst({
        where: {
          ...scope,
          conversationId: input.conversationId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existingByKey !== null) {
        const existing = messageFromRow(existingByKey);
        if (
          !scopeMatches(input.scope, existing) ||
          existing.conversationId !== input.conversationId
        ) {
          throw error(INTEGRITY_UNAVAILABLE);
        }
        return messageFingerprint(input) === existingFingerprint(existing, existingByKey)
          ? Object.freeze({ outcome: 'REPLAY' as const, message: existing })
          : 'IDEMPOTENCY_CONFLICT';
      }
      const existingById = await transaction.ddaConversationMessage.findFirst({
        where: { ...scope, id: input.messageId },
      });
      if (existingById !== null) {
        const existing = messageFromRow(existingById);
        if (!scopeMatches(input.scope, existing) || existing.messageId !== input.messageId) {
          throw error(INTEGRITY_UNAVAILABLE);
        }
        throw error('DDA_CONVERSATION_MESSAGE_ID_CONFLICT');
      }
      const sequence = await reserveNextSequence(
        transaction,
        scope,
        input.conversationId,
        conversationRow,
      );
      const created = await transaction.ddaConversationMessage.create({
        data: messageData(input, scope, sequence),
      });
      const saved = messageFromRow(created);
      if (
        !scopeMatches(input.scope, saved) ||
        saved.messageId !== input.messageId ||
        saved.conversationId !== input.conversationId ||
        saved.idempotencyKey !== input.idempotencyKey ||
        saved.role !== input.role ||
        saved.text !== input.text ||
        (saved.datasetVersionId ?? undefined) !== (input.datasetVersionId ?? undefined) ||
        saved.sequence !== sequence
      ) {
        throw error(INTEGRITY_UNAVAILABLE);
      }
      const touched = await transaction.ddaConversation.updateMany({
        where: { ...scope, id: input.conversationId },
        data: { updatedAt: input.createdAt },
      });
      if (touched.count !== 1) throw error('DDA_CONVERSATION_NOT_FOUND');
      return saved;
    });
  }

  public async listMessages(
    tenantScope: TenantScopeV1,
    conversationId: string,
    beforeCursor: string | undefined,
    limit: number,
  ): Promise<readonly ConversationMessageRecordV1[]> {
    return (await this.listMessagesPage(tenantScope, conversationId, beforeCursor, limit)).items;
  }

  public async listMessagesPage(
    tenantScope: TenantScopeV1,
    conversationId: string,
    beforeCursor: string | undefined,
    limit: number,
  ): Promise<ConversationPageV1<ConversationMessageRecordV1>> {
    const scope = scopeColumns(tenantScope);
    const id = stableId(conversationId);
    if (id === undefined) {
      return Object.freeze({ items: Object.freeze([]) });
    }
    const conversationRow = await this.client.ddaConversation.findFirst({
      where: { ...scope, id },
    });
    if (conversationRow === null) return Object.freeze({ items: Object.freeze([]) });
    const conversation = requireConversation(conversationRow);
    if (!scopeMatches(tenantScope, conversation)) throw error(INTEGRITY_UNAVAILABLE);
    const capped = limitValue(limit);
    const parsedCursor = decodeOpaqueCursor(beforeCursor, 'message') as MessageCursorV1 | undefined;
    if (parsedCursor !== undefined) {
      if (
        parsedCursor.scopeKey !== tenantScopeKeyV1(tenantScope) ||
        parsedCursor.conversationId !== id
      ) {
        throw error('DDA_CONVERSATION_CURSOR_INVALID');
      }
      const cursorRow = await this.client.ddaConversationMessage.findFirst({
        where: { ...scope, conversationId: id, id: parsedCursor.id },
      });
      if (cursorRow === null) throw error('DDA_CONVERSATION_CURSOR_INVALID');
      const cursorMessage = messageFromRow(cursorRow);
      if (
        !scopeMatches(tenantScope, cursorMessage) ||
        cursorMessage.conversationId !== id ||
        cursorMessage.messageId !== parsedCursor.id ||
        cursorMessage.sequence !== parsedCursor.sequence
      ) {
        throw error('DDA_CONVERSATION_CURSOR_INVALID');
      }
    }
    const where: Record<string, unknown> = { ...scope, conversationId: id };
    if (parsedCursor !== undefined) {
      where['OR'] = [
        { sequence: { lt: parsedCursor.sequence } },
        { sequence: parsedCursor.sequence, id: { lt: parsedCursor.id } },
      ];
    }
    const rows = await this.client.ddaConversationMessage.findMany({
      where,
      orderBy: [{ sequence: 'desc' }, { id: 'desc' }],
      take: capped + 1,
    });
    const messages = rows.map((row) => {
      const message = messageFromRow(row);
      if (!scopeMatches(tenantScope, message) || message.conversationId !== id) {
        throw error(INTEGRITY_UNAVAILABLE);
      }
      return message;
    });
    const hasMore = messages.length > capped;
    const items = messages.slice(0, capped).reverse();
    const nextCursor =
      hasMore && items[0] !== undefined
        ? encodeOpaqueCursor({
            kind: 'message',
            scopeKey: tenantScopeKeyV1(tenantScope),
            conversationId: id,
            sequence: items[0].sequence,
            id: items[0].messageId,
          })
        : undefined;
    return Object.freeze({
      items: Object.freeze(items),
      ...(nextCursor === undefined ? {} : { nextCursor }),
    });
  }

  public async appendContextEvent(
    record: ConversationContextEventRecordV1,
  ): Promise<ConversationContextEventRecordV1> {
    const input = contextEventForWrite(record);
    const scope = scopeColumns(input.scope);
    return this.withTransactionRetry(async (transaction) => {
      const conversationRow = await transaction.ddaConversation.findFirst({
        where: { ...scope, id: input.conversationId },
      });
      if (conversationRow === null) throw error('DDA_CONVERSATION_NOT_FOUND');
      const conversation = requireConversation(conversationRow);
      if (!scopeMatches(input.scope, conversation)) throw error('DDA_CONVERSATION_NOT_FOUND');
      const created = await transaction.ddaConversationContextEvent.create({
        data: contextEventData(
          input,
          scope,
          await reserveNextSequence(transaction, scope, input.conversationId, conversationRow),
        ),
      });
      const saved = contextEventFromRow(created);
      if (
        !scopeMatches(input.scope, saved) ||
        saved.eventId !== input.eventId ||
        saved.conversationId !== input.conversationId ||
        saved.kind !== input.kind ||
        (saved.beforeVersionId ?? undefined) !== (input.beforeVersionId ?? undefined) ||
        (saved.afterVersionId ?? undefined) !== (input.afterVersionId ?? undefined) ||
        (saved.sequence ?? 0) < 1
      ) {
        throw error(INTEGRITY_UNAVAILABLE);
      }
      return saved;
    });
  }

  public async findContextEventByIdempotency(
    tenantScope: TenantScopeV1,
    conversationId: string,
    rawIdempotencyKey: string,
  ): Promise<ConversationContextEventRecordV1 | undefined> {
    const scope = scopeColumns(tenantScope);
    const id = stableId(conversationId);
    const key = idempotencyKey(rawIdempotencyKey);
    if (id === undefined || key === undefined) return undefined;
    const row = await this.client.ddaConversationContextEvent.findFirst({
      where: {
        ...scope,
        conversationId: id,
        idempotencyScopeKey: tenantScopeKeyV1(tenantScope),
        idempotencyKey: key,
      },
    });
    if (row === null) return undefined;
    const event = contextEventFromRow(row);
    if (
      !scopeMatches(tenantScope, event) ||
      event.conversationId !== id ||
      row.idempotencyScopeKey !== tenantScopeKeyV1(tenantScope) ||
      row.idempotencyKey !== key ||
      typeof row.requestFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(row.requestFingerprint)
    ) {
      throw error(INTEGRITY_UNAVAILABLE);
    }
    return event;
  }

  public async advanceContext(
    rawInput: ConversationContextAdvanceInputV1,
  ): Promise<ConversationContextAdvanceResultV1> {
    const input = contextAdvanceForWrite(rawInput);
    const scope = scopeColumns(input.scope);
    const scopeKey = tenantScopeKeyV1(input.scope);
    const fingerprint = contextAdvanceFingerprint(input);
    return this.withTransactionRetry(async (transaction) => {
      const existingEvent = await transaction.ddaConversationContextEvent.findFirst({
        where: {
          ...scope,
          conversationId: input.conversationId,
          idempotencyScopeKey: scopeKey,
          idempotencyKey: input.idempotencyKey,
        },
      });
      const conversationRow = await transaction.ddaConversation.findFirst({
        where: { ...scope, id: input.conversationId },
      });
      if (conversationRow === null) throw error('DDA_CONVERSATION_NOT_FOUND');
      const conversation = requireConversation(conversationRow);
      if (!scopeMatches(input.scope, conversation)) throw error('DDA_CONVERSATION_NOT_FOUND');
      if (existingEvent !== null) {
        const event = contextEventFromRow(existingEvent);
        if (
          !scopeMatches(input.scope, event) ||
          event.conversationId !== input.conversationId ||
          existingEvent.idempotencyScopeKey !== scopeKey ||
          existingEvent.idempotencyKey !== input.idempotencyKey ||
          typeof existingEvent.requestFingerprint !== 'string' ||
          !/^[a-f0-9]{64}$/u.test(existingEvent.requestFingerprint)
        ) {
          throw error(INTEGRITY_UNAVAILABLE);
        }
        if (existingEvent.requestFingerprint !== fingerprint) return 'IDEMPOTENCY_CONFLICT';
        return Object.freeze({ outcome: 'REPLAY' as const, conversation, event });
      }
      if (
        conversation.activeDatasetVersionIds[input.datasetId] !== input.beforeVersionId ||
        input.beforeVersionId === input.afterVersionId
      ) {
        return 'CONTEXT_CAS_CONFLICT';
      }
      const updatedAt = input.occurredAt;
      const nextVersions = {
        ...conversation.activeDatasetVersionIds,
        [input.datasetId]: input.afterVersionId,
      };
      const updated = await transaction.ddaConversation.updateMany({
        where: { ...scope, id: input.conversationId, revision: conversation.revision },
        data: {
          activeDatasetVersionIds: nextVersions,
          revision: conversation.revision + 1,
          updatedAt,
        },
      });
      if (updated.count !== 1) {
        const concurrentEvent = await transaction.ddaConversationContextEvent.findFirst({
          where: {
            ...scope,
            conversationId: input.conversationId,
            idempotencyScopeKey: scopeKey,
            idempotencyKey: input.idempotencyKey,
          },
        });
        if (concurrentEvent !== null) {
          const event = contextEventFromRow(concurrentEvent);
          if (
            concurrentEvent.requestFingerprint !== fingerprint ||
            event.conversationId !== input.conversationId
          ) {
            return 'IDEMPOTENCY_CONFLICT';
          }
          const currentRow = await transaction.ddaConversation.findFirst({
            where: { ...scope, id: input.conversationId },
          });
          if (currentRow === null) throw error(INTEGRITY_UNAVAILABLE);
          return Object.freeze({
            outcome: 'REPLAY' as const,
            conversation: requireConversation(currentRow),
            event,
          });
        }
        return 'CONTEXT_CAS_CONFLICT';
      }
      const sequence = await reserveNextSequence(
        transaction,
        scope,
        input.conversationId,
        conversationRow,
      );
      const createdEvent = await transaction.ddaConversationContextEvent.create({
        data: contextAdvanceData(input, scope, sequence),
      });
      const event = contextEventFromRow(createdEvent);
      if (
        !scopeMatches(input.scope, event) ||
        event.conversationId !== input.conversationId ||
        event.eventId !== input.eventId ||
        event.datasetId !== input.datasetId ||
        event.beforeVersionId !== input.beforeVersionId ||
        event.afterVersionId !== input.afterVersionId ||
        event.sequence !== sequence ||
        createdEvent.idempotencyScopeKey !== scopeKey ||
        createdEvent.idempotencyKey !== input.idempotencyKey ||
        createdEvent.requestFingerprint !== fingerprint
      ) {
        throw error(INTEGRITY_UNAVAILABLE);
      }
      const updatedRow = await transaction.ddaConversation.findFirst({
        where: { ...scope, id: input.conversationId },
      });
      if (updatedRow === null) throw error(INTEGRITY_UNAVAILABLE);
      const updatedConversation = requireConversation(updatedRow);
      if (
        updatedConversation.activeDatasetVersionIds[input.datasetId] !== input.afterVersionId ||
        updatedConversation.revision !== conversation.revision + 1
      ) {
        throw error(INTEGRITY_UNAVAILABLE);
      }
      return Object.freeze({
        outcome: 'ADVANCED' as const,
        conversation: updatedConversation,
        event,
      });
    });
  }

  public async listContextEvents(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<readonly ConversationContextEventRecordV1[]> {
    const scope = scopeColumns(tenantScope);
    const id = stableId(conversationId);
    if (id === undefined) return Object.freeze([]);
    const conversationRow = await this.client.ddaConversation.findFirst({
      where: { ...scope, id },
    });
    if (conversationRow === null) {
      return Object.freeze([]);
    }
    const conversation = requireConversation(conversationRow);
    if (!scopeMatches(tenantScope, conversation)) throw error(INTEGRITY_UNAVAILABLE);
    const rows = await this.client.ddaConversationContextEvent.findMany({
      where: { ...scope, conversationId: id },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    });
    return Object.freeze(
      rows.map((row) => {
        const event = contextEventFromRow(row);
        if (!scopeMatches(tenantScope, event) || event.conversationId !== id) {
          throw error(INTEGRITY_UNAVAILABLE);
        }
        return event;
      }),
    );
  }

  public async saveSummary(
    record: ConversationSummaryRecordV1,
  ): Promise<ConversationSummaryRecordV1 | 'REVISION_CONFLICT'> {
    const input = summaryForWrite(record);
    const scope = scopeColumns(input.scope);
    return this.withTransactionRetry(async (transaction) => {
      const conversationRow = await transaction.ddaConversation.findFirst({
        where: { ...scope, id: input.conversationId },
      });
      if (conversationRow === null) throw error('DDA_CONVERSATION_NOT_FOUND');
      const conversation = requireConversation(conversationRow);
      if (!scopeMatches(input.scope, conversation)) throw error('DDA_CONVERSATION_NOT_FOUND');
      const existingRow = await transaction.ddaConversationSummary.findFirst({
        where: { ...scope, conversationId: input.conversationId },
      });
      if (existingRow === null) {
        if (input.revision !== 1) return 'REVISION_CONFLICT';
        const created = await transaction.ddaConversationSummary.create({
          data: summaryData(input, scope),
        });
        const saved = summaryFromRow(created);
        if (
          !scopeMatches(input.scope, saved) ||
          saved.conversationId !== input.conversationId ||
          saved.revision !== input.revision ||
          saved.text !== input.text
        ) {
          throw error(INTEGRITY_UNAVAILABLE);
        }
        return saved;
      }
      const existing = summaryFromRow(existingRow);
      if (input.revision !== existing.revision + 1) return 'REVISION_CONFLICT';
      const updated = await transaction.ddaConversationSummary.updateMany({
        where: { ...scope, conversationId: input.conversationId, revision: existing.revision },
        data: {
          text: input.text,
          summaryDigest: digestText(input.text),
          revision: input.revision,
          updatedAt: input.updatedAt,
        },
      });
      if (updated.count !== 1) return 'REVISION_CONFLICT';
      const updatedRow = await transaction.ddaConversationSummary.findFirst({
        where: { ...scope, conversationId: input.conversationId },
      });
      if (updatedRow === null) throw error('DDA_CONVERSATION_SUMMARY_UNAVAILABLE');
      const saved = summaryFromRow(updatedRow);
      if (
        !scopeMatches(input.scope, saved) ||
        saved.conversationId !== input.conversationId ||
        saved.revision !== input.revision ||
        saved.text !== input.text
      ) {
        throw error(INTEGRITY_UNAVAILABLE);
      }
      return saved;
    });
  }

  public async findSummary(
    tenantScope: TenantScopeV1,
    conversationId: string,
  ): Promise<ConversationSummaryRecordV1 | undefined> {
    const scope = scopeColumns(tenantScope);
    const id = stableId(conversationId);
    if (id === undefined) return undefined;
    const conversationRow = await this.client.ddaConversation.findFirst({
      where: { ...scope, id },
    });
    if (conversationRow === null) {
      return undefined;
    }
    const conversation = requireConversation(conversationRow);
    if (!scopeMatches(tenantScope, conversation)) throw error(INTEGRITY_UNAVAILABLE);
    const row = await this.client.ddaConversationSummary.findFirst({
      where: { ...scope, conversationId: id },
    });
    if (row === null) return undefined;
    const summary = summaryFromRow(row);
    if (!scopeMatches(tenantScope, summary) || summary.conversationId !== id) {
      throw error(INTEGRITY_UNAVAILABLE);
    }
    return summary;
  }

  private async withTransactionRetry<TValue>(
    work: (transaction: PrismaConversationTransactionClientV1) => Promise<TValue>,
  ): Promise<TValue> {
    let attempt = 0;
    while (true) {
      try {
        return await this.client.$transaction(work);
      } catch (caught: unknown) {
        attempt += 1;
        if (attempt >= MAX_TRANSACTION_RETRIES || !retryableTransactionError(caught)) {
          throw caught;
        }
      }
    }
  }
}

function existingFingerprint(
  existing: ConversationMessageRecordV1,
  row: DdaConversationMessageRowV1,
): string {
  if (
    typeof row.requestFingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(row.requestFingerprint)
  ) {
    throw error(INTEGRITY_UNAVAILABLE);
  }
  return row.requestFingerprint ===
    messageFingerprint({
      scope: existing.tenantScope,
      messageId: existing.messageId,
      conversationId: existing.conversationId,
      role: existing.role,
      text: existing.text,
      idempotencyKey: existing.idempotencyKey,
      ...(existing.datasetVersionId === undefined
        ? {}
        : { datasetVersionId: existing.datasetVersionId }),
      createdAt: new Date(existing.createdAt),
    })
    ? row.requestFingerprint
    : (() => {
        throw error(INTEGRITY_UNAVAILABLE);
      })();
}

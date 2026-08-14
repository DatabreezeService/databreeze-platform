import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import {
  parseV4Contract,
  type ContractV4SchemaId,
  type DdaConversationListAccepted,
  type DdaConversationLoadAccepted,
  type DdaConversationSummary,
} from '@databreeze/contracts/v4';
import { isAgentGrantLevelV1, isMembershipAccessPresetV1 } from '@databreeze/domain/permissions/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  AGENT_AUTHORITY_PORT,
  FailClosedAgentAuthorityAdapter,
  type AgentAuthorityDecisionV1,
  type AgentAuthorityPortV1,
} from '../../agent/application/agent-runtime.port.js';
import type { AgentTurnProblemCodeV1 } from '../../agent/application/agent-tool.types.js';
import { createFailClosedDashboardAuthorizationV1 } from '../../adapter/fail-closed-etl.adapters.js';
import { DASHBOARD_AUTHORIZATION_PORT } from '../../dashboard/application/dashboard-http-ports.js';
import type { DashboardAuthorizationPortV1 } from '../../dashboard/application/dashboard-authorization.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';
import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { ConversationProblemCodeV1 } from '../application/conversation.service.js';
import type { ConversationMessageRoleV1 } from '../application/conversation-repository.port.js';
import { ConversationService } from '../application/conversation.service.js';

const AUTHORITY_FIELDS = new Set([
  'context',
  'tenantScope',
  'memberAuthorized',
  'agentLevel',
  'effectiveAgentLevel',
  'accessPreset',
  'deniedDatasetIds',
  'requiredIamAction',
  'authorization',
  'memberId',
  'actorId',
  'correlationId',
  'organizationId',
  'workspaceId',
  'projectId',
  'authorized',
]);
const MAX_PAGE_LIMIT = 50;
const MAX_CURSOR_LENGTH = 512;
const MAX_TITLE_LENGTH = 200;
const MAX_DATASET_COUNT = 8;
const MAX_FILTER_CONTEXT_LENGTH = 4_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;
const MAX_PERSISTED_MESSAGE_LENGTH = 8_000;
const MAX_PERSISTED_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_AUTHORITY_SCAN_DEPTH = 8;
const CONVERSATION_LIST_ACCEPTED_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/dda-conversation-list-accepted' as const;
const CONVERSATION_LOAD_ACCEPTED_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/dda-conversation-load-accepted' as const;

const CREATE_BODY_FIELDS = new Set([
  'title',
  'datasetIds',
  'datasetVersionIds',
  'dashboardId',
  'filterContext',
  'idempotencyKey',
]);
const LIST_QUERY_FIELDS = new Set(['cursor', 'limit']);
const LOAD_QUERY_FIELDS = new Set(['beforeCursor', 'limit']);
const AGENT_AUTHORITY_FAILURE_CODES = new Set<AgentTurnProblemCodeV1>([
  'UNKNOWN_TOOL',
  'INSUFFICIENT_AGENT_LEVEL',
  'DATASET_RESTRICTED',
  'OVER_BOUND_SAMPLE',
  'STALE_CONTEXT',
  'BUDGET_DENIED',
  'PROVIDER_DISABLED',
  'PROVIDER_TIMEOUT',
  'MALFORMED_TOOL_CALL',
  'TOOL_LOOP_LIMIT',
  'REPEATED_TOOL_CALL',
  'EVIDENCE_UNAUTHORIZED',
  'UNCONFIRMED_DASHBOARD_APPLY',
  'UNAUTHORIZED',
  'CONVERSATION_NOT_FOUND',
  'PROVIDER_FAILURE',
]);
const CONVERSATION_PROBLEM_CODES = new Set<ConversationProblemCodeV1>([
  'DDA_CONVERSATION_NOT_FOUND',
  'DDA_CONVERSATION_UNAUTHORIZED',
  'DDA_CONVERSATION_RETENTION_HOLD',
  'DDA_CONVERSATION_INVALID_ATTACHMENT',
  'DDA_CONVERSATION_IDEMPOTENCY_CONFLICT',
  'DDA_CONVERSATION_MESSAGE_IDEMPOTENCY_CONFLICT',
  'DDA_CONVERSATION_INTEGRITY_UNAVAILABLE',
  'DDA_CONVERSATION_SUMMARY_TOO_LONG',
  'DDA_CONVERSATION_SUMMARY_CONFLICT',
]);
const INVALID_CURSOR_ERROR_CODES = new Set([
  'DDA_CONVERSATION_CURSOR_INVALID',
  'CONVERSATION_CURSOR_INVALID',
  'CURSOR_INVALID',
  'STALE_CURSOR',
  'UNKNOWN_CURSOR',
  'CURSOR_NOT_FOUND',
]);
const DATASET_VERSION_AUTHORITY_DENIAL_CODES = new Set([
  'NOT_FOUND',
  'FORBIDDEN',
  'DATASET_RESTRICTED',
  'INVALID_SCOPE',
  'VERSION_DATASET_MISMATCH',
]);
const DATASET_VERSION_AUTHORITY_CODES = new Set([
  ...DATASET_VERSION_AUTHORITY_DENIAL_CODES,
  'AUTHORIZATION_UNAVAILABLE',
]);
const CONTEXT_EVENT_KINDS = new Set([
  'CONTEXT_RESTORED',
  'DATASET_VERSION_ADVANCED',
  'DATASET_ATTACHED',
  'DATASET_DETACHED',
  'DASHBOARD_VERSION_ADVANCED',
  'FILTER_CONTEXT_CHANGED',
]);

type PlainRecord = Record<string, unknown>;

function isObjectRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is PlainRecord {
  if (!isObjectRecord(value)) return false;
  try {
    const prototype = Reflect.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item: unknown): item is string => typeof item === 'string')
  );
}

function recordEntries(value: PlainRecord): readonly (readonly [string, unknown])[] | undefined {
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string')) return undefined;
    return (keys as string[]).map((key) => [key, value[key]] as const);
  } catch {
    return undefined;
  }
}

function hasClientAuthorityField(value: unknown): boolean {
  const pending: { readonly value: unknown; readonly depth: number }[] = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || typeof current.value !== 'object' || current.value === null) {
      continue;
    }
    if (seen.has(current.value)) continue;
    seen.add(current.value);
    if (current.depth >= MAX_AUTHORITY_SCAN_DEPTH) return true;
    if (Array.isArray(current.value)) {
      for (const child of current.value) pending.push({ value: child, depth: current.depth + 1 });
      continue;
    }
    try {
      for (const key of Object.keys(current.value)) {
        if (AUTHORITY_FIELDS.has(key)) return true;
        pending.push({
          value: (current.value as PlainRecord)[key],
          depth: current.depth + 1,
        });
      }
    } catch {
      return true;
    }
  }
  return false;
}

function parsePageLimit(value: unknown, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const candidate =
    typeof value === 'string' && /^\d+$/u.test(value)
      ? Number(value)
      : typeof value === 'number'
        ? value
        : Number.NaN;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > MAX_PAGE_LIMIT) {
    throw new BadRequestException();
  }
  return candidate;
}

function parseStableIdentifierOrBadRequest(value: unknown): string {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new BadRequestException();
  return parsed.value;
}

function boundedText(
  value: unknown,
  maximumLength: number,
  options: { readonly trim: boolean; readonly requireNonEmpty: boolean },
): string | undefined {
  if (typeof value !== 'string' || value.length > maximumLength || /\p{Cc}/u.test(value)) {
    return undefined;
  }
  const normalized = value.normalize('NFC');
  const result = options.trim ? normalized.trim() : normalized;
  if (result.length > maximumLength) return undefined;
  if (options.requireNonEmpty && result.length === 0) return undefined;
  return result;
}

function rejectUnknownFields(value: PlainRecord, allowed: ReadonlySet<string>): void {
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !allowed.has(key))) {
    throw new BadRequestException();
  }
}

function parseCreateBody(value: unknown): ConversationCreateDtoV1 {
  if (!isPlainRecord(value)) throw new BadRequestException();
  rejectUnknownFields(value, CREATE_BODY_FIELDS);

  const title = boundedText(value['title'], MAX_TITLE_LENGTH, {
    trim: true,
    requireNonEmpty: true,
  });
  if (title === undefined) throw new BadRequestException();

  const datasetScope = parseDatasetScope(value['datasetIds'], value['datasetVersionIds']);
  if (datasetScope === undefined) throw new BadRequestException();
  const { datasetIds, datasetVersionIds } = datasetScope;

  let dashboardId: string | undefined;
  if (value['dashboardId'] !== undefined) {
    dashboardId = parseStableIdentifierOrBadRequest(value['dashboardId']);
  }
  let filterContext: string | undefined;
  if (value['filterContext'] !== undefined) {
    filterContext = boundedText(value['filterContext'], MAX_FILTER_CONTEXT_LENGTH, {
      trim: false,
      requireNonEmpty: false,
    });
    if (filterContext === undefined) throw new BadRequestException();
  }
  const idempotencyKey = boundedText(value['idempotencyKey'], MAX_IDEMPOTENCY_KEY_LENGTH, {
    trim: true,
    requireNonEmpty: true,
  });
  if (idempotencyKey === undefined) throw new BadRequestException();

  return Object.freeze({
    title,
    datasetIds: Object.freeze(datasetIds),
    datasetVersionIds: Object.freeze(datasetVersionIds),
    ...(dashboardId === undefined ? {} : { dashboardId }),
    ...(filterContext === undefined ? {} : { filterContext }),
    idempotencyKey,
  });
}

function parseCursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    value.length < 16 ||
    value.length > MAX_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw new BadRequestException();
  }
  return value;
}

function parseQuery(value: unknown, allowed: ReadonlySet<string>): PlainRecord {
  // Nest's ValidationPipe returns the validated DTO class instance here. Keep
  // the strict own-key allowlist, but do not reject that framework-owned
  // prototype as if it were an untrusted domain object.
  if (!isObjectRecord(value)) throw new BadRequestException();
  rejectUnknownFields(value, allowed);
  return value;
}

const SAFE_CONVERSATION_ERROR = Object.freeze({ error: 'CONVERSATION_REJECTED' });

export const CONVERSATION_CONTEXT_VERSION_AUTHORITY_PORT = Symbol(
  'CONVERSATION_CONTEXT_VERSION_AUTHORITY_PORT',
);

export type ConversationContextVersionAuthorityDecisionV1 =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly code:
        | 'AUTHORIZATION_UNAVAILABLE'
        | 'NOT_FOUND'
        | 'FORBIDDEN'
        | 'DATASET_RESTRICTED'
        | 'INVALID_SCOPE'
        | 'VERSION_DATASET_MISMATCH';
    };

export interface ConversationContextVersionAuthorityPortV1 {
  authorizeDatasetVersion(input: {
    readonly context: IamTenantContextV1;
    readonly datasetId: string;
    readonly datasetVersionId: string;
  }): Promise<ConversationContextVersionAuthorityDecisionV1>;
}

export class UnavailableConversationContextVersionAuthorityAdapter
  implements ConversationContextVersionAuthorityPortV1
{
  public authorizeDatasetVersion(input: {
    readonly context: IamTenantContextV1;
    readonly datasetId: string;
    readonly datasetVersionId: string;
  }): Promise<ConversationContextVersionAuthorityDecisionV1> {
    void input;
    return Promise.resolve({ allowed: false, code: 'AUTHORIZATION_UNAVAILABLE' });
  }
}

type PublicConversationDtoV1 = DdaConversationSummary;

interface PublicConversationMessageDtoV1 {
  readonly messageId: string;
  readonly conversationId: string;
  readonly role: ConversationMessageRoleV1;
  readonly text: string;
  readonly sequence: number;
  readonly datasetVersionId?: string;
  readonly createdAt: string;
}

interface PublicConversationContextEventDtoV1 {
  readonly eventId: string;
  readonly conversationId: string;
  readonly kind: string;
  readonly datasetId?: string;
  readonly beforeVersionId?: string;
  readonly afterVersionId?: string;
  readonly sequence: number;
  readonly occurredAt: string;
}

interface ValidatedConversationV1 {
  readonly conversationId: string;
  readonly title: string;
  readonly activeDatasetIds: readonly string[];
  readonly activeDatasetVersionIds: Readonly<Record<string, string>>;
  readonly dashboardId?: string;
  readonly filterContext?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tenantScope: TenantScopeV1;
  readonly retentionHold: boolean;
}

interface ValidatedConversationMessageV1 extends PublicConversationMessageDtoV1 {
  readonly tenantScope: TenantScopeV1;
}

interface DatasetScopeV1 {
  readonly datasetIds: readonly string[];
  readonly datasetVersionIds: Readonly<Record<string, string>>;
}

function safeServiceUnavailable(): never {
  throw new HttpException(SAFE_CONVERSATION_ERROR, HttpStatus.SERVICE_UNAVAILABLE);
}

function parsePublicContract<TValue>(schemaId: ContractV4SchemaId, value: unknown): TValue {
  const parsed = parseV4Contract<TValue>(schemaId, value);
  if (!parsed.accepted) safeServiceUnavailable();
  return parsed.value;
}

function parseAgentAuthorityDecision(value: unknown): AgentAuthorityDecisionV1 | undefined {
  if (!isPlainRecord(value) || typeof value['allowed'] !== 'boolean') return undefined;
  const allowed = value['allowed'];
  if (allowed === false) {
    if (
      Reflect.ownKeys(value).some(
        (key) => typeof key !== 'string' || !new Set(['allowed', 'code']).has(key),
      ) ||
      typeof value['code'] !== 'string' ||
      !AGENT_AUTHORITY_FAILURE_CODES.has(value['code'] as AgentTurnProblemCodeV1)
    ) {
      return undefined;
    }
    return Object.freeze({
      allowed: false as const,
      code: value['code'] as AgentTurnProblemCodeV1,
    });
  }
  if (
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== 'string' ||
        !new Set(['allowed', 'effectiveAgentLevel', 'accessPreset', 'deniedDatasetIds']).has(key),
    ) ||
    !isAgentGrantLevelV1(value['effectiveAgentLevel']) ||
    !isMembershipAccessPresetV1(value['accessPreset']) ||
    !isStringArray(value['deniedDatasetIds'])
  ) {
    return undefined;
  }
  const deniedDatasetIds: string[] = [];
  const seen = new Set<string>();
  for (const valueId of value['deniedDatasetIds']) {
    const parsed = parseStableIdentifierV1(valueId);
    if (!parsed.accepted || seen.has(parsed.value)) return undefined;
    seen.add(parsed.value);
    deniedDatasetIds.push(parsed.value);
  }
  return Object.freeze({
    allowed: true as const,
    effectiveAgentLevel: value['effectiveAgentLevel'],
    accessPreset: value['accessPreset'],
    deniedDatasetIds: Object.freeze(deniedDatasetIds),
  });
}

function parseDatasetVersionAuthorityDecision(
  value: unknown,
): ConversationContextVersionAuthorityDecisionV1 | undefined {
  if (!isPlainRecord(value) || typeof value['allowed'] !== 'boolean') return undefined;
  if (value['allowed'] === true) {
    return Reflect.ownKeys(value).every((key) => key === 'allowed')
      ? Object.freeze({ allowed: true as const })
      : undefined;
  }
  return typeof value['code'] === 'string' &&
    DATASET_VERSION_AUTHORITY_CODES.has(value['code']) &&
    Reflect.ownKeys(value).every((key) => key === 'allowed' || key === 'code')
    ? Object.freeze({
        allowed: false as const,
        code: value['code'] as Exclude<
          ConversationContextVersionAuthorityDecisionV1,
          { readonly allowed: true }
        >['code'],
      })
    : undefined;
}

function parseDatasetScope(
  rawDatasetIds: unknown,
  rawDatasetVersionIds: unknown,
): DatasetScopeV1 | undefined {
  if (
    !Array.isArray(rawDatasetIds) ||
    rawDatasetIds.length < 1 ||
    rawDatasetIds.length > MAX_DATASET_COUNT ||
    !isPlainRecord(rawDatasetVersionIds)
  ) {
    return undefined;
  }
  const datasetIds: string[] = [];
  const datasetIdSet = new Set<string>();
  for (const rawDatasetId of rawDatasetIds) {
    const parsed = parseStableIdentifierV1(rawDatasetId);
    if (!parsed.accepted || datasetIdSet.has(parsed.value)) return undefined;
    datasetIdSet.add(parsed.value);
    datasetIds.push(parsed.value);
  }
  const datasetVersionIds: Record<string, string> = {};
  const mappedDatasetIds = new Set<string>();
  const entries = recordEntries(rawDatasetVersionIds);
  if (entries === undefined) return undefined;
  for (const [rawDatasetId, rawDatasetVersionId] of entries) {
    const datasetId = parseStableIdentifierV1(rawDatasetId);
    const datasetVersionId = parseStableIdentifierV1(rawDatasetVersionId);
    if (
      !datasetId.accepted ||
      !datasetVersionId.accepted ||
      !datasetIdSet.has(datasetId.value) ||
      mappedDatasetIds.has(datasetId.value)
    ) {
      return undefined;
    }
    mappedDatasetIds.add(datasetId.value);
    datasetVersionIds[datasetId.value] = datasetVersionId.value;
  }
  if (mappedDatasetIds.size !== datasetIds.length) return undefined;
  return Object.freeze({
    datasetIds: Object.freeze(datasetIds),
    datasetVersionIds: Object.freeze(datasetVersionIds),
  });
}

function parsePersistedConversation(
  value: unknown,
  expectedTenantScope: TenantScopeV1,
): ValidatedConversationV1 {
  if (!isPlainRecord(value)) safeServiceUnavailable();
  const parsedScope = parseTenantScopeV1(value['tenantScope']);
  if (!parsedScope.accepted || !tenantScopesEqualV1(parsedScope.value, expectedTenantScope)) {
    safeServiceUnavailable();
  }
  const conversationId = parseStableIdentifierV1(value['conversationId']);
  const title = boundedText(value['title'], MAX_TITLE_LENGTH, {
    trim: true,
    requireNonEmpty: true,
  });
  const datasetScope = parseDatasetScope(
    value['activeDatasetIds'],
    value['activeDatasetVersionIds'],
  );
  let dashboardId: string | undefined;
  if (value['dashboardId'] !== undefined) {
    const parsedDashboardId = parseStableIdentifierV1(value['dashboardId']);
    if (!parsedDashboardId.accepted) safeServiceUnavailable();
    dashboardId = parsedDashboardId.value;
  }
  const filterContext =
    value['filterContext'] === undefined
      ? undefined
      : boundedText(value['filterContext'], MAX_FILTER_CONTEXT_LENGTH, {
          trim: false,
          requireNonEmpty: false,
        });
  const createdAt = parseStrictUtcTimestampV1(value['createdAt']);
  const updatedAt = parseStrictUtcTimestampV1(value['updatedAt']);
  const revision = value['revision'];
  if (
    !conversationId.accepted ||
    title === undefined ||
    datasetScope === undefined ||
    (value['filterContext'] !== undefined && filterContext === undefined) ||
    !createdAt.accepted ||
    !updatedAt.accepted ||
    typeof value['retentionHold'] !== 'boolean' ||
    (revision !== undefined && (!Number.isSafeInteger(revision) || (revision as number) < 1))
  ) {
    safeServiceUnavailable();
  }
  return Object.freeze({
    conversationId: conversationId.value,
    title,
    activeDatasetIds: datasetScope.datasetIds,
    activeDatasetVersionIds: datasetScope.datasetVersionIds,
    ...(dashboardId === undefined ? {} : { dashboardId }),
    ...(filterContext === undefined ? {} : { filterContext }),
    createdAt: createdAt.value,
    updatedAt: updatedAt.value,
    tenantScope: parsedScope.value,
    retentionHold: value['retentionHold'],
  });
}

function parsePersistedMessage(
  value: unknown,
  conversationId: string,
  expectedTenantScope: TenantScopeV1,
): ValidatedConversationMessageV1 {
  if (!isPlainRecord(value)) safeServiceUnavailable();
  const parsedScope = parseTenantScopeV1(value['tenantScope']);
  const messageId = parseStableIdentifierV1(value['messageId']);
  const parsedConversationId = parseStableIdentifierV1(value['conversationId']);
  const text = boundedText(value['text'], MAX_PERSISTED_MESSAGE_LENGTH, {
    trim: false,
    requireNonEmpty: false,
  });
  const createdAt = parseStrictUtcTimestampV1(value['createdAt']);
  const role = value['role'];
  const sequence = value['sequence'];
  const idempotencyKey = value['idempotencyKey'];
  const datasetVersionId =
    value['datasetVersionId'] === undefined
      ? undefined
      : parseStableIdentifierV1(value['datasetVersionId']);
  if (
    !parsedScope.accepted ||
    !tenantScopesEqualV1(parsedScope.value, expectedTenantScope) ||
    !messageId.accepted ||
    !parsedConversationId.accepted ||
    parsedConversationId.value !== conversationId ||
    (role !== 'USER' && role !== 'AGENT' && role !== 'SYSTEM') ||
    text === undefined ||
    !createdAt.accepted ||
    !Number.isSafeInteger(sequence) ||
    (sequence as number) < 1 ||
    boundedText(idempotencyKey, MAX_PERSISTED_IDEMPOTENCY_KEY_LENGTH, {
      trim: false,
      requireNonEmpty: true,
    }) === undefined ||
    (value['datasetVersionId'] !== undefined && datasetVersionId?.accepted !== true)
  ) {
    safeServiceUnavailable();
  }
  const safeDatasetVersionId =
    datasetVersionId?.accepted === true ? datasetVersionId.value : undefined;
  return Object.freeze({
    messageId: messageId.value,
    conversationId: parsedConversationId.value,
    role: role as ConversationMessageRoleV1,
    text,
    createdAt: createdAt.value,
    tenantScope: parsedScope.value,
    sequence: sequence as number,
    ...(safeDatasetVersionId === undefined ? {} : { datasetVersionId: safeDatasetVersionId }),
  });
}

function parsePersistedContextEvent(
  value: unknown,
  conversationId: string,
  expectedTenantScope: TenantScopeV1,
): PublicConversationContextEventDtoV1 {
  if (!isPlainRecord(value)) safeServiceUnavailable();
  const parsedScope = parseTenantScopeV1(value['tenantScope']);
  const eventId = parseStableIdentifierV1(value['eventId']);
  const parsedConversationId = parseStableIdentifierV1(value['conversationId']);
  const kind = value['kind'];
  const datasetId =
    value['datasetId'] === undefined ? undefined : parseStableIdentifierV1(value['datasetId']);
  const beforeVersionId =
    value['beforeVersionId'] === undefined
      ? undefined
      : parseStableIdentifierV1(value['beforeVersionId']);
  const afterVersionId =
    value['afterVersionId'] === undefined
      ? undefined
      : parseStableIdentifierV1(value['afterVersionId']);
  const sequence = value['sequence'];
  const occurredAt = parseStrictUtcTimestampV1(value['occurredAt']);
  if (
    !parsedScope.accepted ||
    !tenantScopesEqualV1(parsedScope.value, expectedTenantScope) ||
    !eventId.accepted ||
    !parsedConversationId.accepted ||
    parsedConversationId.value !== conversationId ||
    typeof kind !== 'string' ||
    !CONTEXT_EVENT_KINDS.has(kind) ||
    !Number.isSafeInteger(sequence) ||
    (sequence as number) < 1 ||
    !occurredAt.accepted ||
    (value['datasetId'] !== undefined && datasetId?.accepted !== true) ||
    (value['beforeVersionId'] !== undefined && beforeVersionId?.accepted !== true) ||
    (value['afterVersionId'] !== undefined && afterVersionId?.accepted !== true) ||
    (kind === 'DATASET_VERSION_ADVANCED' &&
      (datasetId?.accepted !== true ||
        beforeVersionId?.accepted !== true ||
        afterVersionId?.accepted !== true))
  ) {
    safeServiceUnavailable();
  }
  const safeDatasetId = datasetId?.accepted === true ? datasetId.value : undefined;
  const safeBeforeVersionId =
    beforeVersionId?.accepted === true ? beforeVersionId.value : undefined;
  const safeAfterVersionId = afterVersionId?.accepted === true ? afterVersionId.value : undefined;
  return Object.freeze({
    eventId: eventId.value,
    conversationId: parsedConversationId.value,
    kind,
    ...(safeDatasetId === undefined ? {} : { datasetId: safeDatasetId }),
    ...(safeBeforeVersionId === undefined ? {} : { beforeVersionId: safeBeforeVersionId }),
    ...(safeAfterVersionId === undefined ? {} : { afterVersionId: safeAfterVersionId }),
    sequence: sequence as number,
    occurredAt: occurredAt.value,
  });
}

function publicConversation(value: ValidatedConversationV1): PublicConversationDtoV1 {
  return Object.freeze({
    schemaVersion: 4 as const,
    conversationId: value.conversationId,
    title: value.title,
    datasets: Object.freeze(
      value.activeDatasetIds.map((datasetId) =>
        Object.freeze({
          datasetId,
          datasetVersionId: value.activeDatasetVersionIds[datasetId]!,
        }),
      ),
    ),
    ...(value.dashboardId === undefined ? {} : { dashboardId: value.dashboardId }),
    ...(value.filterContext === undefined ? {} : { filterContext: value.filterContext }),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  });
}

function publicMessage(value: ValidatedConversationMessageV1): PublicConversationMessageDtoV1 {
  return Object.freeze({
    messageId: value.messageId,
    conversationId: value.conversationId,
    role: value.role,
    text: value.text,
    sequence: value.sequence,
    ...(value.datasetVersionId === undefined ? {} : { datasetVersionId: value.datasetVersionId }),
    createdAt: value.createdAt,
  });
}

function publicContextEvent(
  value: PublicConversationContextEventDtoV1,
): PublicConversationContextEventDtoV1 {
  return Object.freeze({ ...value });
}

function serviceErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const code = (value as { readonly code?: unknown })['code'];
  if (typeof code === 'string') return code;
  if (value instanceof Error && typeof value.message === 'string') return value.message;
  return undefined;
}

function throwServiceFailure(value: unknown): never {
  const code = serviceErrorCode(value);
  if (code !== undefined && INVALID_CURSOR_ERROR_CODES.has(code)) {
    throw new BadRequestException();
  }
  if (code !== undefined && CONVERSATION_PROBLEM_CODES.has(code as ConversationProblemCodeV1)) {
    throwConversationProblem(code as ConversationProblemCodeV1);
  }
  safeServiceUnavailable();
}

function unwrapConversationResult<TValue>(value: unknown): TValue {
  if (!isObjectRecord(value)) safeServiceUnavailable();
  if (value['accepted'] === false) {
    const code = value['code'];
    if (
      typeof code !== 'string' ||
      !CONVERSATION_PROBLEM_CODES.has(code as ConversationProblemCodeV1)
    ) {
      safeServiceUnavailable();
    }
    throwConversationProblem(code as ConversationProblemCodeV1);
  }
  if (value['accepted'] !== true || !Object.prototype.hasOwnProperty.call(value, 'value')) {
    safeServiceUnavailable();
  }
  return value['value'] as TValue;
}

/** Maps conversation outcomes to safe HTTP semantics without exposing authority details. */
export function conversationProblemStatus(code: ConversationProblemCodeV1): HttpStatus {
  if (code === 'DDA_CONVERSATION_UNAUTHORIZED') return HttpStatus.FORBIDDEN;
  if (code === 'DDA_CONVERSATION_NOT_FOUND') return HttpStatus.NOT_FOUND;
  if (code === 'DDA_CONVERSATION_RETENTION_HOLD' || code === 'DDA_CONVERSATION_SUMMARY_CONFLICT') {
    return HttpStatus.CONFLICT;
  }
  if (code === 'DDA_CONVERSATION_INVALID_ATTACHMENT') {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }
  if (code === 'DDA_CONVERSATION_SUMMARY_TOO_LONG') return HttpStatus.BAD_REQUEST;
  return HttpStatus.SERVICE_UNAVAILABLE;
}

function throwConversationProblem(code: ConversationProblemCodeV1): never {
  throw new HttpException(SAFE_CONVERSATION_ERROR, conversationProblemStatus(code));
}

export interface ConversationCreateDtoV1 {
  readonly title: string;
  readonly datasetIds: readonly string[];
  readonly datasetVersionIds: Readonly<Record<string, string>>;
  readonly dashboardId?: string;
  readonly filterContext?: string;
  readonly idempotencyKey: string;
}

export class ConversationListQueryDtoV1 {
  @ApiPropertyOptional({ maxLength: MAX_CURSOR_LENGTH })
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_LIMIT, type: Number })
  @IsOptional()
  limit?: string | number;
}

export class ConversationLoadQueryDtoV1 {
  @ApiPropertyOptional({ maxLength: MAX_CURSOR_LENGTH })
  @IsOptional()
  beforeCursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_LIMIT, type: Number })
  @IsOptional()
  limit?: string | number;
}

@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/conversations')
export class ConversationController {
  private readonly requestContext: RequestTenantContextPortV1;
  private readonly agentAuthority: AgentAuthorityPortV1;
  private readonly contextVersionAuthority: ConversationContextVersionAuthorityPortV1;
  private readonly dashboardAuthorization: DashboardAuthorizationPortV1;

  public constructor(
    private readonly service: ConversationService,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
    @Optional()
    @Inject(AGENT_AUTHORITY_PORT)
    agentAuthority?: AgentAuthorityPortV1,
    @Optional()
    @Inject(CONVERSATION_CONTEXT_VERSION_AUTHORITY_PORT)
    contextVersionAuthority?: ConversationContextVersionAuthorityPortV1,
    @Optional()
    @Inject(DASHBOARD_AUTHORIZATION_PORT)
    dashboardAuthorization?: DashboardAuthorizationPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
    this.agentAuthority = agentAuthority ?? new FailClosedAgentAuthorityAdapter();
    this.contextVersionAuthority =
      contextVersionAuthority ?? new UnavailableConversationContextVersionAuthorityAdapter();
    this.dashboardAuthorization =
      dashboardAuthorization ?? createFailClosedDashboardAuthorizationV1();
  }

  @Post()
  public async create(@Req() request: unknown, @Body() dto: ConversationCreateDtoV1) {
    this.rejectClientAuthority(dto, request);
    const input = parseCreateBody(dto);
    const context = await this.resolveContext(request);
    await this.requireAnalysisAuthority(context, input.datasetIds);
    await this.requireDatasetVersionAuthority(context, input);
    let rawResult: unknown;
    try {
      rawResult = await this.service.createConversation(
        { tenantScope: context.tenantScope, memberAuthorized: true },
        {
          title: input.title,
          datasetIds: input.datasetIds,
          datasetVersionIds: input.datasetVersionIds,
          ...(input.dashboardId === undefined ? {} : { dashboardId: input.dashboardId }),
          ...(input.filterContext === undefined ? {} : { filterContext: input.filterContext }),
        },
        input.idempotencyKey,
      );
    } catch (error) {
      throwServiceFailure(error);
    }
    const result = unwrapConversationResult<unknown>(rawResult);
    const created = parsePersistedConversation(result, context.tenantScope);
    return {
      accepted: true,
      conversationId: created.conversationId,
      title: created.title,
      activeDatasetIds: created.activeDatasetIds,
    };
  }

  @Get()
  public async list(@Req() request: unknown, @Query() query: ConversationListQueryDtoV1) {
    this.rejectClientAuthority(query, request);
    const parsedQuery = parseQuery(query, LIST_QUERY_FIELDS);
    const limit = parsePageLimit(parsedQuery['limit'], 20);
    const cursor = parseCursor(parsedQuery['cursor']);
    const context = await this.resolveContext(request);
    let rawResult: unknown;
    try {
      rawResult = await this.service.listConversations(
        { tenantScope: context.tenantScope, memberAuthorized: true },
        cursor,
        limit,
      );
    } catch (error) {
      throwServiceFailure(error);
    }
    const result = unwrapConversationResult<unknown>(rawResult);
    const page: { readonly items: readonly unknown[]; readonly nextCursor?: unknown } | undefined =
      Array.isArray(result)
        ? { items: result as readonly unknown[] }
        : isPlainRecord(result) && Array.isArray(result['items'])
          ? {
              items: result['items'],
              nextCursor: result['nextCursor'],
            }
          : undefined;
    if (page === undefined) safeServiceUnavailable();
    const items: PublicConversationDtoV1[] = [];
    for (const rawConversation of page.items) {
      const validated = parsePersistedConversation(rawConversation, context.tenantScope);
      if (await this.authorizeConversationResources(context, validated)) {
        items.push(publicConversation(validated));
      }
    }
    const response = {
      schemaVersion: 4 as const,
      accepted: true,
      items: Object.freeze(items),
      ...(typeof page.nextCursor === 'string' ? { nextCursor: page.nextCursor } : {}),
    };
    return parsePublicContract<DdaConversationListAccepted>(
      CONVERSATION_LIST_ACCEPTED_SCHEMA_ID,
      response,
    );
  }

  @Get(':conversationId')
  public async load(
    @Req() request: unknown,
    @Param('conversationId') conversationId: string,
    @Query() query: ConversationLoadQueryDtoV1,
  ) {
    this.rejectClientAuthority(query, request);
    const parsedQuery = parseQuery(query, LOAD_QUERY_FIELDS);
    const limit = parsePageLimit(parsedQuery['limit'], 50);
    const beforeCursor = parseCursor(parsedQuery['beforeCursor']);
    const parsedConversationId = parseStableIdentifierOrBadRequest(conversationId);
    const context = await this.resolveContext(request);
    let rawResult: unknown;
    try {
      rawResult = await this.service.loadConversation(
        { tenantScope: context.tenantScope, memberAuthorized: true },
        parsedConversationId,
        beforeCursor,
        limit,
      );
    } catch (error) {
      throwServiceFailure(error);
    }
    const result = unwrapConversationResult<unknown>(rawResult);
    if (!isPlainRecord(result)) safeServiceUnavailable();
    const validatedConversation = parsePersistedConversation(
      result['conversation'],
      context.tenantScope,
    );
    if (!(await this.authorizeConversationResources(context, validatedConversation))) {
      throwConversationProblem('DDA_CONVERSATION_NOT_FOUND');
    }
    if (!Array.isArray(result['messages']) || result['messages'].length > MAX_PAGE_LIMIT) {
      safeServiceUnavailable();
    }
    const messages = result['messages'].map((value) =>
      publicMessage(
        parsePersistedMessage(value, validatedConversation.conversationId, context.tenantScope),
      ),
    );
    const rawContextEvents = result['contextEvents'] === undefined ? [] : result['contextEvents'];
    if (!Array.isArray(rawContextEvents) || rawContextEvents.length > MAX_PAGE_LIMIT) {
      safeServiceUnavailable();
    }
    const contextEvents: PublicConversationContextEventDtoV1[] = [];
    for (const rawEvent of rawContextEvents) {
      const event = parsePersistedContextEvent(
        rawEvent,
        validatedConversation.conversationId,
        context.tenantScope,
      );
      if (await this.authorizeContextEvent(context, event)) {
        contextEvents.push(publicContextEvent(event));
      }
    }
    const response = {
      schemaVersion: 4 as const,
      accepted: true,
      conversation: publicConversation(validatedConversation),
      messages: Object.freeze(messages),
      contextEvents: Object.freeze(contextEvents),
      ...(typeof result['nextMessagesCursor'] === 'string'
        ? { nextCursor: result['nextMessagesCursor'] }
        : {}),
    };
    return parsePublicContract<DdaConversationLoadAccepted>(
      CONVERSATION_LOAD_ACCEPTED_SCHEMA_ID,
      response,
    );
  }

  private rejectClientAuthority(body: unknown, request: unknown): void {
    const requestRecord = isObjectRecord(request)
      ? (request as Record<string, unknown>)
      : undefined;
    if (
      hasClientAuthorityField(body) ||
      hasClientAuthorityField(requestRecord?.['body']) ||
      hasClientAuthorityField(requestRecord?.['query']) ||
      hasClientAuthorityField(requestRecord?.['params'])
    ) {
      throw new BadRequestException();
    }
  }

  private async requireAnalysisAuthority(
    context: IamTenantContextV1,
    datasetIds: readonly string[],
  ): Promise<void> {
    const decision = await this.authorizeConversationDatasets(context, datasetIds);
    if (!decision) {
      throw new HttpException(SAFE_CONVERSATION_ERROR, HttpStatus.FORBIDDEN);
    }
  }

  private async authorizeConversationResources(
    context: IamTenantContextV1,
    conversation: ValidatedConversationV1,
  ): Promise<boolean> {
    if (!(await this.authorizeConversationDatasets(context, conversation.activeDatasetIds))) {
      return false;
    }
    for (const datasetId of conversation.activeDatasetIds) {
      const datasetVersionId = conversation.activeDatasetVersionIds[datasetId];
      if (
        datasetVersionId === undefined ||
        !(await this.authorizeDatasetVersionPair(context, datasetId, datasetVersionId))
      ) {
        return false;
      }
    }
    if (conversation.dashboardId !== undefined) {
      let decision: unknown;
      try {
        decision = await this.dashboardAuthorization.authorizeDashboardAction({
          context,
          tenantScope: context.tenantScope,
          actorId: context.actorId,
          dashboardId: conversation.dashboardId,
          action: 'VIEW',
        });
      } catch {
        safeServiceUnavailable();
      }
      if (
        !isObjectRecord(decision) ||
        typeof decision['allowed'] !== 'boolean' ||
        typeof decision['grantsDatasetAccess'] !== 'boolean'
      ) {
        safeServiceUnavailable();
      }
      if (decision['allowed'] !== true) return false;
    }
    return true;
  }

  private async authorizeContextEvent(
    context: IamTenantContextV1,
    event: PublicConversationContextEventDtoV1,
  ): Promise<boolean> {
    if (event.datasetId === undefined) return true;
    if (!(await this.authorizeConversationDatasets(context, [event.datasetId]))) return false;
    const versionIds = [event.beforeVersionId, event.afterVersionId].filter(
      (value): value is string => value !== undefined,
    );
    for (const datasetVersionId of versionIds) {
      if (!(await this.authorizeDatasetVersionPair(context, event.datasetId, datasetVersionId))) {
        return false;
      }
    }
    return true;
  }

  private async authorizeDatasetVersionPair(
    context: IamTenantContextV1,
    datasetId: string,
    datasetVersionId: string,
  ): Promise<boolean> {
    let rawDecision: unknown;
    try {
      rawDecision = await this.contextVersionAuthority.authorizeDatasetVersion({
        context,
        datasetId,
        datasetVersionId,
      });
    } catch {
      safeServiceUnavailable();
    }
    const decision = parseDatasetVersionAuthorityDecision(rawDecision);
    if (decision === undefined) safeServiceUnavailable();
    if (decision.allowed) return true;
    if (DATASET_VERSION_AUTHORITY_DENIAL_CODES.has(decision.code)) return false;
    safeServiceUnavailable();
  }

  private async authorizeConversationDatasets(
    context: IamTenantContextV1,
    datasetIds: readonly string[],
  ): Promise<boolean> {
    let rawDecision: unknown;
    try {
      rawDecision = await this.agentAuthority.authorize({ context, datasetIds });
    } catch {
      safeServiceUnavailable();
    }
    const decision = parseAgentAuthorityDecision(rawDecision);
    if (decision === undefined) safeServiceUnavailable();
    if (!decision.allowed) {
      if (
        decision.code === 'UNAUTHORIZED' ||
        decision.code === 'INSUFFICIENT_AGENT_LEVEL' ||
        decision.code === 'DATASET_RESTRICTED' ||
        decision.code === 'CONVERSATION_NOT_FOUND'
      ) {
        return false;
      }
      safeServiceUnavailable();
    }
    if (
      decision.effectiveAgentLevel === 'NONE' ||
      decision.deniedDatasetIds.some((datasetId) => datasetIds.includes(datasetId))
    ) {
      return false;
    }
    return true;
  }

  private async requireDatasetVersionAuthority(
    context: IamTenantContextV1,
    input: ConversationCreateDtoV1,
  ): Promise<void> {
    for (const datasetId of input.datasetIds) {
      const allowed = await this.authorizeDatasetVersionPair(
        context,
        datasetId,
        input.datasetVersionIds[datasetId] as string,
      );
      if (!allowed) {
        throw new HttpException(SAFE_CONVERSATION_ERROR, HttpStatus.FORBIDDEN);
      }
    }
  }

  private async resolveContext(request: unknown) {
    try {
      return await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        if (error.code === 'CONTEXT_INVALID') throw new BadRequestException();
        if (error.code === 'AUTHENTICATION_FAILED') throw new UnauthorizedException();
        throw new ServiceUnavailableException();
      }
      throw new ServiceUnavailableException();
    }
  }
}

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeKeyV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** AUD-001..AUD-024: immutable, tenant-scoped audit ledger invariants. */
export const AUDIT_SCHEMA_VERSION_V1 = 1 as const;

export const AUDIT_ACTIONS_V1 = Object.freeze([
  'auth.sign_in',
  'auth.sign_out',
  'auth.mfa_enrolled',
  'auth.mfa_recovered',
  'organization.created',
  'workspace.created',
  'membership.invited',
  'membership.accepted',
  'membership.suspended',
  'membership.removed',
  'device.enrolled',
  'device.activated',
  'device.revoked',
  'entitlement.granted',
  'entitlement.suspended',
  'artifact.registered',
  'artifact.deleted',
  'job.started',
  'job.completed',
  'job.failed',
  'approval.requested',
  'approval.accepted',
  'approval.rejected',
  'audit.exported',
] as const);

export type AuditActionV1 = (typeof AUDIT_ACTIONS_V1)[number];
export type AuditActorTypeV1 = 'USER' | 'SERVICE_ACCOUNT' | 'DEVICE' | 'SYSTEM';

export interface AuditActorV1 {
  readonly actorType: AuditActorTypeV1;
  readonly actorId: StableIdentifierV1;
}

export type AuditSummaryPrimitiveV1 = string | number | boolean | null;
export type AuditSummaryV1 = Readonly<Record<string, AuditSummaryPrimitiveV1>>;

export interface AuditEventV1 {
  readonly schemaVersion: typeof AUDIT_SCHEMA_VERSION_V1;
  readonly eventId: StableIdentifierV1;
  readonly action: AuditActionV1;
  readonly tenantScope: TenantScopeV1;
  readonly actor: AuditActorV1;
  readonly entityType: string;
  readonly entityId: StableIdentifierV1;
  readonly entityRevision: number;
  readonly sequence: number;
  readonly occurredAt: StrictUtcTimestampV1;
  readonly correlationId: StableIdentifierV1;
  readonly idempotencyKey: string;
  readonly summary: AuditSummaryV1;
  readonly previousDigest: string | null;
  readonly digest: string;
}

export interface AuditLedgerStateV1 {
  readonly events: readonly AuditEventV1[];
}

export interface AuditDigestPortV1 {
  digest(canonicalRecord: string): string;
}

export interface AppendAuditEventInputV1 {
  readonly eventId: unknown;
  readonly action: unknown;
  readonly tenantScope: unknown;
  readonly actor: { readonly actorType: unknown; readonly actorId: unknown };
  readonly entityType: unknown;
  readonly entityId: unknown;
  readonly entityRevision: unknown;
  readonly occurredAt: unknown;
  readonly correlationId: unknown;
  readonly idempotencyKey: unknown;
  readonly summary?: unknown;
}

export interface AuditSealV1 {
  readonly schemaVersion: typeof AUDIT_SCHEMA_VERSION_V1;
  readonly tenantScope: TenantScopeV1;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly eventCount: number;
  readonly rootDigest: string;
  readonly sealedAt: StrictUtcTimestampV1;
}

export type AuditErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_SCOPE'
  | 'INVALID_ACTION'
  | 'INVALID_ACTOR'
  | 'INVALID_TEXT'
  | 'INVALID_REVISION'
  | 'INVALID_SEQUENCE'
  | 'INVALID_SUMMARY'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CHAIN_INVALID';

export type AuditResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: AuditErrorCodeV1 };

const SAFE_SUMMARY_KEYS_V1 = new Set([
  'outcome',
  'status',
  'reasonCode',
  'resourceType',
  'providerCode',
  'attemptCount',
  'revision',
]);
const actorTypes = new Set<AuditActorTypeV1>(['USER', 'SERVICE_ACCOUNT', 'DEVICE', 'SYSTEM']);
const actions = new Set<string>(AUDIT_ACTIONS_V1);

function rejected(code: AuditErrorCodeV1): AuditResultV1<never> {
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

function tenantScope(input: unknown): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function positiveInteger(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

function canonicalSummary(summary: AuditSummaryV1): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(summary).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

function canonicalEvent(event: Omit<AuditEventV1, 'digest'>): string {
  return JSON.stringify({
    schemaVersion: event.schemaVersion,
    eventId: event.eventId,
    action: event.action,
    tenantScope: event.tenantScope,
    actor: event.actor,
    entityType: event.entityType,
    entityId: event.entityId,
    entityRevision: event.entityRevision,
    sequence: event.sequence,
    occurredAt: event.occurredAt,
    correlationId: event.correlationId,
    idempotencyKey: event.idempotencyKey,
    summary: JSON.parse(canonicalSummary(event.summary)) as AuditSummaryV1,
    previousDigest: event.previousDigest,
  });
}

export function sanitizeAuditSummaryV1(input: unknown): AuditResultV1<AuditSummaryV1> {
  if (input === undefined) return Object.freeze({ accepted: true, value: Object.freeze({}) });
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return rejected('INVALID_SUMMARY');
  const result: Record<string, AuditSummaryPrimitiveV1> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_SUMMARY_KEYS_V1.has(key)) return rejected('INVALID_SUMMARY');
    if (typeof value === 'string') {
      const safeValue = text(value, 200);
      if (!safeValue) return rejected('INVALID_SUMMARY');
      result[key] = safeValue;
    } else if (value === null) {
      result[key] = null;
    } else if (typeof value === 'boolean') {
      result[key] = value;
    } else if (typeof value === 'number' && Number.isSafeInteger(value)) {
      result[key] = value;
    } else {
      return rejected('INVALID_SUMMARY');
    }
  }
  return Object.freeze({ accepted: true, value: Object.freeze(result) });
}

export function appendAuditEventV1(
  state: AuditLedgerStateV1,
  input: AppendAuditEventInputV1,
  digestPort: AuditDigestPortV1,
): AuditResultV1<{ readonly state: AuditLedgerStateV1; readonly event: AuditEventV1 }> {
  const eventId = stableId(input.eventId);
  const action =
    typeof input.action === 'string' && actions.has(input.action) ? input.action : undefined;
  const scope = tenantScope(input.tenantScope);
  const actorId = stableId(input.actor?.actorId);
  const actorType = input.actor?.actorType;
  const entityType = text(input.entityType, 80);
  const entityId = stableId(input.entityId);
  const entityRevision = positiveInteger(input.entityRevision);
  const occurredAt = timestamp(input.occurredAt);
  const correlationId = stableId(input.correlationId);
  const idempotencyKey = text(input.idempotencyKey, 200);
  const summary = sanitizeAuditSummaryV1(input.summary);
  if (!eventId || !entityId || !correlationId) return rejected('INVALID_IDENTIFIER');
  if (!action) return rejected('INVALID_ACTION');
  if (!scope) return rejected('INVALID_SCOPE');
  if (!actorId || typeof actorType !== 'string' || !actorTypes.has(actorType as AuditActorTypeV1))
    return rejected('INVALID_ACTOR');
  if (!entityType || !entityRevision || !occurredAt || !idempotencyKey)
    return rejected(!entityType || !idempotencyKey ? 'INVALID_TEXT' : 'INVALID_REVISION');
  if (!summary.accepted) return summary;

  const existing = state.events.find(
    (event) =>
    event.idempotencyKey === idempotencyKey &&
      tenantScopeKeyV1(event.tenantScope) === tenantScopeKeyV1(scope),
  );
  if (existing) {
    return existing.eventId === eventId
      ? Object.freeze({ accepted: true, value: Object.freeze({ state, event: existing }) })
      : rejected('IDEMPOTENCY_CONFLICT');
  }

  const scopedEvents = state.events.filter(
    (event) => tenantScopeKeyV1(event.tenantScope) === tenantScopeKeyV1(scope),
  );
  const previous = scopedEvents.at(-1);
  const sequence = (previous?.sequence ?? 0) + 1;
  const eventWithoutDigest: Omit<AuditEventV1, 'digest'> = {
    schemaVersion: AUDIT_SCHEMA_VERSION_V1,
    eventId,
    action: action as AuditActionV1,
    tenantScope: scope,
    actor: Object.freeze({ actorType: actorType as AuditActorTypeV1, actorId }),
    entityType,
    entityId,
    entityRevision,
    sequence,
    occurredAt,
    correlationId,
    idempotencyKey,
    summary: summary.value,
    previousDigest: previous?.digest ?? null,
  };
  const digest = text(digestPort.digest(canonicalEvent(eventWithoutDigest)), 512);
  if (!digest) return rejected('CHAIN_INVALID');
  const event = Object.freeze({ ...eventWithoutDigest, digest });
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      state: Object.freeze({ events: Object.freeze([...state.events, event]) }),
      event,
    }),
  });
}

export function verifyAuditChainV1(
  events: readonly AuditEventV1[],
  digestPort: AuditDigestPortV1,
): AuditResultV1<true> {
  const byScope = new Map<string, AuditEventV1[]>();
  for (const event of events) {
    const key = tenantScopeKeyV1(event.tenantScope);
    const list = byScope.get(key) ?? [];
    list.push(event);
    byScope.set(key, list);
  }
  for (const scopedEvents of byScope.values()) {
    const ordered = [...scopedEvents].sort((left, right) => left.sequence - right.sequence);
    let previousDigest: string | null = null;
    for (let index = 0; index < ordered.length; index += 1) {
      const event = ordered[index];
      if (!event) return rejected('CHAIN_INVALID');
      if (event.sequence !== index + 1 || event.previousDigest !== previousDigest)
        return rejected('CHAIN_INVALID');
      if (!verifyAuditEventDigestV1(event, digestPort).accepted) return rejected('CHAIN_INVALID');
      previousDigest = event.digest;
    }
  }
  return Object.freeze({ accepted: true, value: true });
}

/** Verify one immutable event when a bounded page does not contain the full scope chain. */
export function verifyAuditEventDigestV1(
  event: AuditEventV1,
  digestPort: AuditDigestPortV1,
): AuditResultV1<true> {
  const { digest, ...withoutDigest } = event;
  if (digestPort.digest(canonicalEvent(withoutDigest)) !== digest) return rejected('CHAIN_INVALID');
  return Object.freeze({ accepted: true, value: true });
}

export function createAuditSealV1(
  events: readonly AuditEventV1[],
  scopeInput: unknown,
  sealedAtInput: unknown,
  digestPort: AuditDigestPortV1,
): AuditResultV1<AuditSealV1> {
  const scope = tenantScope(scopeInput);
  const sealedAt = timestamp(sealedAtInput);
  if (!scope) return rejected('INVALID_SCOPE');
  if (!sealedAt) return rejected('INVALID_TIMESTAMP');
  const scopedEvents = events
    .filter((event) => tenantScopeKeyV1(event.tenantScope) === tenantScopeKeyV1(scope))
    .sort((left, right) => left.sequence - right.sequence);
  if (scopedEvents.length === 0) return rejected('INVALID_SEQUENCE');
  const chain = verifyAuditChainV1(scopedEvents, digestPort);
  if (!chain.accepted) return chain;
  const firstEvent = scopedEvents[0];
  const lastEvent = scopedEvents.at(-1);
  if (!firstEvent || !lastEvent) return rejected('INVALID_SEQUENCE');
  const rootDigest = text(
    digestPort.digest(scopedEvents.map((event) => event.digest).join('|')),
    512,
  );
  if (!rootDigest) return rejected('CHAIN_INVALID');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: AUDIT_SCHEMA_VERSION_V1,
      tenantScope: scope,
      firstSequence: firstEvent.sequence,
      lastSequence: lastEvent.sequence,
      eventCount: scopedEvents.length,
      rootDigest,
      sealedAt,
    }),
  });
}

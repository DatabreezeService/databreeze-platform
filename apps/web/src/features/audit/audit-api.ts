import {
  hasOnlyKeysBrowser,
  isRecordBrowser,
  parseStableIdentifierBrowser,
  parseStrictUtcTimestampBrowser,
} from '../../lib/browser-validation.ts';
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

export interface AuditEventRow {
  readonly eventId: string;
  readonly action: string;
  readonly actorType: 'USER' | 'SERVICE_ACCOUNT' | 'DEVICE' | 'SYSTEM';
  readonly actorId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly entityRevision: number;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly summary: Readonly<Record<string, string | number | boolean | null>>;
}

export interface AuditEventPage {
  readonly items: readonly AuditEventRow[];
  readonly nextCursor?: string;
}

export class AuditReadError extends Error {
  public readonly code: 'UNAVAILABLE' | 'INTEGRITY' | 'INVALID_RESPONSE';

  public constructor(code: AuditReadError['code']) {
    super(`AUDIT_${code}`);
    this.name = 'AuditReadError';
    this.code = code;
  }
}

function apiBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

function parseSummary(
  input: unknown,
): Readonly<Record<string, string | number | boolean | null>> | undefined {
  if (!isRecordBrowser(input) || Object.keys(input).length > 24) return undefined;
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/u.test(key)) return undefined;
    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    )
      return undefined;
    if (typeof value === 'string' && value.length > 512) return undefined;
    if (typeof value === 'number' && !Number.isFinite(value)) return undefined;
    output[key] = value;
  }
  return Object.freeze(output);
}

function parseEvent(input: unknown): AuditEventRow | undefined {
  if (
    !isRecordBrowser(input) ||
    !hasOnlyKeysBrowser(input, [
      'schemaVersion',
      'eventId',
      'action',
      'tenantScope',
      'actor',
      'entityType',
      'entityId',
      'entityRevision',
      'sequence',
      'occurredAt',
      'correlationId',
      'idempotencyKey',
      'summary',
      'previousDigest',
      'digest',
    ]) ||
    input['schemaVersion'] !== 1 ||
    typeof input['action'] !== 'string' ||
    !/^[A-Za-z0-9_.-]{1,100}$/u.test(input['action']) ||
    typeof input['entityType'] !== 'string' ||
    !/^[A-Za-z0-9_.-]{1,100}$/u.test(input['entityType'])
  )
    return undefined;
  const eventId = parseStableIdentifierBrowser(input['eventId']);
  const entityId = parseStableIdentifierBrowser(input['entityId']);
  const occurredAt = parseStrictUtcTimestampBrowser(input['occurredAt']);
  const actor = input['actor'];
  if (
    !eventId.accepted ||
    !entityId.accepted ||
    !occurredAt.accepted ||
    !isRecordBrowser(actor) ||
    !hasOnlyKeysBrowser(actor, ['actorType', 'actorId']) ||
    !['USER', 'SERVICE_ACCOUNT', 'DEVICE', 'SYSTEM'].includes(actor['actorType'] as string)
  )
    return undefined;
  const actorId = parseStableIdentifierBrowser(actor['actorId']);
  const summary = parseSummary(input['summary']);
  if (
    !actorId.accepted ||
    summary === undefined ||
    typeof input['entityRevision'] !== 'number' ||
    !Number.isSafeInteger(input['entityRevision']) ||
    input['entityRevision'] < 1 ||
    typeof input['sequence'] !== 'number' ||
    !Number.isSafeInteger(input['sequence']) ||
    input['sequence'] < 1
  )
    return undefined;
  return Object.freeze({
    eventId: eventId.value,
    action: input['action'],
    actorType: actor['actorType'] as AuditEventRow['actorType'],
    actorId: actorId.value,
    entityType: input['entityType'],
    entityId: entityId.value,
    entityRevision: input['entityRevision'],
    sequence: input['sequence'],
    occurredAt: occurredAt.value,
    summary,
  });
}

function parsePage(input: unknown): AuditEventPage {
  if (
    !isRecordBrowser(input) ||
    !hasOnlyKeysBrowser(input, ['items', 'nextCursor']) ||
    !Array.isArray(input['items'])
  )
    throw new AuditReadError('INVALID_RESPONSE');
  const items = input['items'].map(parseEvent);
  if (items.some((item) => item === undefined)) throw new AuditReadError('INVALID_RESPONSE');
  const nextCursor = input['nextCursor'];
  if (nextCursor !== undefined && (typeof nextCursor !== 'string' || nextCursor.length > 512))
    throw new AuditReadError('INVALID_RESPONSE');
  return Object.freeze({
    items: Object.freeze(items as AuditEventRow[]),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  });
}

export async function listAuditEvents(
  options: {
    readonly cursor?: string;
    readonly limit?: number;
    readonly signal?: AbortSignal;
  } = {},
): Promise<AuditEventPage> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 40) });
  if (options.cursor !== undefined) params.set('cursor', options.cursor);
  const requestInit: RequestInit = {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
  let response: Response;
  try {
    response = await createSessionAwareFetchV1({
      apiBaseUrl: apiBaseUrl(),
      fetcher: globalThis.fetch.bind(globalThis),
    })(`${apiBaseUrl()}/v1/audit/events?${params.toString()}`, requestInit);
  } catch {
    throw new AuditReadError('UNAVAILABLE');
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const code = isRecordBrowser(body) ? body['code'] : undefined;
    throw new AuditReadError(code === 'AUDIT_INTEGRITY_INVALID' ? 'INTEGRITY' : 'UNAVAILABLE');
  }
  return parsePage(await response.json().catch(() => undefined));
}

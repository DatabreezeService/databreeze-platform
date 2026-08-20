import {
  hasOnlyKeysBrowser,
  isRecordBrowser,
  parseStableIdentifierBrowser,
  parseStrictUtcTimestampBrowser,
} from '../../lib/browser-validation.ts';
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

const inboxStates = [
  'NEW',
  'ROUTED',
  'NEEDS_REVIEW',
  'PROCESSING',
  'RESOLVED',
  'QUARANTINED',
  'ARCHIVED',
] as const;

export type InboxState = (typeof inboxStates)[number];

export interface InboxListItem {
  readonly inboxItemId: string;
  readonly artifactVersionId: string;
  readonly state: InboxState;
  readonly createdAt: string;
  readonly revision: number;
}

function apiBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  if (typeof configured !== 'string' || configured.trim() === '') return '';
  return configured.replace(/\/$/u, '');
}

function parseInboxItem(input: unknown): InboxListItem | undefined {
  if (
    !isRecordBrowser(input) ||
    !hasOnlyKeysBrowser(input, [
      'schemaVersion',
      'inboxItemId',
      'artifactVersionId',
      'state',
      'createdAt',
      'revision',
    ]) ||
    input['schemaVersion'] !== 1
  )
    return undefined;
  const item = input;
  const inboxItemId = parseStableIdentifierBrowser(item['inboxItemId']);
  const artifactVersionId = parseStableIdentifierBrowser(item['artifactVersionId']);
  const createdAt = parseStrictUtcTimestampBrowser(item['createdAt']);
  if (!inboxItemId.accepted || !artifactVersionId.accepted || !createdAt.accepted) return undefined;
  if (!inboxStates.includes(item['state'] as InboxState)) return undefined;
  if (
    typeof item['revision'] !== 'number' ||
    !Number.isSafeInteger(item['revision']) ||
    item['revision'] < 1
  )
    return undefined;
  return Object.freeze({
    inboxItemId: inboxItemId.value,
    artifactVersionId: artifactVersionId.value,
    state: item['state'] as InboxState,
    createdAt: createdAt.value,
    revision: item['revision'],
  });
}

export async function listInbox(signal?: AbortSignal): Promise<readonly InboxListItem[]> {
  const requestInit: RequestInit = {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  };
  if (signal !== undefined) requestInit.signal = signal;
  const response = await createSessionAwareFetchV1({
    apiBaseUrl: apiBaseUrl(),
    fetcher: globalThis.fetch.bind(globalThis),
  })(`${apiBaseUrl()}/v1/artifacts/inbox`, requestInit);
  if (!response.ok) throw new Error('INBOX_REQUEST_FAILED');
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error('INBOX_RESPONSE_INVALID');
  const parsed = payload.map(parseInboxItem);
  if (parsed.some((item) => item === undefined)) throw new Error('INBOX_RESPONSE_INVALID');
  return Object.freeze(parsed as InboxListItem[]);
}

import type {
  ContractV4ParseResult,
  ContractV4SchemaId,
  DdaAgentTurnAccepted,
  DdaAgentTurnCommand,
  DdaConversationListAccepted,
  DdaConversationLoadAccepted,
} from '@databreeze/contracts/v4';
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

const CONVERSATION_LIST_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/dda-conversation-list-accepted' as const;
const CONVERSATION_LOAD_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/dda-conversation-load-accepted' as const;
const AGENT_TURN_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/dda-agent-turn-accepted' as const;

export type AnalysisConversationApiErrorCodeV1 =
  | 'CONVERSATION_ABORTED'
  | 'CONVERSATION_CREATE_FORBIDDEN'
  | 'CONVERSATION_CREATE_RESPONSE_INVALID'
  | 'CONVERSATION_CREATE_UNAVAILABLE'
  | 'CONVERSATION_FORBIDDEN'
  | 'CONVERSATION_NOT_FOUND'
  | 'CONVERSATION_RESPONSE_INVALID'
  | 'CONVERSATION_UNAVAILABLE'
  | 'AGENT_TURN_ABORTED'
  | 'AGENT_TURN_FORBIDDEN'
  | 'AGENT_TURN_STALE_CONTEXT'
  | 'AGENT_TURN_USAGE_DENIED'
  | 'AGENT_TURN_RESPONSE_INVALID'
  | 'AGENT_TURN_UNAVAILABLE';

export interface CreatedAuthorizedConversationV1 {
  readonly conversationId: string;
  readonly title: string;
  readonly activeDatasetIds: readonly string[];
}

export class AnalysisConversationApiError extends Error {
  public constructor(readonly code: AnalysisConversationApiErrorCodeV1) {
    super(code);
    this.name = 'AnalysisConversationApiError';
  }
}

export interface ConversationApiBaseInputV1 {
  readonly baseUrl?: string;
  readonly signal?: AbortSignal;
}

export interface FetchAuthorizedConversationHistoryInputV1 extends ConversationApiBaseInputV1 {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface FetchAuthorizedConversationInputV1 extends ConversationApiBaseInputV1 {
  readonly conversationId: string;
  readonly beforeCursor?: string;
  readonly limit?: number;
}

export interface RunAuthorizedAgentTurnInputV1 extends ConversationApiBaseInputV1 {
  readonly conversationId: string;
  readonly messageId: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly locale: 'en' | 'vi-VN';
  readonly contextRevision?: number;
  readonly expectedContextRevision?: number;
}

export interface CreateAuthorizedConversationInputV1 extends ConversationApiBaseInputV1 {
  readonly title: string;
  readonly datasetIds: readonly string[];
  readonly datasetVersionIds: Readonly<Record<string, string>>;
  readonly idempotencyKey: string;
}

function configuredBaseUrl(
  environment: Readonly<Record<string, unknown>> = import.meta.env,
): string {
  const configured = environment['VITE_DATABREEZE_API_BASE_URL'];
  return (typeof configured === 'string' ? configured.trim() : '').replace(/\/+$/u, '');
}

export interface AnalysisConversationApiConfigurationV1 {
  readonly baseUrl: string;
}

export function analysisConversationApiConfiguration(
  environment: Readonly<Record<string, unknown>> = import.meta.env,
): AnalysisConversationApiConfigurationV1 {
  return Object.freeze({ baseUrl: configuredBaseUrl(environment) });
}

function endpoint(baseUrl: string | undefined, path: string): string {
  return `${(baseUrl ?? configuredBaseUrl()).replace(/\/+$/u, '')}${path}`;
}

function sessionFetcher(baseUrl?: string): typeof fetch {
  return createSessionAwareFetchV1({
    apiBaseUrl: baseUrl ?? configuredBaseUrl(),
    fetcher: globalThis.fetch.bind(globalThis),
  });
}

function isAbort(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
  );
}

function requestInit(
  method: 'GET' | 'POST',
  signal: AbortSignal | undefined,
  body?: unknown,
  idempotencyKey?: string,
) {
  return {
    method,
    credentials: 'include' as const,
    headers:
      method === 'POST'
        ? {
            Accept: 'application/json',
            'content-type': 'application/json',
            ...(idempotencyKey === undefined ? {} : { 'Idempotency-Key': idempotencyKey }),
          }
        : { Accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal === undefined ? {} : { signal }),
  } satisfies RequestInit;
}

async function parseV4<TValue>(
  schemaId: ContractV4SchemaId,
  value: unknown,
): Promise<ContractV4ParseResult<TValue>> {
  // Keep Ajv outside the initial workspace shell chunk. The validator is loaded
  // only when an authorized conversation request returns.
  const { parseV4Contract } = await import('@databreeze/contracts/v4');
  return parseV4Contract<TValue>(schemaId, value);
}

function conversationStatus(response: Response): void {
  if (response.status === 401 || response.status === 403) {
    throw new AnalysisConversationApiError('CONVERSATION_FORBIDDEN');
  }
  if (response.status === 404) {
    throw new AnalysisConversationApiError('CONVERSATION_NOT_FOUND');
  }
  if (!response.ok) throw new AnalysisConversationApiError('CONVERSATION_UNAVAILABLE');
}

function agentTurnStatus(response: Response): void {
  if (response.status === 401 || response.status === 403) {
    throw new AnalysisConversationApiError('AGENT_TURN_FORBIDDEN');
  }
  if (response.status === 409) {
    throw new AnalysisConversationApiError('AGENT_TURN_STALE_CONTEXT');
  }
  if (response.status === 429) {
    throw new AnalysisConversationApiError('AGENT_TURN_USAGE_DENIED');
  }
  if (!response.ok) throw new AnalysisConversationApiError('AGENT_TURN_UNAVAILABLE');
}

async function responseJson(
  response: Response,
  invalidCode: AnalysisConversationApiErrorCodeV1,
): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch {
    throw new AnalysisConversationApiError(invalidCode);
  }
}

/** DDA-055: permission-filtered workspace history with no client-supplied tenant authority. */
export async function fetchAuthorizedConversationHistory(
  input: FetchAuthorizedConversationHistoryInputV1 = {},
): Promise<DdaConversationListAccepted> {
  const search = new URLSearchParams({ limit: String(input.limit ?? 20) });
  if (input.cursor !== undefined) search.set('cursor', input.cursor);
  const fetcher = sessionFetcher(input.baseUrl);
  let response: Response;
  try {
    response = await fetcher(
      endpoint(input.baseUrl, `/v1/dda/conversations?${search.toString()}`),
      requestInit('GET', input.signal),
    );
  } catch (error) {
    throw new AnalysisConversationApiError(
      isAbort(error) ? 'CONVERSATION_ABORTED' : 'CONVERSATION_UNAVAILABLE',
    );
  }
  conversationStatus(response);
  const parsed = await parseV4<DdaConversationListAccepted>(
    CONVERSATION_LIST_SCHEMA,
    await responseJson(response, 'CONVERSATION_RESPONSE_INVALID'),
  );
  if (!parsed.accepted) {
    throw new AnalysisConversationApiError('CONVERSATION_RESPONSE_INVALID');
  }
  return parsed.value;
}

function isCreatedConversation(value: unknown): value is CreatedAuthorizedConversationV1 {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)['accepted'] === true &&
    typeof (value as Record<string, unknown>)['conversationId'] === 'string' &&
    typeof (value as Record<string, unknown>)['title'] === 'string' &&
    Array.isArray((value as Record<string, unknown>)['activeDatasetIds'])
  );
}

/**
 * DDA-055: create one authorized conversation bound to explicit governed dataset versions.
 * Tenant scope comes from the authenticated server context, never from this payload.
 */
export async function createAuthorizedConversation(
  input: CreateAuthorizedConversationInputV1,
): Promise<CreatedAuthorizedConversationV1> {
  const fetcher = sessionFetcher(input.baseUrl);
  let response: Response;
  try {
    response = await fetcher(
      endpoint(input.baseUrl, '/v1/dda/conversations'),
      requestInit(
        'POST',
        input.signal,
        {
          title: input.title,
          datasetIds: input.datasetIds,
          datasetVersionIds: input.datasetVersionIds,
          idempotencyKey: input.idempotencyKey,
        },
        input.idempotencyKey,
      ),
    );
  } catch (error) {
    throw new AnalysisConversationApiError(
      isAbort(error) ? 'CONVERSATION_ABORTED' : 'CONVERSATION_CREATE_UNAVAILABLE',
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new AnalysisConversationApiError('CONVERSATION_CREATE_FORBIDDEN');
  }
  if (!response.ok) throw new AnalysisConversationApiError('CONVERSATION_CREATE_UNAVAILABLE');
  const payload: unknown = await responseJson(response, 'CONVERSATION_CREATE_RESPONSE_INVALID');
  if (!isCreatedConversation(payload)) {
    throw new AnalysisConversationApiError('CONVERSATION_CREATE_RESPONSE_INVALID');
  }
  return Object.freeze({ ...payload });
}

/** DDA-055/DDA-056: load one bounded, reauthorized message and context-event page. */
export async function fetchAuthorizedConversation(
  input: FetchAuthorizedConversationInputV1,
): Promise<DdaConversationLoadAccepted> {
  const search = new URLSearchParams({ limit: String(input.limit ?? 50) });
  if (input.beforeCursor !== undefined) search.set('beforeCursor', input.beforeCursor);
  const fetcher = sessionFetcher(input.baseUrl);
  let response: Response;
  try {
    response = await fetcher(
      endpoint(
        input.baseUrl,
        `/v1/dda/conversations/${encodeURIComponent(input.conversationId)}?${search.toString()}`,
      ),
      requestInit('GET', input.signal),
    );
  } catch (error) {
    throw new AnalysisConversationApiError(
      isAbort(error) ? 'CONVERSATION_ABORTED' : 'CONVERSATION_UNAVAILABLE',
    );
  }
  conversationStatus(response);
  const parsed = await parseV4<DdaConversationLoadAccepted>(
    CONVERSATION_LOAD_SCHEMA,
    await responseJson(response, 'CONVERSATION_RESPONSE_INVALID'),
  );
  if (!parsed.accepted) {
    throw new AnalysisConversationApiError('CONVERSATION_RESPONSE_INVALID');
  }
  return parsed.value;
}

/** IAM-024/DDA-060: send one generated, idempotent command to the bounded agent gateway. */
export async function runAuthorizedAgentTurn(
  input: RunAuthorizedAgentTurnInputV1,
): Promise<DdaAgentTurnAccepted> {
  const command: DdaAgentTurnCommand = {
    schemaVersion: 4,
    conversationId: input.conversationId,
    messageId: input.messageId,
    text: input.text,
    idempotencyKey: input.idempotencyKey,
    locale: input.locale,
    ...(input.contextRevision === undefined ? {} : { contextRevision: input.contextRevision }),
    ...(input.expectedContextRevision === undefined
      ? {}
      : { expectedContextRevision: input.expectedContextRevision }),
  };
  const fetcher = sessionFetcher(input.baseUrl);
  let response: Response;
  try {
    response = await fetcher(
      endpoint(input.baseUrl, '/v1/dda/agent/turns'),
      requestInit('POST', input.signal, command, input.idempotencyKey),
    );
  } catch (error) {
    throw new AnalysisConversationApiError(
      isAbort(error) ? 'AGENT_TURN_ABORTED' : 'AGENT_TURN_UNAVAILABLE',
    );
  }
  agentTurnStatus(response);
  const parsed = await parseV4<DdaAgentTurnAccepted>(
    AGENT_TURN_SCHEMA,
    await responseJson(response, 'AGENT_TURN_RESPONSE_INVALID'),
  );
  if (!parsed.accepted) {
    throw new AnalysisConversationApiError('AGENT_TURN_RESPONSE_INVALID');
  }
  return parsed.value;
}

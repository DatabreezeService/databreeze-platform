import {
  hasOnlyKeysBrowser,
  isRecordBrowser,
  parseStableIdentifierBrowser,
  parseStrictUtcTimestampBrowser,
} from '../../lib/browser-validation.ts';
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

export type ApprovalStatus = 'OPEN' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface ApprovalRequestRow {
  readonly requestId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectVersion: number;
  readonly requestedAction: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly requestedBy: string;
  readonly status: ApprovalStatus;
  readonly createdAt: string;
  readonly dueAt?: string;
  readonly revision: number;
}

export interface ApprovalDecisionRow {
  readonly decisionId: string;
  readonly actorId: string;
  readonly decision: 'APPROVE' | 'REJECT';
  readonly reason?: string;
  readonly decidedAt: string;
}

export interface ApprovalRequestDetail {
  readonly request: ApprovalRequestRow;
  readonly decisions: readonly ApprovalDecisionRow[];
}

export class ApprovalReadError extends Error {
  public readonly code: 'UNAVAILABLE' | 'INVALID_RESPONSE';

  public constructor(code: ApprovalReadError['code']) {
    super(`APPROVAL_${code}`);
    this.name = 'ApprovalReadError';
    this.code = code;
  }
}

function apiBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

function parseRequest(input: unknown): ApprovalRequestRow | undefined {
  if (
    !isRecordBrowser(input) ||
    !hasOnlyKeysBrowser(input, [
      'schemaVersion',
      'requestId',
      'tenantScope',
      'subjectType',
      'subjectId',
      'subjectVersion',
      'subjectHash',
      'requestedAction',
      'policyId',
      'policyVersion',
      'requestedBy',
      'status',
      'createdAt',
      'dueAt',
      'revision',
    ]) ||
    input['schemaVersion'] !== 1 ||
    typeof input['subjectType'] !== 'string' ||
    input['subjectType'].length < 1 ||
    input['subjectType'].length > 80 ||
    typeof input['requestedAction'] !== 'string' ||
    input['requestedAction'].length < 1 ||
    input['requestedAction'].length > 80 ||
    !['OPEN', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(input['status'] as string)
  )
    return undefined;
  const requestId = parseStableIdentifierBrowser(input['requestId']);
  const subjectId = parseStableIdentifierBrowser(input['subjectId']);
  const policyId = parseStableIdentifierBrowser(input['policyId']);
  const requestedBy = parseStableIdentifierBrowser(input['requestedBy']);
  const createdAt = parseStrictUtcTimestampBrowser(input['createdAt']);
  const dueAt =
    input['dueAt'] === undefined
      ? { accepted: true as const, value: undefined }
      : parseStrictUtcTimestampBrowser(input['dueAt']);
  if (
    !requestId.accepted ||
    !subjectId.accepted ||
    !policyId.accepted ||
    !requestedBy.accepted ||
    !createdAt.accepted ||
    !dueAt.accepted ||
    typeof input['subjectVersion'] !== 'number' ||
    !Number.isSafeInteger(input['subjectVersion']) ||
    input['subjectVersion'] < 1 ||
    typeof input['policyVersion'] !== 'number' ||
    !Number.isSafeInteger(input['policyVersion']) ||
    input['policyVersion'] < 1 ||
    typeof input['revision'] !== 'number' ||
    !Number.isSafeInteger(input['revision']) ||
    input['revision'] < 1
  )
    return undefined;
  return Object.freeze({
    requestId: requestId.value,
    subjectType: input['subjectType'],
    subjectId: subjectId.value,
    subjectVersion: input['subjectVersion'],
    requestedAction: input['requestedAction'],
    policyId: policyId.value,
    policyVersion: input['policyVersion'],
    requestedBy: requestedBy.value,
    status: input['status'] as ApprovalStatus,
    createdAt: createdAt.value,
    ...(dueAt.value === undefined ? {} : { dueAt: dueAt.value }),
    revision: input['revision'],
  });
}

function parseDecision(input: unknown): ApprovalDecisionRow | undefined {
  if (
    !isRecordBrowser(input) ||
    !hasOnlyKeysBrowser(input, [
      'schemaVersion',
      'decisionId',
      'requestId',
      'actorId',
      'decision',
      'reason',
      'mfaAssertionId',
      'subjectHash',
      'decidedAt',
    ]) ||
    input['schemaVersion'] !== 1 ||
    !['APPROVE', 'REJECT'].includes(input['decision'] as string) ||
    (input['reason'] !== undefined &&
      (typeof input['reason'] !== 'string' || input['reason'].length > 512))
  )
    return undefined;
  const decisionId = parseStableIdentifierBrowser(input['decisionId']);
  const actorId = parseStableIdentifierBrowser(input['actorId']);
  const decidedAt = parseStrictUtcTimestampBrowser(input['decidedAt']);
  if (!decisionId.accepted || !actorId.accepted || !decidedAt.accepted) return undefined;
  return Object.freeze({
    decisionId: decisionId.value,
    actorId: actorId.value,
    decision: input['decision'] as ApprovalDecisionRow['decision'],
    ...(input['reason'] === undefined ? {} : { reason: input['reason'] }),
    decidedAt: decidedAt.value,
  });
}

function parseDetail(input: unknown): ApprovalRequestDetail {
  if (!isRecordBrowser(input) || !hasOnlyKeysBrowser(input, ['request', 'decisions']))
    throw new ApprovalReadError('INVALID_RESPONSE');
  const request = parseRequest(input['request']);
  const decisionsInput = input['decisions'];
  if (request === undefined || !Array.isArray(decisionsInput))
    throw new ApprovalReadError('INVALID_RESPONSE');
  const decisions = decisionsInput.map(parseDecision);
  if (decisions.some((decision) => decision === undefined))
    throw new ApprovalReadError('INVALID_RESPONSE');
  return Object.freeze({ request, decisions: Object.freeze(decisions as ApprovalDecisionRow[]) });
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

async function request(path: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await createSessionAwareFetchV1({
      apiBaseUrl: apiBaseUrl(),
      fetcher: globalThis.fetch.bind(globalThis),
    })(`${apiBaseUrl()}${path}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    throw new ApprovalReadError('UNAVAILABLE');
  }
  if (!response.ok) throw new ApprovalReadError('UNAVAILABLE');
  return readJson(response);
}

export async function listApprovalRequests(
  status: ApprovalStatus | 'ALL' = 'OPEN',
  signal?: AbortSignal,
): Promise<readonly ApprovalRequestRow[]> {
  const query = status === 'ALL' ? '' : `?status=${encodeURIComponent(status)}`;
  const payload = await request(`/v1/approvals/requests${query}`, signal);
  if (!Array.isArray(payload)) throw new ApprovalReadError('INVALID_RESPONSE');
  const requests = payload.map(parseRequest);
  if (requests.some((item) => item === undefined)) throw new ApprovalReadError('INVALID_RESPONSE');
  return Object.freeze(requests as ApprovalRequestRow[]);
}

export async function getApprovalRequest(
  requestId: string,
  signal?: AbortSignal,
): Promise<ApprovalRequestDetail> {
  const payload = await request(`/v1/approvals/requests/${encodeURIComponent(requestId)}`, signal);
  return parseDetail(payload);
}

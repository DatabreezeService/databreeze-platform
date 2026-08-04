import {
  createSpreadsheetAuditResultV1,
  type SpreadsheetAuditResultV1,
} from '@databreeze/domain/spreadsheet-audit/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

const API_ERROR = 'SPREADSHEET_AUDIT_RESPONSE_INVALID';
const NOT_FOUND_ERROR = 'SPREADSHEET_AUDIT_NOT_FOUND';
type SpreadsheetAuditInput = Parameters<typeof createSpreadsheetAuditResultV1>[0];

export type SpreadsheetAuditClientErrorCode =
  | typeof API_ERROR
  | typeof NOT_FOUND_ERROR
  | 'SPREADSHEET_AUDIT_REQUEST_FAILED'
  | 'SPREADSHEET_AUDIT_INVALID_IDENTIFIER';

export class SpreadsheetAuditClientError extends Error {
  public readonly code: SpreadsheetAuditClientErrorCode;

  public constructor(code: SpreadsheetAuditClientErrorCode) {
    super(code);
    this.name = 'SpreadsheetAuditClientError';
    this.code = code;
  }
}

function apiBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  if (typeof configured !== 'string' || configured.trim() === '') return '';
  return configured.replace(/\/$/u, '');
}

function identifier(input: unknown): string {
  const parsed = parseStableIdentifierV1(input);
  if (!parsed.accepted)
    throw new SpreadsheetAuditClientError('SPREADSHEET_AUDIT_INVALID_IDENTIFIER');
  return parsed.value;
}

function parseResult(input: unknown): SpreadsheetAuditResultV1 {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new SpreadsheetAuditClientError(API_ERROR);
  const envelope = input as Record<string, unknown>;
  if (envelope['accepted'] !== true) throw new SpreadsheetAuditClientError(API_ERROR);
  const result = createSpreadsheetAuditResultV1(envelope['value'] as SpreadsheetAuditInput);
  if (!result.accepted) throw new SpreadsheetAuditClientError(API_ERROR);
  return result.value;
}

function parseList(input: unknown): readonly SpreadsheetAuditResultV1[] {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new SpreadsheetAuditClientError(API_ERROR);
  const envelope = input as Record<string, unknown>;
  if (envelope['accepted'] !== true || !Array.isArray(envelope['value']))
    throw new SpreadsheetAuditClientError(API_ERROR);
  const results = envelope['value'].map(parseResultValue);
  return Object.freeze(results);
}

function parseResultValue(input: unknown): SpreadsheetAuditResultV1 {
  const result = createSpreadsheetAuditResultV1(input as SpreadsheetAuditInput);
  if (!result.accepted) throw new SpreadsheetAuditClientError(API_ERROR);
  return result.value;
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    const requestInit: RequestInit = {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    };
    if (signal !== undefined) requestInit.signal = signal;
    response = await fetch(url, requestInit);
  } catch {
    throw new SpreadsheetAuditClientError('SPREADSHEET_AUDIT_REQUEST_FAILED');
  }
  if (response.status === 404) throw new SpreadsheetAuditClientError(NOT_FOUND_ERROR);
  if (!response.ok) throw new SpreadsheetAuditClientError('SPREADSHEET_AUDIT_REQUEST_FAILED');
  try {
    return await response.json();
  } catch {
    throw new SpreadsheetAuditClientError(API_ERROR);
  }
}

/** Reads only the canonical value-free result contract; unknown response fields are discarded. */
export async function listSpreadsheetAudits(
  artifactVersionId: unknown,
  signal?: AbortSignal,
): Promise<readonly SpreadsheetAuditResultV1[]> {
  const id = identifier(artifactVersionId);
  const query = new URLSearchParams({ artifactVersionId: id });
  return parseList(await getJson(`${apiBaseUrl()}/v1/spreadsheet-audits?${query}`, signal));
}

/** Reads one immutable result by ID; source values and formulas are not part of the contract. */
export async function getSpreadsheetAudit(
  auditId: unknown,
  signal?: AbortSignal,
): Promise<SpreadsheetAuditResultV1> {
  const id = identifier(auditId);
  return parseResult(
    await getJson(`${apiBaseUrl()}/v1/spreadsheet-audits/${encodeURIComponent(id)}`, signal),
  );
}

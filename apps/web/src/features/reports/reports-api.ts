import {
  parseV4Contract,
  type CrfReportCreateAccepted,
  type CrfReportCreateCommand,
  type CrfReportDetailAccepted,
  type CrfReportListAccepted,
  type CrfReportRunDetailAccepted,
} from '@databreeze/contracts/v4';

import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

const LIST_SCHEMA = 'https://schemas.databreeze.dev/contracts/v4/crf-report-list-accepted' as const;
const DETAIL_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/crf-report-detail-accepted' as const;
const RUN_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/crf-report-run-detail-accepted' as const;
const CREATE_COMMAND_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/crf-report-create-command' as const;
const CREATE_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/crf-report-create-accepted' as const;

function configuredBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

export class ReportsApiError extends Error {
  public constructor(
    public readonly code:
      | 'UNAVAILABLE'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'INVALID_RESPONSE'
      | 'INVALID_COMMAND',
  ) {
    super(`REPORTS_${code}`);
    this.name = 'ReportsApiError';
  }
}

function mapStatus(status: number): ReportsApiError['code'] {
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 400 || status === 422) return 'INVALID_COMMAND';
  return 'UNAVAILABLE';
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/u, '')}${path}`;
}

function apiFetch(baseUrl: string, fetcher: typeof fetch): typeof fetch {
  return createSessionAwareFetchV1({
    apiBaseUrl: baseUrl,
    fetcher,
  });
}

async function json(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

function parse<TValue>(schema: string, payload: unknown): TValue {
  const result = parseV4Contract<TValue>(schema as never, payload);
  if (!result.accepted) throw new ReportsApiError('INVALID_RESPONSE');
  return result.value;
}

export interface ReportsApiOptionsV1 {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
}

export type ReportListPageV1 = CrfReportListAccepted;
export type ReportSummaryV1 = CrfReportListAccepted['items'][number];
export type ReportDetailV1 = CrfReportDetailAccepted['report'];
export type ReportRunDetailV1 = CrfReportRunDetailAccepted['run'];

export async function listReports(
  input: { readonly limit?: number; readonly cursor?: string } = {},
  options: ReportsApiOptionsV1 = {},
  signal?: AbortSignal,
): Promise<ReportListPageV1> {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  const query = new URLSearchParams({ limit: String(input.limit ?? 25) });
  if (input.cursor !== undefined) query.set('cursor', input.cursor);
  let response: Response;
  try {
    response = await apiFetch(baseUrl, options.fetcher ?? globalThis.fetch.bind(globalThis))(
      endpoint(baseUrl, `/v1/reports?${query.toString()}`),
      {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        ...(signal === undefined ? {} : { signal }),
      },
    );
  } catch {
    throw new ReportsApiError('UNAVAILABLE');
  }
  if (!response.ok) throw new ReportsApiError(mapStatus(response.status));
  return parse<ReportListPageV1>(LIST_SCHEMA, await json(response));
}

export async function getReport(
  reportId: string,
  options: ReportsApiOptionsV1 = {},
  signal?: AbortSignal,
): Promise<ReportDetailV1> {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  let response: Response;
  try {
    response = await apiFetch(baseUrl, options.fetcher ?? globalThis.fetch.bind(globalThis))(
      endpoint(baseUrl, `/v1/reports/${encodeURIComponent(reportId)}`),
      {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        ...(signal === undefined ? {} : { signal }),
      },
    );
  } catch {
    throw new ReportsApiError('UNAVAILABLE');
  }
  if (!response.ok) throw new ReportsApiError(mapStatus(response.status));
  return parse<CrfReportDetailAccepted>(DETAIL_SCHEMA, await json(response)).report;
}

export async function getReportRun(
  reportId: string,
  runId: string,
  options: ReportsApiOptionsV1 = {},
  signal?: AbortSignal,
): Promise<ReportRunDetailV1> {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  let response: Response;
  try {
    response = await apiFetch(baseUrl, options.fetcher ?? globalThis.fetch.bind(globalThis))(
      endpoint(
        baseUrl,
        `/v1/reports/${encodeURIComponent(reportId)}/runs/${encodeURIComponent(runId)}`,
      ),
      {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        ...(signal === undefined ? {} : { signal }),
      },
    );
  } catch {
    throw new ReportsApiError('UNAVAILABLE');
  }
  if (!response.ok) throw new ReportsApiError(mapStatus(response.status));
  return parse<CrfReportRunDetailAccepted>(RUN_SCHEMA, await json(response)).run;
}

export async function createReport(
  command: CrfReportCreateCommand,
  idempotencyKey: string,
  options: ReportsApiOptionsV1 = {},
  signal?: AbortSignal,
): Promise<ReportSummaryV1> {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  const commandResult = parseV4Contract<CrfReportCreateCommand>(CREATE_COMMAND_SCHEMA, command);
  if (!commandResult.accepted || !/^[A-Za-z0-9._~-]{8,200}$/u.test(idempotencyKey)) {
    throw new ReportsApiError('INVALID_COMMAND');
  }
  let response: Response;
  try {
    response = await apiFetch(baseUrl, options.fetcher ?? globalThis.fetch.bind(globalThis))(
      endpoint(baseUrl, '/v1/reports'),
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(commandResult.value),
        ...(signal === undefined ? {} : { signal }),
      },
    );
  } catch {
    throw new ReportsApiError('UNAVAILABLE');
  }
  if (!response.ok) throw new ReportsApiError(mapStatus(response.status));
  return parse<CrfReportCreateAccepted>(CREATE_SCHEMA, await json(response)).report;
}

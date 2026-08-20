import {
  parseV4Contract,
  type JraJobHistoryDetailAccepted,
  type JraJobHistoryEntry,
  type JraJobHistoryListAccepted,
} from '@databreeze/contracts/v4';

import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

const LIST_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/jra-job-history-list-accepted' as const;
const DETAIL_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/jra-job-history-detail-accepted' as const;

function baseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

export class JobsReadError extends Error {
  public constructor(
    public readonly code: 'UNAVAILABLE' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_RESPONSE',
  ) {
    super(`JOBS_${code}`);
    this.name = 'JobsReadError';
  }
}

async function read(path: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await createSessionAwareFetchV1({
      apiBaseUrl: baseUrl(),
      fetcher: globalThis.fetch.bind(globalThis),
    })(`${baseUrl()}${path}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    throw new JobsReadError('UNAVAILABLE');
  }
}

async function body(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

function mapStatus(status: number): JobsReadError['code'] {
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  return 'UNAVAILABLE';
}

export interface JobHistoryPageV1 {
  readonly items: readonly JraJobHistoryEntry[];
  readonly nextCursor?: string;
}

export async function listJobs(
  input: { readonly limit?: number; readonly cursor?: string } = {},
  signal?: AbortSignal,
): Promise<JobHistoryPageV1> {
  const query = new URLSearchParams();
  query.set('limit', String(input.limit ?? 25));
  if (input.cursor !== undefined) query.set('cursor', input.cursor);
  const response = await read(`/v1/jobs?${query.toString()}`, signal);
  if (!response.ok) throw new JobsReadError(mapStatus(response.status));
  const parsed = parseV4Contract<JraJobHistoryListAccepted>(LIST_SCHEMA, await body(response));
  if (!parsed.accepted) throw new JobsReadError('INVALID_RESPONSE');
  return Object.freeze({
    items: parsed.value.items,
    ...(parsed.value.nextCursor === undefined ? {} : { nextCursor: parsed.value.nextCursor }),
  });
}

export async function getJob(jobId: string, signal?: AbortSignal): Promise<JraJobHistoryEntry> {
  const response = await read(`/v1/jobs/${encodeURIComponent(jobId)}`, signal);
  if (!response.ok) throw new JobsReadError(mapStatus(response.status));
  const parsed = parseV4Contract<JraJobHistoryDetailAccepted>(DETAIL_SCHEMA, await body(response));
  if (!parsed.accepted) throw new JobsReadError('INVALID_RESPONSE');
  return parsed.value.job;
}

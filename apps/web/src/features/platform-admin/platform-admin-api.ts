import {
  parseV4Contract,
  type ContractV4SchemaId,
  type PlatformAdminFeedbacks,
  type PlatformAdminOverview,
} from '@databreeze/contracts/v4';

import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

const PLATFORM_ADMIN_OVERVIEW_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/platform-admin-overview' as const;
const PLATFORM_ADMIN_FEEDBACKS_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/platform-admin-feedbacks' as const;

export type PlatformAdminWindowDays = 30 | 90 | 180 | 365;

export class PlatformAdminApiError extends Error {
  public constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = 'PlatformAdminApiError';
  }
}

export interface PlatformAdminApiOptions {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
}

function configuredBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

function parseOrThrow<TValue>(schema: ContractV4SchemaId, payload: unknown): TValue {
  const parsed = parseV4Contract<TValue>(schema, payload);
  if (!parsed.accepted) throw new PlatformAdminApiError('PLATFORM_ADMIN_RESPONSE_INVALID');
  return parsed.value;
}

async function responsePayload(response: Response): Promise<unknown> {
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return undefined;
  return response.json().catch(() => undefined);
}

export function createPlatformAdminApi(options: PlatformAdminApiOptions = {}) {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/u, '');
  const fetcher = createSessionAwareFetchV1({
    apiBaseUrl: baseUrl,
    fetcher: options.fetcher ?? globalThis.fetch.bind(globalThis),
  });
  const inFlight = new Map<PlatformAdminWindowDays, Promise<PlatformAdminOverview>>();

  async function requestOverview(days: PlatformAdminWindowDays): Promise<PlatformAdminOverview> {
    let response: Response;
    try {
      response = await fetcher(
        `${baseUrl}/v1/platform-admin/overview?days=${encodeURIComponent(String(days))}`,
        { headers: { Accept: 'application/json' } },
      );
    } catch {
      throw new PlatformAdminApiError('PLATFORM_ADMIN_REQUEST_FAILED');
    }
    const payload = await responsePayload(response);
    if (!response.ok) {
      const body = payload as { readonly code?: unknown } | undefined;
      throw new PlatformAdminApiError(
        typeof body?.code === 'string' ? body.code : 'PLATFORM_ADMIN_REQUEST_FAILED',
        response.status,
      );
    }
    return parseOrThrow<PlatformAdminOverview>(PLATFORM_ADMIN_OVERVIEW_SCHEMA, payload);
  }

  function readOverview(days: PlatformAdminWindowDays): Promise<PlatformAdminOverview> {
    const existing = inFlight.get(days);
    if (existing !== undefined) return existing;
    const request = requestOverview(days).finally(() => {
      if (inFlight.get(days) === request) inFlight.delete(days);
    });
    inFlight.set(days, request);
    return request;
  }

  let feedbacksInFlight: Promise<PlatformAdminFeedbacks> | undefined;

  async function requestFeedbacks(): Promise<PlatformAdminFeedbacks> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/v1/platform-admin/feedbacks`, {
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new PlatformAdminApiError('PLATFORM_ADMIN_REQUEST_FAILED');
    }
    const payload = await responsePayload(response);
    if (!response.ok) {
      const body = payload as { readonly code?: unknown } | undefined;
      throw new PlatformAdminApiError(
        typeof body?.code === 'string' ? body.code : 'PLATFORM_ADMIN_REQUEST_FAILED',
        response.status,
      );
    }
    return parseOrThrow<PlatformAdminFeedbacks>(PLATFORM_ADMIN_FEEDBACKS_SCHEMA, payload);
  }

  function readFeedbacks(): Promise<PlatformAdminFeedbacks> {
    const existing = feedbacksInFlight;
    if (existing !== undefined) return existing;
    const request = requestFeedbacks().finally(() => {
      if (feedbacksInFlight === request) feedbacksInFlight = undefined;
    });
    feedbacksInFlight = request;
    return request;
  }

  return Object.freeze({
    readOverview,
    readFeedbacks,

    async canAccess(): Promise<boolean> {
      try {
        await readOverview(30);
        return true;
      } catch {
        return false;
      }
    },
  });
}

export type PlatformAdminApi = ReturnType<typeof createPlatformAdminApi>;

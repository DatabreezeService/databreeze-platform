import type {
  WorkbenchCatalogPage,
  WorkbenchDatasetRecord,
  WorkbenchSessionSnapshot,
  WorkbenchSyncStatus,
} from '../../shared/workbench-contract-v1.ts';
import type { WorkbenchMainPort } from './fail-closed-workbench.adapter.ts';

export interface ProtectedDesktopSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: string;
  readonly accountLabel: string | null;
  readonly workspaceLabel: string | null;
}

export interface ProtectedDesktopSessionStore {
  load(): Promise<ProtectedDesktopSession | null>;
  save(value: ProtectedDesktopSession): Promise<void>;
  clear(): Promise<void>;
}

export interface ApiWorkbenchPortInput {
  readonly baseUrl: string;
  readonly sessionStore: ProtectedDesktopSessionStore;
  readonly fetchImpl?: typeof fetch;
  readonly nowMs?: () => number;
}

const signedOut: WorkbenchSessionSnapshot = Object.freeze({
  signedIn: false,
  accountLabel: null,
  workspaceLabel: null,
});

function unavailable(code: string): never {
  throw new Error(code);
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function nullableLabel(value: unknown): string | null | undefined {
  if (value === null) return null;
  return boundedString(value, 128) ?? undefined;
}

function parseIso(value: unknown): string | null {
  const text = boundedString(value, 64);
  return text !== null && Number.isFinite(Date.parse(text)) ? text : null;
}

function parseSignInSession(value: unknown, accountLabel: string): ProtectedDesktopSession | null {
  const record = plainRecord(value);
  if (record === null) return null;
  const sessionId = boundedString(record['sessionId'], 128);
  const userId = boundedString(record['userId'], 128);
  const organizationId = boundedString(record['organizationId'], 128);
  const workspaceId = boundedString(record['workspaceId'], 128);
  const accessToken = boundedString(record['accessToken'], 4096);
  const refreshToken = boundedString(record['refreshToken'], 4096);
  const accessExpiresAt = parseIso(record['accessExpiresAt']);
  if (
    sessionId === null ||
    userId === null ||
    organizationId === null ||
    workspaceId === null ||
    accessToken === null ||
    refreshToken === null ||
    accessExpiresAt === null ||
    typeof record['securityEpoch'] !== 'number' ||
    !Number.isSafeInteger(record['securityEpoch']) ||
    record['securityEpoch'] < 1 ||
    typeof record['mfaRequired'] !== 'boolean' ||
    typeof record['mfaReenrollmentRequired'] !== 'boolean'
  ) {
    return null;
  }
  return Object.freeze({
    sessionId,
    userId,
    organizationId,
    workspaceId,
    accessToken,
    refreshToken,
    accessExpiresAt,
    accountLabel: accountLabel.slice(0, 128),
    workspaceLabel: null,
  });
}

function parseRefreshedSession(
  value: unknown,
  prior: ProtectedDesktopSession,
): ProtectedDesktopSession | null {
  const record = plainRecord(value);
  if (record === null) return null;
  const sessionId = boundedString(record['sessionId'], 128);
  const accessToken = boundedString(record['accessToken'], 4096);
  const refreshToken = boundedString(record['refreshToken'], 4096);
  const accessExpiresAt = parseIso(record['accessExpiresAt']);
  if (
    sessionId === null ||
    accessToken === null ||
    refreshToken === null ||
    accessExpiresAt === null ||
    sessionId !== prior.sessionId
  ) {
    return null;
  }
  return Object.freeze({ ...prior, accessToken, refreshToken, accessExpiresAt });
}

function sessionSnapshot(session: ProtectedDesktopSession): WorkbenchSessionSnapshot {
  return Object.freeze({
    signedIn: true,
    accountLabel: nullableLabel(session.accountLabel) ?? null,
    workspaceLabel: nullableLabel(session.workspaceLabel) ?? null,
  });
}

function datasetRecords(value: unknown): readonly WorkbenchDatasetRecord[] | null {
  const envelope = plainRecord(value);
  const body = plainRecord(envelope?.['value']);
  const rawDatasets = body?.['datasets'];
  if (envelope?.['accepted'] !== true || !Array.isArray(rawDatasets) || rawDatasets.length > 100) {
    return null;
  }
  const result: WorkbenchDatasetRecord[] = [];
  for (const item of rawDatasets) {
    const record = plainRecord(item);
    const datasetId = boundedString(record?.['datasetId'], 128);
    const displayName = boundedString(record?.['label'], 128);
    const health = record?.['health'];
    if (datasetId === null || displayName === null) return null;
    result.push(
      Object.freeze({
        datasetId,
        displayName,
        health:
          health === 'READY' || health === 'ATTENTION' || health === 'BLOCKED'
            ? health
            : 'ATTENTION',
      }),
    );
  }
  return Object.freeze(result);
}

function analysisRecords(value: unknown): WorkbenchCatalogPage['recentAnalyses'] | null {
  const envelope = plainRecord(value);
  const rawItems = envelope?.['items'];
  if (envelope?.['accepted'] !== true || !Array.isArray(rawItems) || rawItems.length > 100) {
    return null;
  }
  const result: Array<{ conversationId: string; title: string }> = [];
  for (const item of rawItems) {
    const record = plainRecord(item);
    const conversationId = boundedString(record?.['conversationId'], 128);
    const title = boundedString(record?.['title'], 128);
    if (conversationId === null || title === null) return null;
    result.push(Object.freeze({ conversationId, title }));
  }
  return Object.freeze(result);
}

async function safeJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) unavailable('WORKBENCH_API_UNAVAILABLE');
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 256 * 1024) {
    unavailable('WORKBENCH_API_UNAVAILABLE');
  }
  try {
    return await response.json();
  } catch {
    unavailable('WORKBENCH_API_UNAVAILABLE');
  }
}

export function createApiWorkbenchPort(input: ApiWorkbenchPortInput): WorkbenchMainPort & {
  getAccessToken(): Promise<string | null>;
} {
  const fetchImpl = input.fetchImpl ?? fetch;
  const nowMs = input.nowMs ?? (() => Date.now());
  const baseUrl = input.baseUrl.replace(/\/+$/u, '');

  async function currentSession(): Promise<ProtectedDesktopSession | null> {
    const session = await input.sessionStore.load();
    if (session === null) return null;
    const expiryMs = Date.parse(session.accessExpiresAt);
    if (!Number.isFinite(expiryMs) || expiryMs <= nowMs() + 30_000) {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/v1/auth/refresh`, {
          method: 'POST',
          headers: Object.freeze({
            accept: 'application/json',
            'content-type': 'application/json',
          }),
          body: JSON.stringify({ clientPlatform: 'desktop', refreshToken: session.refreshToken }),
        });
      } catch {
        return null;
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) await input.sessionStore.clear();
        return null;
      }
      const refreshed = parseRefreshedSession(await safeJson(response), session);
      if (refreshed === null || Date.parse(refreshed.accessExpiresAt) <= nowMs() + 30_000) {
        await input.sessionStore.clear();
        return null;
      }
      await input.sessionStore.save(refreshed);
      return refreshed;
    }
    return session;
  }

  async function authenticatedGet(path: string): Promise<unknown> {
    const session = await currentSession();
    if (session === null) unavailable('WORKBENCH_AUTH_UNAVAILABLE');
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'GET',
        headers: Object.freeze({
          accept: 'application/json',
          authorization: `Bearer ${session.accessToken}`,
        }),
      });
    } catch {
      unavailable('WORKBENCH_API_UNAVAILABLE');
    }
    if (response.status === 401 || response.status === 403) {
      await input.sessionStore.clear();
      unavailable('WORKBENCH_AUTH_UNAVAILABLE');
    }
    if (!response.ok) unavailable('WORKBENCH_API_UNAVAILABLE');
    return safeJson(response);
  }

  return {
    async readSession() {
      const session = await currentSession();
      return session === null ? signedOut : sessionSnapshot(session);
    },
    async listCatalogPage(request) {
      const cursor = request.cursor === null ? '' : `&cursor=${encodeURIComponent(request.cursor)}`;
      const [datasetValue, analysisValue] = await Promise.all([
        authenticatedGet(`/v1/datasets?limit=100${cursor}`),
        authenticatedGet('/v1/dda/conversations?limit=100'),
      ]);
      const datasets = datasetRecords(datasetValue);
      const recentAnalyses = analysisRecords(analysisValue);
      if (datasets === null || recentAnalyses === null) unavailable('WORKBENCH_API_UNAVAILABLE');
      return Object.freeze({
        folders: Object.freeze([]),
        datasets,
        reviewItems: Object.freeze([]),
        recentAnalyses,
      });
    },
    readOriginalDescriptor() {
      unavailable('WORKBENCH_ORIGINAL_UNAVAILABLE');
    },
    decideFolderReview() {
      unavailable('WORKBENCH_REVIEW_UNAVAILABLE');
    },
    runAgentTurn() {
      unavailable('WORKBENCH_AGENT_UNAVAILABLE');
    },
    getSyncStatus(): Promise<WorkbenchSyncStatus> {
      return Promise.resolve(
        Object.freeze({
          folderMonitoring: 'unavailable',
          syncQueue: 0,
          engineHealth: 'not-installed',
          pendingReviewCount: 0,
        }),
      );
    },
    importSource() {
      unavailable('WORKBENCH_IMPORT_UNAVAILABLE');
    },
    async signInWithPassword(request) {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/v1/auth/sign-in`, {
          method: 'POST',
          headers: Object.freeze({
            accept: 'application/json',
            'content-type': 'application/json',
          }),
          body: JSON.stringify({ ...request, clientPlatform: 'desktop' }),
        });
      } catch {
        await input.sessionStore.clear();
        unavailable('WORKBENCH_AUTH_UNAVAILABLE');
      }
      if (!response.ok) {
        await input.sessionStore.clear();
        return signedOut;
      }
      const session = parseSignInSession(await safeJson(response), request.email);
      if (session === null || Date.parse(session.accessExpiresAt) <= nowMs()) {
        await input.sessionStore.clear();
        unavailable('WORKBENCH_AUTH_UNAVAILABLE');
      }
      await input.sessionStore.save(session);
      return sessionSnapshot(session);
    },
    verifyOtp() {
      unavailable('WORKBENCH_OTP_UNAVAILABLE');
    },
    startGoogleOidc() {
      unavailable('WORKBENCH_GOOGLE_OIDC_UNAVAILABLE');
    },
    async getAccessToken() {
      return (await currentSession())?.accessToken ?? null;
    },
  };
}

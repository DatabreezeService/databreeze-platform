import type { IamAuthSession, IamBootstrapValue } from '@databreeze/contracts/v4';

let activeSession: IamAuthSession | undefined;
let activeBootstrap: IamBootstrapValue | undefined;
let authenticationState: WebAuthenticationStateV1 = 'signed-out';
const authenticationListeners = new Set<() => void>();

export type WebAuthenticationStateV1 = 'signed-in' | 'signed-out';

const CSRF_COOKIE_NAME_V1 = 'databreeze_csrf';
const MAX_COOKIE_HEADER_LENGTH_V1 = 8_192;
const MAX_COOKIE_SEGMENTS_V1 = 64;
const MAX_COOKIE_VALUE_LENGTH_V1 = 4_096;

export interface SessionAwareFetchOptionsV1 {
  readonly apiBaseUrl: string;
  readonly applicationOrigin?: string;
  readonly fetcher?: typeof fetch;
}

/** WEB-004: access credentials live in memory only; refresh credentials remain HttpOnly cookies. */
export function rememberAuthSessionV1(session: IamAuthSession): void {
  const { refreshToken: _discardedRefreshToken, ...publicSession } = session;
  void _discardedRefreshToken;
  activeSession = Object.freeze(publicSession);
}

function notifyAuthenticationListenersV1(): void {
  for (const listener of authenticationListeners) listener();
}

/** Test/bootstrap initialization; live sign-in is established only after bootstrap binding. */
export function initializeWebAuthenticationStateV1(state: WebAuthenticationStateV1): void {
  if (authenticationState === state) return;
  authenticationState = state;
  notifyAuthenticationListenersV1();
}

export function currentWebAuthenticationStateV1(): WebAuthenticationStateV1 {
  return authenticationState;
}

export function subscribeWebAuthenticationStateV1(listener: () => void): () => void {
  authenticationListeners.add(listener);
  return () => authenticationListeners.delete(listener);
}

/** IAM-009/WEB-002: bind product context to the exact authenticated server session. */
export function rememberAuthBootstrapV1(bootstrap: IamBootstrapValue): boolean {
  const session = activeSession;
  const scope = bootstrap.session;
  if (
    session === undefined ||
    bootstrap.user.id !== session.userId ||
    scope.organizationId !== session.organizationId ||
    scope.authorizationEpoch !== session.securityEpoch ||
    (scope.scopeType !== 'organization' && scope.workspaceId !== session.workspaceId)
  ) return false;
  const organization = bootstrap.organizations.find((entry) => entry.id === scope.organizationId);
  const workspace = scope.scopeType === 'organization'
    ? undefined
    : organization?.workspaces.find((entry) => entry.id === scope.workspaceId);
  const projectExists = scope.scopeType !== 'project' || workspace?.projects.some((entry) => entry.id === scope.projectId);
  if (
    organization === undefined ||
    organization.status !== 'ACTIVE' ||
    (scope.scopeType !== 'organization' && (workspace === undefined || workspace.status !== 'ACTIVE')) ||
    !projectExists
  ) return false;
  activeBootstrap = Object.freeze(bootstrap);
  initializeWebAuthenticationStateV1('signed-in');
  return true;
}

export function currentAuthBootstrapV1(): IamBootstrapValue | undefined {
  return activeBootstrap;
}

export function currentAccessTokenV1(): string | undefined {
  return activeSession?.accessToken;
}

/** The current browser session id is server-issued and held only in memory. */
export function currentSessionIdV1(): string | undefined {
  return activeSession?.sessionId;
}

export function clearAuthSessionV1(): void {
  activeSession = undefined;
  activeBootstrap = undefined;
  initializeWebAuthenticationStateV1('signed-out');
}

function csrfTokenV1(): string | undefined {
  const raw = globalThis.document?.cookie;
  if (typeof raw !== 'string' || raw.length > MAX_COOKIE_HEADER_LENGTH_V1) return undefined;
  const segments = raw.split(';');
  if (segments.length > MAX_COOKIE_SEGMENTS_V1) return undefined;
  let token: string | undefined;
  for (const segment of segments) {
    const equals = segment.indexOf('=');
    if (equals <= 0) continue;
    const name = segment.slice(0, equals).trim();
    if (name !== CSRF_COOKIE_NAME_V1) continue;
    const value = segment.slice(equals + 1).trim();
    if (
      token !== undefined ||
      value.length === 0 ||
      value.length > MAX_COOKIE_VALUE_LENGTH_V1 ||
      !/^[A-Za-z0-9._~-]+$/u.test(value)
    ) {
      return undefined;
    }
    token = value;
  }
  return token;
}

export function currentCsrfTokenV1(): string | undefined {
  return csrfTokenV1();
}

function apiBoundaryV1(apiBaseUrl: string, applicationOrigin: string): URL {
  const boundary = new URL(apiBaseUrl === '' ? '/' : apiBaseUrl, applicationOrigin);
  if (boundary.username !== '' || boundary.password !== '' || boundary.search !== '' || boundary.hash !== '') {
    throw new Error('WEB_API_BOUNDARY_INVALID');
  }
  return boundary;
}

function pathWithinBoundaryV1(pathname: string, boundaryPathname: string): boolean {
  const prefix = boundaryPathname.replace(/\/+$/u, '') || '/';
  return prefix === '/' || pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function requestUrlV1(input: RequestInfo | URL, applicationOrigin: string): URL {
  return new URL(input instanceof Request ? input.url : String(input), applicationOrigin);
}

function requestMethodV1(input: RequestInfo | URL, init: RequestInit | undefined): string {
  return (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

/**
 * IAM-023/WEB-002/WEB-004: add the short-lived memory credential only at the
 * configured API boundary. Caller-provided credentials are stripped elsewhere.
 */
export function createSessionAwareFetchV1(options: SessionAwareFetchOptionsV1): typeof fetch {
  const applicationOrigin =
    options.applicationOrigin ?? globalThis.location?.origin ?? 'http://localhost';
  const boundary = apiBoundaryV1(options.apiBaseUrl, applicationOrigin);
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = requestUrlV1(input, applicationOrigin);
    const approved =
      target.origin === boundary.origin &&
      pathWithinBoundaryV1(target.pathname, boundary.pathname);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers !== undefined) {
      for (const [name, value] of new Headers(init.headers)) headers.set(name, value);
    }
    headers.delete('authorization');
    headers.delete('x-csrf-token');
    if (approved) {
      const accessToken = currentAccessTokenV1();
      if (accessToken !== undefined) headers.set('authorization', `Bearer ${accessToken}`);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(requestMethodV1(input, init))) {
        const csrf = currentCsrfTokenV1();
        if (csrf !== undefined) headers.set('x-csrf-token', csrf);
      }
    }
    return fetcher(input, {
      ...init,
      headers,
      ...(approved ? { credentials: 'include' as const } : {}),
    });
  };
}

/** Install one shared boundary transport so legacy feature clients cannot omit bearer composition. */
export function installSessionAwareFetchV1(options: SessionAwareFetchOptionsV1): () => void {
  const previous = globalThis.fetch;
  globalThis.fetch = createSessionAwareFetchV1(options);
  return () => {
    globalThis.fetch = previous;
  };
}

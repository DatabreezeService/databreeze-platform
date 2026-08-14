import {
  parseV4Contract,
  type IamAuthSession,
  type IamBootstrapResponse,
  type IamBootstrapValue,
  type IamEmailVerificationCommand,
  type IamPasswordSignInCommand,
  type IamRegistrationAccepted,
  type IamRegistrationCommand,
} from '@databreeze/contracts/v4';
import {
  clearAuthSessionV1,
  createSessionAwareFetchV1,
  currentCsrfTokenV1,
  currentSessionIdV1,
  rememberAuthSessionV1,
} from './auth-session.ts';

const REGISTRATION_ACCEPTED_SCHEMA = 'https://schemas.databreeze.dev/contracts/v4/iam-registration-accepted';
const AUTH_SESSION_SCHEMA = 'https://schemas.databreeze.dev/contracts/v4/iam-auth-session';
const BOOTSTRAP_RESPONSE_SCHEMA = 'https://schemas.databreeze.dev/contracts/v4/iam-bootstrap-response';

export interface AuthApiOptionsV1 {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
}

export type AuthFailureV1 = { readonly accepted: false; readonly code: 'AUTH_FAILED' };

export interface AuthApiV1 {
  readonly register: (input: Omit<IamRegistrationCommand, 'schemaVersion'>) => Promise<
    { readonly accepted: true; readonly value: IamRegistrationAccepted['value'] } | AuthFailureV1
  >;
  readonly verifyEmailRegistration: (
    input: Omit<IamEmailVerificationCommand, 'schemaVersion' | 'clientPlatform'>,
  ) => Promise<{ readonly accepted: true; readonly value: IamAuthSession } | AuthFailureV1>;
  readonly signInWithPassword: (input: {
    readonly email: string;
    readonly password: string;
  }) => Promise<{ readonly accepted: true; readonly value: IamAuthSession } | AuthFailureV1>;
  readonly recoverWebSession: () => Promise<{ readonly accepted: true } | AuthFailureV1>;
  readonly loadBootstrap: () => Promise<
    { readonly accepted: true; readonly value: IamBootstrapValue } | AuthFailureV1
  >;
  readonly signOut: () => Promise<{ readonly accepted: true } | AuthFailureV1>;
}

function failure(): AuthFailureV1 {
  return Object.freeze({ accepted: false, code: 'AUTH_FAILED' });
}

async function request(
  fetcher: typeof fetch,
  url: string,
  body: unknown,
): Promise<unknown> {
  try {
    const response = await fetcher(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

/** IAM-022/IAM-023/WEB-004: generated-contract browser transport without persistent tokens. */
export function createAuthApiV1(options: AuthApiOptionsV1 = {}): AuthApiV1 {
  const baseUrl = (options.baseUrl ?? '').replace(/\/$/u, '');
  const fetcher = createSessionAwareFetchV1({
    apiBaseUrl: baseUrl,
    fetcher: options.fetcher ?? globalThis.fetch.bind(globalThis),
  });
  return Object.freeze({
    async register(input: Omit<IamRegistrationCommand, 'schemaVersion'>) {
      const payload: IamRegistrationCommand = { schemaVersion: 4, ...input };
      const raw = await request(fetcher, `${baseUrl}/v1/auth/register`, payload);
      const parsed = parseV4Contract(REGISTRATION_ACCEPTED_SCHEMA, raw);
      return parsed.accepted
        ? Object.freeze({ accepted: true as const, value: (parsed.value as IamRegistrationAccepted).value })
        : failure();
    },
    async verifyEmailRegistration(input: Omit<IamEmailVerificationCommand, 'schemaVersion' | 'clientPlatform'>) {
      const payload: IamEmailVerificationCommand = { schemaVersion: 4, clientPlatform: 'web', ...input };
      const raw = await request(fetcher, `${baseUrl}/v1/auth/email-verification/verify`, payload);
      const parsed = parseV4Contract(AUTH_SESSION_SCHEMA, raw);
      return parsed.accepted
        ? Object.freeze({ accepted: true as const, value: parsed.value as IamAuthSession })
        : failure();
    },
    async signInWithPassword(input: { readonly email: string; readonly password: string }) {
      const payload: IamPasswordSignInCommand = { schemaVersion: 4, clientPlatform: 'web', ...input };
      const raw = await request(fetcher, `${baseUrl}/v1/auth/sign-in`, payload);
      const parsed = parseV4Contract(AUTH_SESSION_SCHEMA, raw);
      return parsed.accepted
        ? Object.freeze({ accepted: true as const, value: parsed.value as IamAuthSession })
        : failure();
    },
    async recoverWebSession() {
      clearAuthSessionV1();
      if (currentCsrfTokenV1() === undefined) return failure();
      const raw = await request(fetcher, `${baseUrl}/v1/auth/refresh`, {
        clientPlatform: 'web',
      });
      const parsed = parseV4Contract<IamAuthSession>(AUTH_SESSION_SCHEMA, raw);
      if (!parsed.accepted || parsed.value.refreshToken !== undefined) return failure();
      rememberAuthSessionV1(parsed.value);
      return Object.freeze({ accepted: true as const });
    },
    async loadBootstrap() {
      try {
        const response = await fetcher(`${baseUrl}/v1/me/bootstrap`, {
          method: 'GET',
          credentials: 'include',
          headers: { accept: 'application/json' },
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return failure();
        const parsed = parseV4Contract<IamBootstrapResponse>(BOOTSTRAP_RESPONSE_SCHEMA, await response.json());
        if (!parsed.accepted || parsed.value.outcome !== 'ACCEPTED') return failure();
        return Object.freeze({ accepted: true as const, value: parsed.value.value });
      } catch {
        return failure();
      }
    },
    async signOut() {
      const sessionId = currentSessionIdV1();
      if (sessionId === undefined || currentCsrfTokenV1() === undefined) return failure();
      try {
        const response = await fetcher(`${baseUrl}/v1/auth/sign-out`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            // The API derives request context from this header for every unsafe method.
            // Binding it to the server-issued session makes repeated sign-out attempts
            // deterministic without accepting any client-authored tenant authority.
            'idempotency-key': sessionId,
          },
          body: JSON.stringify({ clientPlatform: 'web', sessionId }),
        });
        if (response.status !== 204) return failure();
        clearAuthSessionV1();
        return Object.freeze({ accepted: true as const });
      } catch {
        return failure();
      }
    },
  });
}

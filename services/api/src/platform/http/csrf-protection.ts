import { compareCsrfTokensV1 } from '@databreeze/domain/v1';

export const DEFAULT_CSRF_ALLOWED_ORIGINS_V1 = Object.freeze([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export interface CsrfRequestV1 {
  readonly method: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}

export interface CsrfProtectionOptionsV1 {
  readonly allowedOrigins: readonly string[];
}

export type CsrfRequestResultV1 =
  | { readonly accepted: true }
  | {
      readonly accepted: false;
      readonly code: 'CSRF_REQUIRED' | 'CSRF_INVALID' | 'ORIGIN_INVALID';
    };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const COOKIE_AUTH_NAMES = new Set([
  'databreeze_access',
  'databreeze_refresh',
  'databreeze_session',
]);
const CSRF_COOKIE_NAME = 'databreeze_csrf';
const MAX_COOKIE_HEADER_LENGTH = 8_192;
const MAX_COOKIE_NAME_LENGTH = 64;
const MAX_COOKIE_VALUE_LENGTH = 4_096;
const MAX_COOKIE_SEGMENTS = 64;

function oneHeader(
  headers: CsrfRequestV1['headers'],
  name: string,
):
  | { readonly present: false }
  | { readonly present: true; readonly value: string }
  | { readonly present: true; readonly ambiguous: true } {
  const matching = Object.entries(headers)
    .filter(([key]) => key.toLowerCase() === name)
    .map(([, value]) => value)
    .filter((value): value is string | readonly string[] => value !== undefined);
  if (matching.length !== 1)
    return matching.length === 0 ? { present: false } : { present: true, ambiguous: true };
  const value = matching[0];
  if (typeof value !== 'string') return { present: true, ambiguous: true };
  return { present: true, value };
}

function parseCookies(raw: string): {
  readonly values: ReadonlyMap<string, string>;
  readonly duplicateNames: ReadonlySet<string>;
  readonly malformed: boolean;
  readonly resourceLimitExceeded: boolean;
} {
  const values = new Map<string, string>();
  const duplicateNames = new Set<string>();
  let malformed = false;
  if (raw.length > MAX_COOKIE_HEADER_LENGTH) {
    return { values, duplicateNames, malformed, resourceLimitExceeded: true };
  }
  const segments = raw.split(';');
  if (segments.length > MAX_COOKIE_SEGMENTS) {
    return { values, duplicateNames, malformed, resourceLimitExceeded: true };
  }
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) continue;
    const equals = trimmed.indexOf('=');
    if (equals <= 0) {
      malformed = true;
      continue;
    }
    const name = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim();
    if (
      name.length > MAX_COOKIE_NAME_LENGTH ||
      value.length > MAX_COOKIE_VALUE_LENGTH ||
      !/^[!#$%&'*+\-.^_`|~A-Za-z0-9]+$/u.test(name) ||
      value.includes('\r') ||
      value.includes('\n')
    ) {
      malformed = true;
      continue;
    }
    if (values.has(name)) duplicateNames.add(name);
    values.set(name, value);
  }
  return { values, duplicateNames, malformed, resourceLimitExceeded: false };
}

function hasCookieAuth(cookies: ReturnType<typeof parseCookies>): boolean {
  for (const name of COOKIE_AUTH_NAMES) {
    if (cookies.values.has(name)) return true;
  }
  return false;
}

function originAccepted(
  headers: CsrfRequestV1['headers'],
  options: CsrfProtectionOptionsV1,
): boolean {
  const origin = oneHeader(headers, 'origin');
  if (origin.present && 'ambiguous' in origin) return false;
  if (origin.present) return options.allowedOrigins.includes(origin.value);

  const fetchSite = oneHeader(headers, 'sec-fetch-site');
  if (!fetchSite.present || 'ambiguous' in fetchSite) return false;
  return fetchSite.value === 'same-origin' || fetchSite.value === 'same-site';
}

/**
 * Enforce CSRF only at the browser-cookie boundary. Native clients use bearer
 * or device proof-of-possession credentials and must not be forced to invent a
 * browser token. Every ambiguous header/cookie state fails closed.
 */
export function evaluateCsrfRequestV1(
  request: CsrfRequestV1,
  options: CsrfProtectionOptionsV1,
): CsrfRequestResultV1 {
  const method = request.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return Object.freeze({ accepted: true as const });

  const cookie = oneHeader(request.headers, 'cookie');
  if (!cookie.present) return Object.freeze({ accepted: true as const });
  if ('ambiguous' in cookie)
    return Object.freeze({ accepted: false as const, code: 'CSRF_INVALID' as const });

  const cookies = parseCookies(cookie.value);
  if (cookies.resourceLimitExceeded) {
    return Object.freeze({ accepted: false as const, code: 'CSRF_INVALID' as const });
  }
  if (!hasCookieAuth(cookies)) return Object.freeze({ accepted: true as const });
  if (!originAccepted(request.headers, options)) {
    return Object.freeze({ accepted: false as const, code: 'ORIGIN_INVALID' as const });
  }
  if (cookies.malformed || cookies.duplicateNames.has(CSRF_COOKIE_NAME)) {
    return Object.freeze({ accepted: false as const, code: 'CSRF_INVALID' as const });
  }

  const csrfCookie = cookies.values.get(CSRF_COOKIE_NAME);
  const csrfHeader = oneHeader(request.headers, 'x-csrf-token');
  if (csrfCookie === undefined || !csrfHeader.present || 'ambiguous' in csrfHeader) {
    return Object.freeze({ accepted: false as const, code: 'CSRF_REQUIRED' as const });
  }
  if (!compareCsrfTokensV1(csrfCookie, csrfHeader.value)) {
    return Object.freeze({ accepted: false as const, code: 'CSRF_INVALID' as const });
  }
  return Object.freeze({ accepted: true as const });
}

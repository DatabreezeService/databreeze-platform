const COOKIE_NAME_PATTERN_V1 = /^[A-Za-z0-9_]+$/u;
const COOKIE_VALUE_PATTERN_V1 = /^[A-Za-z0-9._~-]+$/u;

export const COOKIE_LIMITS_V1 = Object.freeze({
  headerLength: 8_192,
  nameLength: 64,
  valueLength: 4_096,
  segments: 64,
} as const);

export const REFRESH_COOKIE_NAME_V1 = 'databreeze_refresh';
export const CSRF_COOKIE_NAME_V1 = 'databreeze_csrf';

export interface CookieOptionsV1 {
  readonly httpOnly: boolean;
  readonly maxAgeSeconds: number;
  readonly path?: string;
}

function validCookieNameV1(name: string): boolean {
  return name.length <= COOKIE_LIMITS_V1.nameLength && COOKIE_NAME_PATTERN_V1.test(name);
}

function validCookieValueV1(value: string): boolean {
  return value.length <= COOKIE_LIMITS_V1.valueLength && COOKIE_VALUE_PATTERN_V1.test(value);
}

function cookiePathV1(path: string | undefined): string {
  if (path === undefined || path === '/') return '/';
  if (path === '/api/iam/session') return path;
  throw new Error('Cookie path is invalid');
}

export function serializeCookieV1(name: string, value: string, options: CookieOptionsV1): string {
  if (!validCookieNameV1(name) || !validCookieValueV1(value)) {
    throw new Error('Cookie name or value is invalid');
  }
  if (!Number.isSafeInteger(options.maxAgeSeconds) || options.maxAgeSeconds < 0) {
    throw new Error('Cookie max age is invalid');
  }
  return [
    `${name}=${value}`,
    `Max-Age=${options.maxAgeSeconds}`,
    `Path=${cookiePathV1(options.path)}`,
    options.httpOnly ? 'HttpOnly' : undefined,
    'Secure',
    'SameSite=Lax',
  ]
    .filter((part): part is string => part !== undefined)
    .join('; ');
}

export function clearCookieV1(
  name: string,
  options: Pick<CookieOptionsV1, 'httpOnly' | 'path'>,
): string {
  if (!validCookieNameV1(name)) throw new Error('Cookie name is invalid');
  return [
    `${name}=`,
    'Max-Age=0',
    `Path=${cookiePathV1(options.path)}`,
    options.httpOnly ? 'HttpOnly' : undefined,
    'Secure',
    'SameSite=Lax',
  ]
    .filter((part): part is string => part !== undefined)
    .join('; ');
}

/** Read one unencoded, token-shaped cookie without accepting duplicate names. */
export function readCookieValueV1(rawCookie: unknown, name: string): string | undefined {
  if (
    typeof rawCookie !== 'string' ||
    rawCookie.length > COOKIE_LIMITS_V1.headerLength ||
    !validCookieNameV1(name)
  ) {
    return undefined;
  }
  const segments = rawCookie.split(';');
  if (segments.length > COOKIE_LIMITS_V1.segments) return undefined;
  let found: string | undefined;
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) continue;
    const equals = trimmed.indexOf('=');
    if (equals <= 0) return undefined;
    const segmentName = trimmed.slice(0, equals).trim();
    const segmentValue = trimmed.slice(equals + 1).trim();
    if (!validCookieNameV1(segmentName) || !validCookieValueV1(segmentValue)) return undefined;
    if (segmentName !== name) continue;
    if (found !== undefined) return undefined;
    found = segmentValue;
  }
  return found;
}

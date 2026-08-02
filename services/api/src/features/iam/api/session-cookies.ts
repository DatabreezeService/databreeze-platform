const COOKIE_NAME_PATTERN_V1 = /^[A-Za-z0-9_]+$/u;
const COOKIE_VALUE_PATTERN_V1 = /^[A-Za-z0-9_-]+$/u;

export const REFRESH_COOKIE_NAME_V1 = 'databreeze_refresh';
export const CSRF_COOKIE_NAME_V1 = 'databreeze_csrf';

export interface CookieOptionsV1 {
  readonly httpOnly: boolean;
  readonly maxAgeSeconds: number;
}

function validCookieNameV1(name: string): boolean {
  return COOKIE_NAME_PATTERN_V1.test(name);
}

function validCookieValueV1(value: string): boolean {
  return COOKIE_VALUE_PATTERN_V1.test(value);
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
    'Path=/',
    options.httpOnly ? 'HttpOnly' : undefined,
    'Secure',
    'SameSite=Lax',
  ]
    .filter((part): part is string => part !== undefined)
    .join('; ');
}

/** Read one unencoded, token-shaped cookie without accepting duplicate names. */
export function readCookieValueV1(rawCookie: unknown, name: string): string | undefined {
  if (typeof rawCookie !== 'string' || !validCookieNameV1(name)) return undefined;
  let found: string | undefined;
  for (const segment of rawCookie.split(';')) {
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

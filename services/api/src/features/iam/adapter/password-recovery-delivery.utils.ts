import type { RecoveryLocaleV1 } from '../application/recovery-repository.port.js';

const EMAIL_ADDRESS_PATTERN_V1 = /^[^\s@]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/u;
const RECOVERY_TOKEN_PATTERN_V1 = /^[A-Za-z0-9_-]{32,512}$/u;
const RESET_PASSWORD_PATH_PATTERN_V1 = /^\/(?:vi-VN|en)\/reset-password$/u;

export function validPasswordRecoveryEmailV1(value: string): boolean {
  return (
    value.length <= 320 &&
    !value.includes('\r') &&
    !value.includes('\n') &&
    EMAIL_ADDRESS_PATTERN_V1.test(value)
  );
}

export function validRecoveryLocaleV1(value: string): value is RecoveryLocaleV1 {
  return value === 'vi-VN' || value === 'en';
}

export function validRecoveryTokenV1(value: string): boolean {
  return RECOVERY_TOKEN_PATTERN_V1.test(value) && !/\p{Cc}/u.test(value);
}

export function validRecoveryExpiryV1(value: string): boolean {
  try {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
  } catch {
    return false;
  }
}

function loopbackHostname(value: string): boolean {
  return value === '127.0.0.1' || value === 'localhost' || value === '::1' || value === '[::1]';
}

function validRecoveryOriginV1(value: string, allowLoopbackHttp: boolean): boolean {
  try {
    const parsed = new URL(value);
    const validProtocol =
      parsed.protocol === 'https:' ||
      (allowLoopbackHttp && parsed.protocol === 'http:' && loopbackHostname(parsed.hostname));
    return (
      validProtocol &&
      parsed.hostname.length > 0 &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      value === parsed.origin
    );
  } catch {
    return false;
  }
}

export function createPasswordRecoveryUrlV1(
  webOrigin: string,
  locale: RecoveryLocaleV1,
  rawToken: string,
  allowLoopbackHttp = false,
): string | undefined {
  if (
    !validRecoveryOriginV1(webOrigin, allowLoopbackHttp) ||
    !validRecoveryLocaleV1(locale) ||
    !validRecoveryTokenV1(rawToken)
  ) {
    return undefined;
  }
  try {
    const url = new URL(`/${locale}/reset-password`, webOrigin);
    url.searchParams.set('token', rawToken);
    if (!RESET_PASSWORD_PATH_PATTERN_V1.test(url.pathname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

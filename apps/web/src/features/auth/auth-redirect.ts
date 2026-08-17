import { SUPPORTED_LOCALES_V1 } from '@databreeze/i18n/v1';

const AUTH_REDIRECT_ORIGIN = 'https://app.databreeze.local';
const MAX_RETURN_TARGET_LENGTH = 2_048;
const PUBLIC_AUTH_ROUTES = new Set([
  'sign-in',
  'register',
  'verify-email',
  'forgot-password',
  'reset-password',
]);

export function createSignInRedirect(input: {
  readonly locale: 'en' | 'vi-VN';
  readonly returnTo: string;
}): string {
  const parameters = new URLSearchParams();
  parameters.set('returnTo', input.returnTo);
  return `/${input.locale}/sign-in?${parameters.toString()}`;
}

/** Keep auth handoffs same-origin and limited to a localized product route. */
export function readAuthReturnTarget(search: string): string | undefined {
  const candidate = new URLSearchParams(search).get('returnTo');
  if (
    candidate === null ||
    candidate.length === 0 ||
    candidate.length > MAX_RETURN_TARGET_LENGTH ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//')
  )
    return undefined;

  let parsed: URL;
  try {
    parsed = new URL(candidate, AUTH_REDIRECT_ORIGIN);
  } catch {
    return undefined;
  }
  if (parsed.origin !== AUTH_REDIRECT_ORIGIN) return undefined;

  const segments = parsed.pathname.split('/').filter(Boolean);
  const routeLocale = segments[0];
  const route = segments[1];
  if (
    routeLocale === undefined ||
    !SUPPORTED_LOCALES_V1.includes(routeLocale as 'en' | 'vi-VN') ||
    (route !== undefined && PUBLIC_AUTH_ROUTES.has(route))
  )
    return undefined;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

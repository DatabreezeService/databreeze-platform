import type { AuthApiV1 } from './auth-api.ts';
import { clearAuthSessionV1, rememberAuthBootstrapV1, type WebAuthenticationStateV1 } from './auth-session.ts';

const PUBLIC_AUTH_ROUTES_V1 = new Set(['sign-in', 'register', 'verify-email']);
const PUBLIC_LOCALES_V1 = new Set(['en', 'vi-VN']);

function isPublicPathV1(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return true;
  const locale = segments[0];
  if (locale === undefined || !PUBLIC_LOCALES_V1.has(locale)) return false;
  return segments.length === 1 || PUBLIC_AUTH_ROUTES_V1.has(segments[1] ?? '');
}

export interface RecoverSessionBeforeAppStartInputV1 {
  readonly api: Pick<AuthApiV1, 'recoverWebSession' | 'loadBootstrap'>;
  readonly pathname: string;
  readonly replace: (pathname: string) => void;
}

export interface StartWebApplicationInputV1 extends RecoverSessionBeforeAppStartInputV1 {
  readonly mount: () => void;
}

function routeV1(pathname: string): { readonly locale: 'en' | 'vi-VN'; readonly section?: string } {
  const segments = pathname.split('/').filter(Boolean);
  const locale = segments[0] === 'en' ? 'en' : 'vi-VN';
  return Object.freeze({ locale, ...(segments[1] === undefined ? {} : { section: segments[1] }) });
}

/** IAM-023/WEB-002/WEB-004: finish cookie recovery before protected UI is mounted. */
export async function recoverSessionBeforeAppStartV1(
  input: RecoverSessionBeforeAppStartInputV1,
): Promise<WebAuthenticationStateV1> {
  clearAuthSessionV1();
  let recovered = false;
  try {
    recovered = (await input.api.recoverWebSession()).accepted;
  } catch {
    recovered = false;
  }
  if (recovered) {
    try {
      const bootstrap = await input.api.loadBootstrap();
      if (bootstrap.accepted && rememberAuthBootstrapV1(bootstrap.value)) return 'signed-in';
    } catch {
      // Bootstrap is required to bind every protected route to server-derived scope.
    }
  }

  clearAuthSessionV1();
  if (!isPublicPathV1(input.pathname)) {
    const route = routeV1(input.pathname);
    input.replace(`/${route.locale}/sign-in`);
  }
  return 'signed-out';
}

export async function startWebApplicationV1(input: StartWebApplicationInputV1): Promise<void> {
  await recoverSessionBeforeAppStartV1(input);
  input.mount();
}

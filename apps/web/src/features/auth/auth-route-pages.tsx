import { useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import { createAuthApiV1 } from './auth-api.ts';
import {
  clearAuthSessionV1,
  rememberAuthBootstrapV1,
  rememberAuthSessionV1,
} from './auth-session.ts';
import { RegisterPage } from './register-page.tsx';
import { ForgotPasswordPage } from './forgot-password-page.tsx';
import { ResetPasswordPage } from './reset-password-page.tsx';
import { SignInPage } from './sign-in-page.tsx';
import { VerifyEmailPage } from './verify-email-page.tsx';

function authApi() {
  const configuredBaseUrl = (import.meta.env as Record<string, unknown>)[
    'VITE_DATABREEZE_API_BASE_URL'
  ];
  return createAuthApiV1({
    baseUrl: typeof configuredBaseUrl === 'string' ? configuredBaseUrl : '',
  });
}

async function establishProductSession(
  api: ReturnType<typeof authApi>,
  session: Parameters<typeof rememberAuthSessionV1>[0],
) {
  rememberAuthSessionV1(session);
  const bootstrap = await api.loadBootstrap();
  if (bootstrap.accepted && rememberAuthBootstrapV1(bootstrap.value))
    return { accepted: true as const };
  clearAuthSessionV1();
  return { accepted: false as const, code: 'AUTH_FAILED' as const };
}

export function SignInRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  const navigate = useNavigate();
  const api = useMemo(authApi, []);
  return (
    <SignInPage
      locale={locale}
      onSignedIn={async (input) => {
        try {
          const result = await api.signInWithPassword(input);
          if (result.accepted) {
            const established = await establishProductSession(api, result.value);
            if (established.accepted) {
              void navigate(`/${locale}/data`, { replace: true });
              return { accepted: true };
            }
          }
        } catch {
          clearAuthSessionV1();
        }

        return { accepted: false };
      }}
    />
  );
}

export function RegisterRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  const navigate = useNavigate();
  const api = useMemo(authApi, []);
  return (
    <RegisterPage
      locale={locale}
      onRegistered={async (input) => {
        const result = await api.register(input);
        if (result.accepted)
          void navigate(`/${locale}/verify-email`, {
            state: { challengeId: result.value.challengeId, email: input.email },
          });
        return result;
      }}
    />
  );
}

export function VerifyEmailRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  const navigate = useNavigate();
  const location = useLocation();
  const api = useMemo(authApi, []);
  const state =
    typeof location.state === 'object' && location.state !== null
      ? (location.state as Record<string, unknown>)
      : {};
  const challengeId = typeof state['challengeId'] === 'string' ? state['challengeId'] : undefined;
  const email = typeof state['email'] === 'string' ? state['email'] : '';
  if (!challengeId)
    return (
      <main className="auth-page">
        <p role="alert">
          {locale === 'vi-VN'
            ? 'Phiên đăng ký đã hết hạn. Vui lòng đăng ký lại.'
            : 'Registration expired. Please register again.'}
        </p>
      </main>
    );
  return (
    <VerifyEmailPage
      email={email}
      initialSeconds={600}
      locale={locale}
      onVerified={async ({ code }) => {
        const result = await api.verifyEmailRegistration({
          challengeId,
          code,
          idempotencyKey: crypto.randomUUID(),
        });
        if (result.accepted) {
          const established = await establishProductSession(api, result.value);
          if (!established.accepted) return established;
          void navigate(`/${locale}/data`, { replace: true });
        }
        return result;
      }}
    />
  );
}

export function ForgotPasswordRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  const api = useMemo(authApi, []);
  return (
    <ForgotPasswordPage locale={locale} onRequested={(input) => api.requestPasswordReset(input)} />
  );
}

export function ResetPasswordRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  const location = useLocation();
  const api = useMemo(authApi, []);
  const token = new URLSearchParams(location.search).get('token') ?? '';
  return (
    <ResetPasswordPage
      locale={locale}
      token={token}
      onReset={(input) => api.completePasswordReset(input)}
    />
  );
}

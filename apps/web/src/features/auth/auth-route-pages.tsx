import { useParams } from 'react-router-dom';
import { normalizeRouteLocale } from '../../app/locale-context.tsx';
import { RegisterPage } from './register-page.tsx';
import { SignInPage } from './sign-in-page.tsx';
import { VerifyEmailPage } from './verify-email-page.tsx';

export function SignInRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  return (
    <SignInPage
      locale={locale}
      onSignedIn={() => {
        globalThis.location.assign(`/${locale}/dashboards`);
      }}
    />
  );
}

export function RegisterRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  return (
    <RegisterPage
      locale={locale}
      onRegistered={() => {
        globalThis.location.assign(`/${locale}/verify-email`);
      }}
    />
  );
}

export function VerifyEmailRoutePage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  return (
    <VerifyEmailPage
      email="user@example.com"
      initialSeconds={30}
      locale={locale}
      onVerified={() => {
        globalThis.location.assign(`/${locale}/dashboards`);
      }}
    />
  );
}

import { formatMessageV1 } from '@databreeze/i18n/v1';
import { Status } from '@databreeze/ui/v1';
import { Link, useParams } from 'react-router-dom';
import { getFeatureRegistration } from '../app/feature-registry.ts';
import { normalizeRouteLocale, useLocale } from '../app/locale-context.tsx';
import { appMessage } from '../app/messages.ts';
import type { NavigationKey } from '../app/navigation.ts';

function featureLabel(locale: ReturnType<typeof useLocale>, key: NavigationKey): string {
  const registration = getFeatureRegistration(key);
  if (registration.messageKey !== undefined) {
    return formatMessageV1(locale, registration.messageKey);
  }
  if (key === 'usage') return appMessage(locale, 'nav.usage');
  return appMessage(locale, 'nav.administration');
}

export function UnavailableFeature({ featureKey }: { readonly featureKey: NavigationKey }) {
  const locale = useLocale();
  return (
    <section className="feature-placeholder">
      <h1>{featureLabel(locale, featureKey)}</h1>
      <Status kind="info">{appMessage(locale, 'placeholder.unavailable')}</Status>
      <p>{appMessage(locale, 'placeholder.body')}</p>
      <Link className="text-action" to={`/${locale}/workspace`}>
        {appMessage(locale, 'action.backWorkspace')}
      </Link>
    </section>
  );
}

export function NotFoundPage() {
  const locale = useLocale();
  return (
    <section className="feature-placeholder">
      <h1>{appMessage(locale, 'notFound.title')}</h1>
      <p>{appMessage(locale, 'notFound.body')}</p>
      <Link className="text-action" to={`/${locale}/workspace`}>
        {appMessage(locale, 'action.backWorkspace')}
      </Link>
    </section>
  );
}

export function RouteErrorPage() {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  return (
    <main className="standalone-state" id="main-content">
      <div className="standalone-state__content">
        <h1>{appMessage(locale, 'error.title')}</h1>
        <p>{appMessage(locale, 'error.body')}</p>
        <Link className="text-action" to={`/${locale}/workspace`}>
          {appMessage(locale, 'action.backWorkspace')}
        </Link>
      </div>
    </main>
  );
}

export function RouteFailure(): never {
  throw new Error('ROUTE_RENDER_FAILURE');
}

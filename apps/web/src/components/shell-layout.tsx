import wordmarkUrl from '@databreeze/design-tokens/brand/generated/web/navigation-wordmark-blue-204x50.png';
import { formatMessageV1 } from '@databreeze/i18n/v1';
import { Button } from '@databreeze/ui/v1';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { getFeatureRegistration } from '../app/feature-registry.ts';
import { LocaleProvider, normalizeRouteLocale } from '../app/locale-context.tsx';
import { appMessage } from '../app/messages.ts';
import {
  filterNavigationItems,
  type NavigationKey,
  type WebAccessContext,
} from '../app/navigation.ts';
import { BellIcon, MenuIcon, SearchIcon, XIcon } from './icons.tsx';

const MOBILE_QUERY = '(max-width: 767px)';

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia(MOBILE_QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return undefined;
    const mediaQuery = globalThis.matchMedia(MOBILE_QUERY);
    const update = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return isMobile;
}

function navigationLabel(locale: 'en' | 'vi-VN', key: NavigationKey): string {
  const registration = getFeatureRegistration(key);
  if (registration.messageKey !== undefined)
    return formatMessageV1(locale, registration.messageKey);
  if (key === 'usage') return appMessage(locale, 'nav.usage');
  if (key === 'administration') return appMessage(locale, 'nav.administration');
  return appMessage(locale, 'nav.audit');
}

export function ShellLayout({ accessContext }: { readonly accessContext: WebAccessContext }) {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  const location = useLocation();
  const isMobile = useIsMobile();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');
  const navigationItems = useMemo(() => filterNavigationItems(accessContext), [accessContext]);
  const alternateLocale = locale === 'en' ? 'vi-VN' : 'en';
  const logicalPath = location.pathname.split('/').slice(2).join('/');
  const alternatePath = `/${alternateLocale}/${logicalPath}${location.search}${location.hash}`;

  useEffect(() => {
    setNavigationOpen(false);
  }, [location.pathname]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchStatus(appMessage(locale, 'placeholder.unavailable'));
  }

  return (
    <LocaleProvider locale={locale}>
      <a className="skip-link" href="#main-content">
        {appMessage(locale, 'skip.main')}
      </a>
      <div className="app-shell">
        <header className="topbar">
          <Link
            aria-label={`DataBreeze — ${appMessage(locale, 'home.heading')}`}
            className="brand-link"
            to={`/${locale}/workspace`}
          >
            <img alt="DataBreeze" height="50" src={wordmarkUrl} width="204" />
          </Link>
          {isMobile ? (
            <Button
              aria-controls="primary-navigation"
              aria-expanded={navigationOpen}
              aria-label={appMessage(locale, navigationOpen ? 'nav.close' : 'nav.open')}
              className="icon-button mobile-menu-button"
              onClick={() => setNavigationOpen((open) => !open)}
              variant="secondary"
            >
              {navigationOpen ? <XIcon /> : <MenuIcon />}
            </Button>
          ) : null}
          <form
            aria-label={appMessage(locale, 'search.label')}
            className="global-search"
            onSubmit={handleSearch}
            role="search"
          >
            <SearchIcon />
            <label className="sr-only" htmlFor="global-search-input">
              {appMessage(locale, 'search.label')}
            </label>
            <input
              id="global-search-input"
              name="query"
              placeholder={appMessage(locale, 'search.placeholder')}
              type="search"
            />
            <button className="sr-only" type="submit">
              {formatMessageV1(locale, 'action.search')}
            </button>
          </form>
          <div className="topbar__actions">
            <Link className="locale-link" to={alternatePath}>
              {appMessage(
                locale,
                alternateLocale === 'vi-VN' ? 'locale.vietnamese' : 'locale.english',
              )}
            </Link>
            <Button
              aria-expanded={notificationsOpen}
              aria-label={appMessage(locale, 'notifications.label')}
              className="icon-button"
              onClick={() => setNotificationsOpen((open) => !open)}
              variant="secondary"
            >
              <BellIcon />
            </Button>
          </div>
          {searchStatus === '' ? null : (
            <p className="sr-only" role="status">
              {searchStatus}
            </p>
          )}
          {notificationsOpen ? (
            <div className="notification-panel">
              <p>{appMessage(locale, 'notifications.label')}</p>
              <ul>
                <li>{appMessage(locale, 'home.item.review')}</li>
                <li>{appMessage(locale, 'home.item.approval')}</li>
              </ul>
            </div>
          ) : null}
        </header>
        <aside className="context-rail" aria-label={formatMessageV1(locale, 'scope.workspace')}>
          <button type="button">
            <span>{formatMessageV1(locale, 'scope.organization')}</span>
            <strong>{appMessage(locale, 'context.organization')}</strong>
          </button>
          <button type="button">
            <span>{formatMessageV1(locale, 'scope.workspace')}</span>
            <strong>{appMessage(locale, 'context.workspace')}</strong>
          </button>
          <button type="button">
            <span>{formatMessageV1(locale, 'scope.project')}</span>
            <strong>{appMessage(locale, 'context.project')}</strong>
          </button>
        </aside>
        <nav
          aria-label={appMessage(locale, 'nav.label')}
          className="primary-navigation"
          hidden={isMobile && !navigationOpen}
          id="primary-navigation"
        >
          <ul>
            {navigationItems.map((item) => (
              <li key={item.key}>
                <NavLink
                  className={({ isActive }) =>
                    isActive ? 'primary-navigation__link is-active' : 'primary-navigation__link'
                  }
                  end
                  to={`/${locale}/${item.path}`}
                >
                  {navigationLabel(locale, item.key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="main-workspace" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </LocaleProvider>
  );
}

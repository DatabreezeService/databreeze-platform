import wordmarkUrl from '@databreeze/design-tokens/brand/generated/web/navigation-wordmark-blue-204x50.png';
import { formatMessageV1 } from '@databreeze/i18n/v1';
import { Button } from '@databreeze/ui/v1';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { LocaleProvider, normalizeRouteLocale } from '../app/locale-context.tsx';
import { appMessage } from '../app/messages.ts';
import type { WebAccessContext } from '../app/navigation.ts';
import {
  UDW_PRIMARY_NAV_ITEMS_V1,
  udwPrimaryNavLabelV1,
} from '../app/unified-primary-navigation.ts';
import { WorkspaceSwitcher } from '../features/workspace/workspace-switcher.tsx';
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

export function ShellLayout({ accessContext }: { readonly accessContext: WebAccessContext }) {
  void accessContext;
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  const location = useLocation();
  const isMobile = useIsMobile();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');
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

  const primaryNavigation = (
    <ul>
      {UDW_PRIMARY_NAV_ITEMS_V1.map((item) => (
        <li key={item.key}>
          <NavLink
            className={({ isActive }) =>
              isActive ? 'primary-navigation__link is-active' : 'primary-navigation__link'
            }
            end
            to={`/${locale}/${item.path}`}
          >
            {udwPrimaryNavLabelV1(locale, item.key)}
          </NavLink>
        </li>
      ))}
    </ul>
  );

  return (
    <LocaleProvider locale={locale}>
      <a className="skip-link" href="#main-content">
        {appMessage(locale, 'skip.main')}
      </a>
      <div className="app-shell">
        <header className="topbar">
          <Link
            aria-label={`DataBreeze: ${appMessage(locale, 'home.heading')}`}
            className="brand-link"
            to={`/${locale}/dashboards`}
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
            <label className="sr-only" htmlFor="global-search-input">
              {appMessage(locale, 'search.label')}
            </label>
            <input
              id="global-search-input"
              name="query"
              placeholder={appMessage(locale, 'search.placeholder')}
              type="search"
            />
            <Button
              aria-label={formatMessageV1(locale, 'action.search')}
              className="search-submit"
              type="submit"
              variant="secondary"
            >
              <SearchIcon />
              <span>{formatMessageV1(locale, 'action.search')}</span>
            </Button>
          </form>
          <div className="topbar__actions">
            <WorkspaceSwitcher
              locale={locale}
              workspaces={[{ id: 'ws-1', name: appMessage(locale, 'context.workspace') }]}
            />
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
          <dl>
            <div className="context-rail__item">
              <dt>{formatMessageV1(locale, 'scope.organization')}</dt>
              <dd>{appMessage(locale, 'context.organization')}</dd>
            </div>
            <div className="context-rail__item">
              <dt>{formatMessageV1(locale, 'scope.workspace')}</dt>
              <dd>{appMessage(locale, 'context.workspace')}</dd>
            </div>
            <div className="context-rail__item">
              <dt>{formatMessageV1(locale, 'scope.project')}</dt>
              <dd>{appMessage(locale, 'context.project')}</dd>
            </div>
          </dl>
        </aside>
        <nav
          aria-label={appMessage(locale, 'nav.label')}
          className="primary-navigation"
          hidden={isMobile && !navigationOpen}
          id="primary-navigation"
        >
          {primaryNavigation}
        </nav>
        <main className="main-workspace" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </LocaleProvider>
  );
}

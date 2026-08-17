import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LocaleProvider, normalizeRouteLocale } from '../app/locale-context.tsx';
import { appMessage } from '../app/messages.ts';
import { filterNavigationItems, type WebAccessContext } from '../app/navigation.ts';
import { UDW_PRIMARY_NAV_ITEMS_V1 } from '../app/unified-primary-navigation.ts';
import { createAuthApiV1 } from '../features/auth/auth-api.ts';
import { currentAuthBootstrapV1, subscribeAuthSessionV1 } from '../features/auth/auth-session.ts';
import { ApplicationRail } from './application-rail.tsx';
import {
  readSidebarCompactPreference,
  writeSidebarCompactPreference,
} from './sidebar-preference.ts';
import { WorkspaceTopbar } from './workspace-topbar.tsx';
import '../styles/workspace-shell.css';

const MOBILE_QUERY = '(max-width: 767px)';
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return undefined;
    const mediaQuery = globalThis.matchMedia(query);
    const update = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** WEB-002/013/014/022: shared shell keeps routes and server-authorized feature boundaries intact. */
export function ShellLayout({ accessContext }: { readonly accessContext: WebAccessContext }) {
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const isTablet = useMediaQuery(TABLET_QUERY);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [sidebarPreference, setSidebarPreference] = useState<boolean | undefined>(() =>
    readSidebarCompactPreference(),
  );
  const bootstrap = useSyncExternalStore(
    subscribeAuthSessionV1,
    currentAuthBootstrapV1,
    currentAuthBootstrapV1,
  );
  const scopeKey =
    bootstrap === undefined
      ? undefined
      : `${bootstrap.session.organizationId}:${bootstrap.session.scopeType === 'organization' ? '' : bootstrap.session.workspaceId}`;
  const previousScopeKey = useRef<string | undefined>(undefined);
  const logicalPath = location.pathname.split('/').filter(Boolean).slice(1).join('/');
  const isDashboardWorkspace = logicalPath === 'dashboards';
  const isAnalysisWorkspace = logicalPath === 'analysis';
  const sidebarCollapsed = !isMobile && (sidebarPreference ?? isTablet);
  const secondaryKeys = new Set(['inbox', 'reviews', 'administration']);
  const secondaryItems = filterNavigationItems(accessContext).filter((item) =>
    secondaryKeys.has(item.key),
  );

  useEffect(() => {
    if (previousScopeKey.current !== undefined && previousScopeKey.current !== scopeKey)
      queryClient.clear();
    previousScopeKey.current = scopeKey;
  }, [queryClient, scopeKey]);

  useEffect(() => {
    setNavigationOpen(false);
  }, [location.pathname]);

  return (
    <LocaleProvider locale={locale}>
      <a className="skip-link" href="#main-content">
        {appMessage(locale, 'skip.main')}
      </a>
      <div
        className={`app-shell${isDashboardWorkspace ? ' app-shell--dashboard' : ''}`}
        data-sidebar-collapsed={sidebarCollapsed}
      >
        <WorkspaceTopbar
          {...(bootstrap === undefined ? {} : { bootstrap })}
          dashboardMode={isDashboardWorkspace}
          isMobile={isMobile}
          locale={locale}
          mobileNavigationOpen={navigationOpen}
          onMobileNavigationOpenChange={setNavigationOpen}
          onSignOut={async () => {
            const result = await createAuthApiV1({
              baseUrl: import.meta.env['VITE_DATABREEZE_API_BASE_URL'] ?? '',
            }).signOut();
            if (result.accepted) navigate(`/${locale}/sign-in`, { replace: true });
          }}
        />
        <ApplicationRail
          collapsed={sidebarCollapsed}
          isMobile={isMobile}
          items={UDW_PRIMARY_NAV_ITEMS_V1}
          locale={locale}
          mobileOpen={navigationOpen}
          onCollapsedChange={(collapsed) => {
            setSidebarPreference(collapsed);
            writeSidebarCompactPreference(collapsed);
          }}
          onMobileOpenChange={setNavigationOpen}
          secondaryItems={secondaryItems}
        />
        <main
          className={`main-workspace${isDashboardWorkspace ? ' main-workspace--dashboard' : ''}${isAnalysisWorkspace ? ' main-workspace--analysis' : ''}`}
          id="main-content"
          tabIndex={-1}
        >
          <Outlet />
        </main>
      </div>
    </LocaleProvider>
  );
}

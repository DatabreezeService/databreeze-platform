import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LocaleProvider, normalizeRouteLocale } from '../app/locale-context.tsx';
import { appMessage } from '../app/messages.ts';
import type { WebAccessContext } from '../app/navigation.ts';
import { UDW_PRIMARY_NAV_ITEMS_V1 } from '../app/unified-primary-navigation.ts';
import { DashboardWorkspace } from '../features/dashboards/dashboard-workspace.tsx';
import { createAuthApiV1 } from '../features/auth/auth-api.ts';
import { currentAuthBootstrapV1 } from '../features/auth/auth-session.ts';
import { ApplicationRail } from './application-rail.tsx';
import { WorkspaceTopbar } from './workspace-topbar.tsx';
import '../styles/workspace-shell.css';

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

/** WEB-002/013/014/022: shared shell keeps routes and server-authorized feature boundaries intact. */
export function ShellLayout({ accessContext }: { readonly accessContext: WebAccessContext }) {
  void accessContext;
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const bootstrap = currentAuthBootstrapV1();
  const logicalPath = location.pathname.split('/').filter(Boolean).slice(1).join('/');
  const isDashboardWorkspace = logicalPath === 'dashboards';

  useEffect(() => {
    setNavigationOpen(false);
  }, [location.pathname]);

  return (
    <LocaleProvider locale={locale}>
      <a className="skip-link" href="#main-content">
        {appMessage(locale, 'skip.main')}
      </a>
      <div className={`app-shell${isDashboardWorkspace ? ' app-shell--dashboard' : ''}`}>
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
          isMobile={isMobile}
          items={UDW_PRIMARY_NAV_ITEMS_V1}
          locale={locale}
          mobileOpen={navigationOpen}
          onMobileOpenChange={setNavigationOpen}
        />
        <main
          className={`main-workspace${isDashboardWorkspace ? ' main-workspace--dashboard' : ''}`}
          id="main-content"
          tabIndex={-1}
        >
          {isDashboardWorkspace ? (
            <DashboardWorkspace locale={locale}>
              <Outlet />
            </DashboardWorkspace>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </LocaleProvider>
  );
}

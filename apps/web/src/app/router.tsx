import { DEFAULT_LOCALE_V1, SUPPORTED_LOCALES_V1 } from '@databreeze/i18n/v1';
import { lazy, Suspense, useSyncExternalStore, type ReactElement } from 'react';
import {
  Navigate,
  Outlet,
  createBrowserRouter,
  createMemoryRouter,
  redirect,
  type LoaderFunctionArgs,
  type RouteObject,
  useLocation,
  useParams,
} from 'react-router-dom';
import { ShellLayout } from '../components/shell-layout.tsx';
import { NotFoundPage, RouteErrorPage, RouteFailure } from '../pages/shell-states.tsx';
import { PRODUCT_MODULE_REGISTRY } from '../features/product-modules/product-module-registry.ts';
import { normalizeRouteLocale } from './locale-context.tsx';
import { WEB_FEATURE_REGISTRY } from './feature-registry.ts';
import {
  DEFAULT_ACCESS_CONTEXT,
  EMPTY_ACCESS_CONTEXT,
  type WebAccessContext,
} from './navigation.ts';
import {
  currentWebAuthenticationStateV1,
  initializeWebAuthenticationStateV1,
  subscribeWebAuthenticationStateV1,
  type WebAuthenticationStateV1,
} from '../features/auth/auth-session.ts';
import { createSignInRedirect } from '../features/auth/auth-redirect.ts';
import { localMockPaymentsEnabled } from '../features/billing/billing-config.ts';

/**
 * Keep Ajv-backed contract validators out of the UDW shell chunk so preview CSP
 * (`script-src 'self'` without unsafe-eval) can render Dashboards/Analysis/Data.
 */
const DataPipelinePage = lazy(async () => {
  const module = await import('../features/data-intake/data-pipeline-page.tsx');
  return { default: module.DataPipelinePage };
});
/**
 * The data workspace (tree, agent dock, cleaning engine, parsers) is a heavy
 * route-level chunk so the initial JavaScript budget stays intact.
 */
const DataRoutePage = lazy(async () => {
  const module = await import('../features/data/data-route-page.tsx');
  return { default: module.DataRoutePage };
});
const DashboardPage = lazy(async () => {
  const module = await import('../features/dashboards/dashboard-page.tsx');
  return { default: module.DashboardPage };
});
const DataDashboardPreviewPage = lazy(async () => {
  const module = await import('../features/dashboards/data-dashboard-preview-page.tsx');
  return { default: module.DataDashboardPreviewPage };
});
const AnalysisRoutePage = lazy(async () => {
  const module = await import('../features/analysis/analysis-route-page.tsx');
  return { default: module.AnalysisRoutePage };
});
const DownloadsRoutePage = lazy(async () => {
  const module = await import('../features/downloads/downloads-page.tsx');
  return { default: module.DownloadsRoutePage };
});
const LandingRoutePage = lazy(async () => {
  const module = await import('../features/landing/landing-page.tsx');
  return { default: module.LandingRoutePage };
});
const ForgotPasswordRoutePage = lazy(async () => {
  const module = await import('../features/auth/auth-route-pages.tsx');
  return { default: module.ForgotPasswordRoutePage };
});
const SignInRoutePage = lazy(async () => {
  const module = await import('../features/auth/auth-route-pages.tsx');
  return { default: module.SignInRoutePage };
});
const RegisterRoutePage = lazy(async () => {
  const module = await import('../features/auth/auth-route-pages.tsx');
  return { default: module.RegisterRoutePage };
});
const ResetPasswordRoutePage = lazy(async () => {
  const module = await import('../features/auth/auth-route-pages.tsx');
  return { default: module.ResetPasswordRoutePage };
});
const VerifyEmailRoutePage = lazy(async () => {
  const module = await import('../features/auth/auth-route-pages.tsx');
  return { default: module.VerifyEmailRoutePage };
});
const InboxPage = lazy(async () => {
  const module = await import('../features/inbox/inbox-page.tsx');
  return { default: module.InboxPage };
});
const ApprovalPage = lazy(async () => {
  const module = await import('../features/approvals/approval-page.tsx');
  return { default: module.ApprovalPage };
});
const AuditPage = lazy(async () => {
  const module = await import('../features/audit/audit-page.tsx');
  return { default: module.AuditPage };
});
const DevicePage = lazy(async () => {
  const module = await import('../features/devices/device-page.tsx');
  return { default: module.DevicePage };
});
const ProductModuleWorkbench = lazy(async () => {
  const module = await import('../features/product-modules/product-module-workbench.tsx');
  return { default: module.ProductModuleWorkbench };
});
const WorkspaceSettingsRoutePage = lazy(async () => {
  const module = await import('../features/settings/workspace-settings-page.tsx');
  return { default: module.WorkspaceSettingsRoutePage };
});
const InvitationAcceptPage = lazy(async () => {
  const module = await import('../features/settings/invitation-accept-page.tsx');
  return { default: module.InvitationAcceptPage };
});
const BillingPage = lazy(async () => {
  const module = await import('../features/billing/billing-page.tsx');
  return { default: module.BillingPage };
});
const BillingReturnPage = lazy(async () => {
  const module = await import('../features/billing/billing-page.tsx');
  return { default: module.BillingReturnPage };
});
const BillingMockCheckoutPage = lazy(async () => {
  const module = await import('../features/billing/billing-mock-checkout-page.tsx');
  return { default: module.BillingMockCheckoutPage };
});
const UsagePage = lazy(async () => {
  const module = await import('../features/usage/usage-page.tsx');
  return { default: module.UsagePage };
});
const PlatformAdminRoutePage = lazy(async () => {
  const module = await import('../features/platform-admin/platform-admin-page.tsx');
  return { default: module.PlatformAdminRoutePage };
});
const JobsPage = lazy(async () => {
  const module = await import('../features/jobs/jobs-page.tsx');
  return { default: module.JobsPage };
});
const ReportsPage = lazy(async () => {
  const module = await import('../features/reports/reports-page.tsx');
  return { default: module.ReportsPage };
});

function Suspended({ children }: { readonly children: ReactElement }) {
  return <Suspense fallback={<div aria-hidden="true" />}>{children}</Suspense>;
}

const logicalRoots = new Set([
  ...WEB_FEATURE_REGISTRY.map((feature) => feature.path),
  'modules',
  'analysis',
  'data',
  'settings',
  'invitations',
  'sign-in',
  'register',
  'verify-email',
  'downloads',
  'forgot-password',
  'reset-password',
  'platform-admin',
]);

function canonicalPathname(pathname: string): string | undefined {
  if (pathname === '/') return `/${DEFAULT_LOCALE_V1}`;
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (first !== undefined && SUPPORTED_LOCALES_V1.includes(first as 'en' | 'vi-VN'))
    return undefined;
  if (first !== undefined && logicalRoots.has(first)) return `/${DEFAULT_LOCALE_V1}${pathname}`;
  if (segments.length > 1) return `/${DEFAULT_LOCALE_V1}/${segments.slice(1).join('/')}`;
  return `/${DEFAULT_LOCALE_V1}${pathname}`;
}

function canonicalLocaleLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const pathname = canonicalPathname(url.pathname);
  return pathname === undefined ? null : redirect(`${pathname}${url.search}${url.hash}`);
}

function WorkspaceSettingsRoute() {
  const { locale } = useParams();
  return <WorkspaceSettingsRoutePage locale={locale === 'en' ? 'en' : 'vi-VN'} />;
}

function DashboardsRoute() {
  const location = useLocation();
  const importId = new URLSearchParams(location.search).get('importId');
  return (
    <Suspended>
      {importId === null ? <DashboardPage /> : <DataDashboardPreviewPage importId={importId} />}
    </Suspended>
  );
}

function AuthenticationGate({ publicRoute }: { readonly publicRoute: boolean }) {
  const authenticationState = useSyncExternalStore(
    subscribeWebAuthenticationStateV1,
    currentWebAuthenticationStateV1,
    currentWebAuthenticationStateV1,
  );
  const { locale: routeLocale } = useParams();
  const location = useLocation();
  const locale = normalizeRouteLocale(routeLocale);
  if (publicRoute && authenticationState === 'signed-in')
    return <Navigate replace to={`/${locale}/data`} />;
  if (!publicRoute && authenticationState === 'signed-out')
    return (
      <Navigate
        replace
        to={createSignInRedirect({
          locale,
          returnTo: `${location.pathname}${location.search}${location.hash}`,
        })}
      />
    );
  return <Outlet />;
}

function createRoutes(accessContext: WebAccessContext): RouteObject[] {
  return [
    {
      path: '/',
      loader: canonicalLocaleLoader,
      // The loader handles browser requests; the element keeps memory-router
      // transitions and hydration from ever rendering an empty leaf page.
      element: <Navigate replace to={`/${DEFAULT_LOCALE_V1}`} />,
      hydrateFallbackElement: <div aria-hidden="true" />,
    },
    {
      path: '/:locale',
      loader: canonicalLocaleLoader,
      errorElement: <RouteErrorPage />,
      hydrateFallbackElement: <div aria-hidden="true" />,
      children: [
        {
          path: 'downloads',
          element: (
            <Suspended>
              <DownloadsRoutePage />
            </Suspended>
          ),
        },
        {
          element: <AuthenticationGate publicRoute />,
          children: [
            {
              index: true,
              element: (
                <Suspended>
                  <LandingRoutePage />
                </Suspended>
              ),
            },
            {
              path: 'sign-in',
              element: (
                <Suspended>
                  <SignInRoutePage />
                </Suspended>
              ),
            },
            {
              path: 'register',
              element: (
                <Suspended>
                  <RegisterRoutePage />
                </Suspended>
              ),
            },
            {
              path: 'verify-email',
              element: (
                <Suspended>
                  <VerifyEmailRoutePage />
                </Suspended>
              ),
            },
            {
              path: 'forgot-password',
              element: (
                <Suspended>
                  <ForgotPasswordRoutePage />
                </Suspended>
              ),
            },
            {
              path: 'reset-password',
              element: (
                <Suspended>
                  <ResetPasswordRoutePage />
                </Suspended>
              ),
            },
          ],
        },
        {
          element: <AuthenticationGate publicRoute={false} />,
          children: [
            {
              path: 'platform-admin',
              element: (
                <Suspended>
                  <PlatformAdminRoutePage />
                </Suspended>
              ),
            },
            {
              element: <ShellLayout accessContext={accessContext} />,
              children: [
                { path: 'workspace', element: <Navigate replace to="../dashboards" /> },
                { path: 'settings', element: <WorkspaceSettingsRoute /> },
                {
                  path: 'invitations/accept',
                  element: (
                    <Suspended>
                      <InvitationAcceptPage />
                    </Suspended>
                  ),
                },
                {
                  path: 'analysis',
                  element: (
                    <Suspended>
                      <AnalysisRoutePage />
                    </Suspended>
                  ),
                },
                {
                  path: 'data',
                  element: (
                    <Suspended>
                      <DataRoutePage />
                    </Suspended>
                  ),
                },
                {
                  path: 'billing',
                  element: (
                    <Suspended>
                      <BillingPage />
                    </Suspended>
                  ),
                },
                {
                  path: 'billing/mock-checkout/:orderCode',
                  element: localMockPaymentsEnabled() ? (
                    <Suspended>
                      <BillingMockCheckoutPage />
                    </Suspended>
                  ) : (
                    <NotFoundPage />
                  ),
                },
                {
                  path: 'billing/success',
                  element: (
                    <Suspended>
                      <BillingReturnPage />
                    </Suspended>
                  ),
                },
                {
                  path: 'billing/failed',
                  element: (
                    <Suspended>
                      <BillingReturnPage />
                    </Suspended>
                  ),
                },
                ...WEB_FEATURE_REGISTRY.filter((feature) => feature.key !== 'workspace').map(
                  (feature) => ({
                    path: feature.path,
                    element:
                      feature.key === 'inbox' ? (
                        <Suspended>
                          <InboxPage />
                        </Suspended>
                      ) : feature.key === 'approvals' ? (
                        <Suspended>
                          <ApprovalPage />
                        </Suspended>
                      ) : feature.key === 'audit' ? (
                        <Suspended>
                          <AuditPage />
                        </Suspended>
                      ) : feature.key === 'devices' ? (
                        <Suspended>
                          <DevicePage />
                        </Suspended>
                      ) : feature.key === 'reviews' ? (
                        <Suspended>
                          <DataPipelinePage />
                        </Suspended>
                      ) : feature.key === 'dashboards' ? (
                        <DashboardsRoute />
                      ) : feature.key === 'usage' ? (
                        <Suspended>
                          <UsagePage />
                        </Suspended>
                      ) : feature.key === 'administration' ? (
                        <WorkspaceSettingsRoute />
                      ) : feature.key === 'jobs' ? (
                        <Suspended>
                          <JobsPage />
                        </Suspended>
                      ) : feature.key === 'reports' ? (
                        <Suspended>
                          <ReportsPage />
                        </Suspended>
                      ) : null,
                  }),
                ),
                ...PRODUCT_MODULE_REGISTRY.map((module) => ({
                  path: `modules/${module.slug}`,
                  element: (
                    <Suspended>
                      <ProductModuleWorkbench module={module} />
                    </Suspended>
                  ),
                })),
                { path: 'debug/route-error', element: <RouteFailure /> },
                { path: '*', element: <NotFoundPage /> },
              ],
            },
          ],
        },
      ],
    },
    {
      path: '*',
      loader: canonicalLocaleLoader,
      hydrateFallbackElement: <div aria-hidden="true" />,
    },
  ];
}

export interface CreateAppRouterOptions {
  readonly accessContext?: WebAccessContext;
  readonly authenticationState?: WebAuthenticationStateV1;
  readonly initialEntries?: readonly string[];
}

export function createAppRouter(options: CreateAppRouterOptions = {}) {
  initializeWebAuthenticationStateV1(options.authenticationState ?? 'signed-in');
  return createMemoryRouter(createRoutes(options.accessContext ?? DEFAULT_ACCESS_CONTEXT), {
    initialEntries: [...(options.initialEntries ?? [`/${DEFAULT_LOCALE_V1}/dashboards`])],
  });
}

export function createBrowserAppRouter(
  accessContext: WebAccessContext = browserNavigationHints(),
  authenticationState: WebAuthenticationStateV1 = currentWebAuthenticationStateV1(),
) {
  initializeWebAuthenticationStateV1(authenticationState);
  return createBrowserRouter(createRoutes(accessContext));
}

/**
 * Local development needs discoverable links for every route we are actively
 * testing (especially Reviews/Inbox), while production must never invent
 * permissions. These are presentation hints only; every API and route still
 * reauthorizes the authenticated request server-side.
 */
function browserNavigationHints(): WebAccessContext {
  const environment = import.meta.env as unknown as Readonly<Record<string, unknown>>;
  const localHints =
    environment['VITE_DATABREEZE_LOCAL_NAVIGATION_HINTS'] === 'true' ||
    environment['VITE_DATABREEZE_DEMO_MODE'] === 'true';
  return localHints ? DEFAULT_ACCESS_CONTEXT : EMPTY_ACCESS_CONTEXT;
}

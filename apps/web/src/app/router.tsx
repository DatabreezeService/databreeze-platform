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
  useParams,
} from 'react-router-dom';
import { ShellLayout } from '../components/shell-layout.tsx';
import {
  NotFoundPage,
  RouteErrorPage,
  RouteFailure,
  UnavailableFeature,
} from '../pages/shell-states.tsx';
import { DashboardPage } from '../features/dashboards/dashboard-page.tsx';
import { AnalysisRoutePage } from '../features/analysis/analysis-route-page.tsx';
import { DataRoutePage } from '../features/data/data-route-page.tsx';
import { BillingPage, BillingReturnPage } from '../features/billing/billing-page.tsx';
import { BillingMockCheckoutPage } from '../features/billing/billing-mock-checkout-page.tsx';
import { UsagePage } from '../features/usage/usage-page.tsx';
import { DownloadsRoutePage } from '../features/downloads/downloads-page.tsx';
import {
  ForgotPasswordRoutePage,
  SignInRoutePage,
  RegisterRoutePage,
  ResetPasswordRoutePage,
  VerifyEmailRoutePage,
} from '../features/auth/auth-route-pages.tsx';
import { LandingRoutePage } from '../features/landing/landing-page.tsx';
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

/**
 * Keep Ajv-backed contract validators out of the UDW shell chunk so preview CSP
 * (`script-src 'self'` without unsafe-eval) can render Dashboards/Analysis/Data.
 */
const DataPipelinePage = lazy(async () => {
  const module = await import('../features/data-intake/data-pipeline-page.tsx');
  return { default: module.DataPipelinePage };
});
const InboxPage = lazy(async () => {
  const module = await import('../features/inbox/inbox-page.tsx');
  return { default: module.InboxPage };
});
const ProductModuleWorkbench = lazy(async () => {
  const module = await import('../features/product-modules/product-module-workbench.tsx');
  return { default: module.ProductModuleWorkbench };
});
const WorkspaceSettingsRoutePage = lazy(async () => {
  const module = await import('../features/settings/workspace-settings-page.tsx');
  return { default: module.WorkspaceSettingsRoutePage };
});
const PlatformAdminRoutePage = lazy(async () => {
  const module = await import('../features/platform-admin/platform-admin-page.tsx');
  return { default: module.PlatformAdminRoutePage };
});

function Suspended({ children }: { readonly children: ReactElement }) {
  return <Suspense fallback={<div aria-hidden="true" />}>{children}</Suspense>;
}

const logicalRoots = new Set([
  ...WEB_FEATURE_REGISTRY.map((feature) => feature.path),
  'modules',
  'analysis',
  'data',
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

function AuthenticationGate({ publicRoute }: { readonly publicRoute: boolean }) {
  const authenticationState = useSyncExternalStore(
    subscribeWebAuthenticationStateV1,
    currentWebAuthenticationStateV1,
    currentWebAuthenticationStateV1,
  );
  const { locale: routeLocale } = useParams();
  const locale = normalizeRouteLocale(routeLocale);
  if (publicRoute && authenticationState === 'signed-in')
    return <Navigate replace to={`/${locale}/data`} />;
  if (!publicRoute && authenticationState === 'signed-out')
    return <Navigate replace to={`/${locale}/sign-in`} />;
  return <Outlet />;
}

function createRoutes(accessContext: WebAccessContext): RouteObject[] {
  return [
    {
      path: '/',
      loader: canonicalLocaleLoader,
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
          element: <DownloadsRoutePage />,
        },
        {
          element: <AuthenticationGate publicRoute />,
          children: [
            { index: true, element: <LandingRoutePage /> },
            { path: 'sign-in', element: <SignInRoutePage /> },
            { path: 'register', element: <RegisterRoutePage /> },
            { path: 'verify-email', element: <VerifyEmailRoutePage /> },
            { path: 'forgot-password', element: <ForgotPasswordRoutePage /> },
            { path: 'reset-password', element: <ResetPasswordRoutePage /> },
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
                { path: 'analysis', element: <AnalysisRoutePage /> },
                { path: 'data', element: <DataRoutePage /> },
                { path: 'billing', element: <BillingPage /> },
                {
                  path: 'billing/mock-checkout/:orderCode',
                  element:
                    import.meta.env['VITE_DATABREEZE_DEMO_MODE'] === 'true' ? (
                      <BillingMockCheckoutPage />
                    ) : (
                      <NotFoundPage />
                    ),
                },
                { path: 'billing/success', element: <BillingReturnPage /> },
                { path: 'billing/failed', element: <BillingReturnPage /> },
                ...WEB_FEATURE_REGISTRY.filter((feature) => feature.key !== 'workspace').map(
                  (feature) => ({
                    path: feature.path,
                    element:
                      feature.key === 'inbox' ? (
                        <Suspended>
                          <InboxPage />
                        </Suspended>
                      ) : feature.key === 'reviews' ? (
                        <Suspended>
                          <DataPipelinePage />
                        </Suspended>
                      ) : feature.key === 'dashboards' ? (
                        <DashboardPage />
                      ) : feature.key === 'usage' ? (
                        <UsagePage />
                      ) : feature.key === 'administration' ? (
                        <WorkspaceSettingsRoute />
                      ) : (
                        <UnavailableFeature featureKey={feature.key} />
                      ),
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
  accessContext: WebAccessContext = EMPTY_ACCESS_CONTEXT,
  authenticationState: WebAuthenticationStateV1 = currentWebAuthenticationStateV1(),
) {
  initializeWebAuthenticationStateV1(authenticationState);
  return createBrowserRouter(createRoutes(accessContext));
}

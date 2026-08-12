import { DEFAULT_LOCALE_V1, SUPPORTED_LOCALES_V1 } from '@databreeze/i18n/v1';
import { lazy, Suspense, type ReactElement } from 'react';
import {
  Navigate,
  createBrowserRouter,
  createMemoryRouter,
  redirect,
  type LoaderFunctionArgs,
  type RouteObject,
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
import {
  SignInRoutePage,
  RegisterRoutePage,
  VerifyEmailRoutePage,
} from '../features/auth/auth-route-pages.tsx';
import { PRODUCT_MODULE_REGISTRY } from '../features/product-modules/product-module-registry.ts';
import { WEB_FEATURE_REGISTRY } from './feature-registry.ts';
import { DEFAULT_ACCESS_CONTEXT, type WebAccessContext } from './navigation.ts';

/**
 * Keep Ajv-backed contract validators out of the UDW shell chunk so preview CSP
 * (`script-src 'self'` without unsafe-eval) can render Dashboards/Analysis/Data.
 */
const InboxPage = lazy(async () => {
  const module = await import('../features/inbox/inbox-page.tsx');
  return { default: module.InboxPage };
});
const DataPipelinePage = lazy(async () => {
  const module = await import('../features/data-intake/data-pipeline-page.tsx');
  return { default: module.DataPipelinePage };
});
const ProductModuleWorkbench = lazy(async () => {
  const module = await import('../features/product-modules/product-module-workbench.tsx');
  return { default: module.ProductModuleWorkbench };
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
]);

function canonicalPathname(pathname: string): string | undefined {
  if (pathname === '/') return `/${DEFAULT_LOCALE_V1}/dashboards`;
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
      element: <ShellLayout accessContext={accessContext} />,
      errorElement: <RouteErrorPage />,
      hydrateFallbackElement: <div aria-hidden="true" />,
      children: [
        { index: true, element: <Navigate replace to="dashboards" /> },
        { path: 'workspace', element: <Navigate replace to="../dashboards" /> },
        { path: 'analysis', element: <AnalysisRoutePage /> },
        { path: 'data', element: <DataRoutePage /> },
        { path: 'sign-in', element: <SignInRoutePage /> },
        { path: 'register', element: <RegisterRoutePage /> },
        { path: 'verify-email', element: <VerifyEmailRoutePage /> },
        ...WEB_FEATURE_REGISTRY.filter((feature) => feature.key !== 'workspace').map((feature) => ({
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
            ) : (
              <UnavailableFeature featureKey={feature.key} />
            ),
        })),
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
    {
      path: '*',
      loader: canonicalLocaleLoader,
      hydrateFallbackElement: <div aria-hidden="true" />,
    },
  ];
}

export interface CreateAppRouterOptions {
  readonly accessContext?: WebAccessContext;
  readonly initialEntries?: readonly string[];
}

export function createAppRouter(options: CreateAppRouterOptions = {}) {
  return createMemoryRouter(createRoutes(options.accessContext ?? DEFAULT_ACCESS_CONTEXT), {
    initialEntries: [...(options.initialEntries ?? [`/${DEFAULT_LOCALE_V1}/dashboards`])],
  });
}

export function createBrowserAppRouter(accessContext: WebAccessContext = DEFAULT_ACCESS_CONTEXT) {
  return createBrowserRouter(createRoutes(accessContext));
}

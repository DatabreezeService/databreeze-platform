import { DEFAULT_LOCALE_V1, SUPPORTED_LOCALES_V1 } from '@databreeze/i18n/v1';
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
import { WorkspaceHome } from '../pages/workspace-home.tsx';
import { InboxPage } from '../features/inbox/inbox-page.tsx';
import { DashboardPage } from '../features/dashboards/dashboard-page.tsx';
import { DataPipelinePage } from '../features/data-intake/data-pipeline-page.tsx';
import { PRODUCT_MODULE_REGISTRY } from '../features/product-modules/product-module-registry.ts';
import { ProductModuleWorkbench } from '../features/product-modules/product-module-workbench.tsx';
import { WEB_FEATURE_REGISTRY } from './feature-registry.ts';
import { DEFAULT_ACCESS_CONTEXT, type WebAccessContext } from './navigation.ts';

const logicalRoots = new Set([...WEB_FEATURE_REGISTRY.map((feature) => feature.path), 'modules']);

function canonicalPathname(pathname: string): string | undefined {
  if (pathname === '/') return `/${DEFAULT_LOCALE_V1}/workspace`;
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
        { index: true, element: <Navigate replace to="workspace" /> },
        { path: 'workspace', element: <WorkspaceHome accessContext={accessContext} /> },
        ...WEB_FEATURE_REGISTRY.filter((feature) => feature.key !== 'workspace').map((feature) => ({
          path: feature.path,
          element:
            feature.key === 'inbox' ? (
              <InboxPage />
            ) : feature.key === 'reviews' ? (
              <DataPipelinePage />
            ) : feature.key === 'dashboards' ? (
              <DashboardPage />
            ) : (
              <UnavailableFeature featureKey={feature.key} />
            ),
        })),
        ...PRODUCT_MODULE_REGISTRY.map((module) => ({
          path: `modules/${module.slug}`,
          element: <ProductModuleWorkbench module={module} />,
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
    initialEntries: [...(options.initialEntries ?? [`/${DEFAULT_LOCALE_V1}/workspace`])],
  });
}

export function createBrowserAppRouter(accessContext: WebAccessContext = DEFAULT_ACCESS_CONTEXT) {
  return createBrowserRouter(createRoutes(accessContext));
}

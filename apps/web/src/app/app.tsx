import { QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AppErrorBoundary } from './error-boundary.tsx';
import { normalizeRouteLocale } from './locale-context.tsx';
import { createWebQueryClient } from './query-client.ts';
import { createAppRouter, createBrowserAppRouter } from './router.tsx';

export { filterNavigationItems } from './navigation.ts';
export { createWebQueryClient } from './query-client.ts';
export { createAppRouter, createBrowserAppRouter };

export interface ApplicationBoundaryProperties {
  readonly children?: ReactNode;
  readonly router?: ReturnType<typeof createAppRouter>;
}

const subscribeToNothing = () => () => undefined;

export function ApplicationBoundary({ children, router }: ApplicationBoundaryProperties) {
  const [queryClient] = useState(createWebQueryClient);
  const subscribe = useCallback(
    (notify: () => void) =>
      router === undefined ? subscribeToNothing() : router.subscribe(() => notify()),
    [router],
  );
  const getPathname = useCallback(() => router?.state.location.pathname ?? '/', [router]);
  const pathname = useSyncExternalStore(subscribe, getPathname, () => '/');
  const locale = normalizeRouteLocale(pathname.split('/').filter(Boolean)[0]);
  const content = children ?? (router === undefined ? null : <RouterProvider router={router} />);
  return (
    <AppErrorBoundary locale={locale}>
      <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
    </AppErrorBoundary>
  );
}

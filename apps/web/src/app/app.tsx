import { QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_LOCALE_V1, type SupportedLocaleV1 } from '@databreeze/i18n/v1';
import { useState, type ReactNode } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AppErrorBoundary } from './error-boundary.tsx';
import { createWebQueryClient } from './query-client.ts';
import { createAppRouter, createBrowserAppRouter } from './router.tsx';

export { filterNavigationItems } from './navigation.ts';
export { createWebQueryClient } from './query-client.ts';
export { createAppRouter, createBrowserAppRouter };

export interface ApplicationBoundaryProperties {
  readonly children?: ReactNode;
  readonly locale?: SupportedLocaleV1;
  readonly router?: ReturnType<typeof createAppRouter>;
}

export function ApplicationBoundary({
  children,
  locale = DEFAULT_LOCALE_V1,
  router,
}: ApplicationBoundaryProperties) {
  const [queryClient] = useState(createWebQueryClient);
  const content = router === undefined ? children : <RouterProvider router={router} />;
  return (
    <AppErrorBoundary locale={locale}>
      <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
    </AppErrorBoundary>
  );
}

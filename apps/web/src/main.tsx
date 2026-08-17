import appleTouchIconUrl from '@databreeze/design-tokens/brand/generated/web/apple-touch-icon-180.png';
import faviconUrl from '@databreeze/design-tokens/brand/generated/web/favicon-32.png';
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/latin-500.css';
import '@fontsource/be-vietnam-pro/vietnamese-500.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/latin-700.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
import '@databreeze/design-tokens/css/v1';
import '@databreeze/ui/styles/v1';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApplicationBoundary, createBrowserAppRouter } from './app/app.tsx';
import { createAuthApiV1 } from './features/auth/auth-api.ts';
import { startWebApplicationV1 } from './features/auth/auth-bootstrap.ts';
import { installSessionAwareFetchV1 } from './features/auth/auth-session.ts';
import './styles.css';
import './styles/dashboard-canvas.css';
import './styles/dashboard-agent.css';
import './styles/data-intake.css';

const rootElement = globalThis.document.querySelector('#root');
if (!(rootElement instanceof HTMLElement)) throw new Error('WEB_ROOT_MISSING');

const favicon = globalThis.document.querySelector<HTMLLinkElement>('#app-favicon');
const appleTouchIcon = globalThis.document.querySelector<HTMLLinkElement>('#app-apple-touch-icon');
if (favicon !== null) favicon.href = faviconUrl;
if (appleTouchIcon !== null) appleTouchIcon.href = appleTouchIconUrl;

const runtimeEnvironment = import.meta.env as unknown as Readonly<Record<string, unknown>>;
const configuredApiBaseUrl = runtimeEnvironment['VITE_DATABREEZE_API_BASE_URL'];
const apiBaseUrl = typeof configuredApiBaseUrl === 'string' ? configuredApiBaseUrl : '';
const browserFetch = globalThis.fetch.bind(globalThis);
installSessionAwareFetchV1({ apiBaseUrl, fetcher: browserFetch });

await startWebApplicationV1({
  api: createAuthApiV1({ baseUrl: apiBaseUrl, fetcher: browserFetch }),
  pathname: globalThis.location.pathname,
  search: globalThis.location.search,
  hash: globalThis.location.hash,
  replace: (pathname) => globalThis.location.replace(pathname),
  mount: () => {
    createRoot(rootElement).render(
      <StrictMode>
        <ApplicationBoundary router={createBrowserAppRouter()} />
      </StrictMode>,
    );
  },
});

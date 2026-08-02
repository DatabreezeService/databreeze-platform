import appleTouchIconUrl from '@databreeze/design-tokens/brand/generated/web/apple-touch-icon-180.png';
import faviconUrl from '@databreeze/design-tokens/brand/generated/web/favicon-32.png';
import '@databreeze/design-tokens/css/v1';
import '@databreeze/ui/styles/v1';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApplicationBoundary, createBrowserAppRouter } from './app/app.tsx';
import './styles.css';

const rootElement = globalThis.document.querySelector('#root');
if (!(rootElement instanceof HTMLElement)) throw new Error('WEB_ROOT_MISSING');

const favicon = globalThis.document.querySelector<HTMLLinkElement>('#app-favicon');
const appleTouchIcon = globalThis.document.querySelector<HTMLLinkElement>('#app-apple-touch-icon');
if (favicon !== null) favicon.href = faviconUrl;
if (appleTouchIcon !== null) appleTouchIcon.href = appleTouchIconUrl;

createRoot(rootElement).render(
  <StrictMode>
    <ApplicationBoundary router={createBrowserAppRouter()} />
  </StrictMode>,
);

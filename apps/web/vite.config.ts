import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

import { WEB_SECURITY_HEADERS } from './security-headers.ts';
import { teammateLandingPrototypePlugin } from './vite-landing-prototype.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const DEFAULT_LOCAL_API_TARGET = 'http://127.0.0.1:3000';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function validateLocalApiTarget(rawTarget: string): string {
  let target: URL;
  try {
    target = new URL(rawTarget);
  } catch {
    throw new Error('Vite API proxy target must be loopback HTTP');
  }

  if (
    target.protocol !== 'http:' ||
    !LOOPBACK_HOSTS.has(target.hostname) ||
    target.username !== '' ||
    target.password !== '' ||
    target.pathname !== '/' ||
    target.search !== '' ||
    target.hash !== ''
  ) {
    throw new Error('Vite API proxy target must be loopback HTTP');
  }

  return target.toString().replace(/\/$/, '');
}

export function createLocalDevProxy(
  rawTarget = process.env['VITE_DATABREEZE_API_PROXY_TARGET'] ?? DEFAULT_LOCAL_API_TARGET,
) {
  const target = validateLocalApiTarget(rawTarget);
  return Object.fromEntries(
    ['/v1', '/v3', '/v4', '/health'].map((pathPrefix) => [
      pathPrefix,
      {
        target,
        changeOrigin: false,
      },
    ]),
  );
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), teammateLandingPrototypePlugin()],
  ...(command === 'serve'
    ? {
        server: {
          host: '127.0.0.1',
          port: 5173,
          strictPort: true,
          proxy: createLocalDevProxy(),
          fs: { allow: [searchForWorkspaceRoot(process.cwd()), REPO_ROOT] },
        },
      }
    : {}),
  preview: {
    headers: WEB_SECURITY_HEADERS,
  },
}));

import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';

const LANDING_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../prototypes/databreeze-landing',
);

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function serveTeammateLanding(
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
) {
  const relative = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
  const candidate = path.resolve(LANDING_ROOT, relative === '/' ? 'index.html' : `.${relative}`);
  const withinRoot =
    candidate === LANDING_ROOT || candidate.startsWith(`${LANDING_ROOT}${path.sep}`);
  if (!withinRoot || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    next();
    return;
  }

  response.setHeader(
    'Content-Type',
    CONTENT_TYPES[path.extname(candidate)] ?? 'application/octet-stream',
  );
  fs.createReadStream(candidate).pipe(response);
}

export function teammateLandingPrototypePlugin(): Plugin {
  let outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist');

  return {
    name: 'teammate-landing-prototype',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/landing', serveTeammateLanding);
    },
    closeBundle() {
      fs.cpSync(LANDING_ROOT, path.join(outDir, 'landing'), { recursive: true });
    },
  };
}

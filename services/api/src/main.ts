import { createApiApplication } from './bootstrap.js';

function listenPort(): number {
  const value = process.env['PORT'];
  if (value === undefined) return 3000;
  if (!/^\d{1,5}$/.test(value)) throw new Error('PORT must be an integer from 1 through 65535');
  const port = Number(value);
  if (port < 1 || port > 65_535) throw new Error('PORT must be an integer from 1 through 65535');
  return port;
}

async function main(): Promise<void> {
  const { app } = await createApiApplication();
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  await app.listen({ host: '0.0.0.0', port: listenPort() });
}

void main();

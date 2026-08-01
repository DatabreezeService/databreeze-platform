import assert from 'node:assert/strict';
import test from 'node:test';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

interface ApiApplication {
  readonly app: NestFastifyApplication;
  readonly openApi: unknown;
}

type ApiFactory = (options?: { readonly readinessPort?: unknown }) => Promise<ApiApplication>;

async function loadFactory(): Promise<ApiFactory | undefined> {
  const bootstrapModule = await import('../src/bootstrap.js').catch(() => undefined);
  if (bootstrapModule === undefined) return undefined;
  return bootstrapModule.createApiApplication as ApiFactory;
}

void test('exports a closeable Fastify application factory', async () => {
  const createApiApplication = await loadFactory();

  assert.equal(typeof createApiApplication, 'function');
});

void test('boots, serves liveness through Fastify injection, and closes without identifying the framework', async () => {
  const createApiApplication = await loadFactory();
  assert.ok(createApiApplication);
  const created = await createApiApplication().catch(() => undefined);
  assert.ok(created, 'the application factory must initialize successfully');

  try {
    const response = await created.app.inject({ method: 'GET', url: '/health/live' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
    assert.match(String(response.headers['x-request-id'] ?? ''), /^[0-9a-f-]{36}$/i);
    assert.equal(response.headers['x-correlation-id'], response.headers['x-request-id']);
    assert.equal(response.headers['x-powered-by'], undefined);

    const secondResponse = await created.app.inject({ method: 'GET', url: '/health/live' });
    assert.notEqual(secondResponse.headers['x-request-id'], response.headers['x-request-id']);
  } finally {
    await created.app.close();
  }
});

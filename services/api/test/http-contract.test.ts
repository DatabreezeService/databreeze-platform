import assert from 'node:assert/strict';
import type { OutgoingHttpHeaders } from 'node:http';
import test from 'node:test';

import { parseV1Contract } from '@databreeze/contracts/v1';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { createApiApplication } from '../src/bootstrap.js';

interface InjectResponse {
  readonly body: string;
  readonly headers: OutgoingHttpHeaders;
  readonly statusCode: number;
  json(): Record<string, unknown>;
}

function responseHeader(response: InjectResponse, name: string): string {
  const value = response.headers[name];
  return Array.isArray(value) ? (value[0] ?? '') : String(value ?? '');
}

const problemSchemaId = 'https://schemas.databreeze.dev/contracts/v1/problem-details';
const correlationId = '123e4567-e89b-42d3-a456-426614174000';
const secondCorrelationId = '018f1f08-7b2c-7c74-8e12-f639c7c92b15';
const leakedMarker = 'do-not-leak-7f6290';

async function withApp(
  options: Parameters<typeof createApiApplication>[0],
  run: (app: NestFastifyApplication) => Promise<void>,
): Promise<void> {
  const { app } = await createApiApplication(options);
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

function assertResponseIdentifiers(response: InjectResponse): void {
  assert.match(responseHeader(response, 'x-request-id'), /^[0-9a-f-]{36}$/i);
  assert.match(responseHeader(response, 'x-correlation-id'), /^[0-9a-f-]{36}$/i);
}

function assertProblem(response: InjectResponse, status: number, code: string): void {
  assert.equal(response.statusCode, status);
  assert.match(responseHeader(response, 'content-type'), /^application\/problem\+json/);
  assertResponseIdentifiers(response);
  const body: unknown = response.json();
  assert.deepEqual(parseV1Contract(problemSchemaId, body), { accepted: true, value: body });
  assert.equal((body as { code: unknown }).code, code);
  assert.equal(
    (body as { correlationId: unknown }).correlationId,
    responseHeader(response, 'x-correlation-id'),
  );
}

void test('reports ready only through the injectable readiness port and minimizes failed-check details', async () => {
  await withApp({ readinessPort: { check: () => Promise.resolve(true) } }, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ready' });
    assertResponseIdentifiers(response);
  });

  await withApp(
    { readinessPort: { check: () => Promise.reject(new Error(`postgres ${leakedMarker}`)) } },
    async (app) => {
      const response = await app.inject({ method: 'GET', url: '/health/ready' });
      assertProblem(response, 503, 'NOT_READY');
      assert.doesNotMatch(response.body, new RegExp(leakedMarker));
      assert.doesNotMatch(response.body, /postgres/i);
    },
  );
});

void test('propagates one valid correlation UUID while generating a distinct request UUID', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-correlation-id': correlationId },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['x-correlation-id'], correlationId);
    assert.notEqual(response.headers['x-request-id'], correlationId);
  });
});

void test('rejects malformed and multiple correlation values without reflecting them', async () => {
  await withApp({}, async (app) => {
    const malformed = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-correlation-id': leakedMarker },
    });
    assertProblem(malformed, 400, 'CORRELATION_ID_INVALID');
    assert.doesNotMatch(malformed.body, new RegExp(leakedMarker));

    const multiple = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-correlation-id': [correlationId, secondCorrelationId] },
    });
    assertProblem(multiple, 400, 'CORRELATION_ID_INVALID');
    assert.doesNotMatch(multiple.body, new RegExp(correlationId));
    assert.doesNotMatch(multiple.body, new RegExp(secondCorrelationId));
  });
});

void test('maps unknown routes to safe Problem Details without exposing the path or query', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: `/missing-${leakedMarker}?token=${leakedMarker}`,
    });
    assertProblem(response, 404, 'ROUTE_NOT_FOUND');
    assert.doesNotMatch(response.body, new RegExp(leakedMarker));
  });
});

void test('validates declared compatibility query fields and rejects unknown query fields safely', async () => {
  await withApp({}, async (app) => {
    const valid = await app.inject({
      method: 'GET',
      url: '/v1/system/compatibility?clientPlatform=web&clientVersion=1.2.3',
    });
    assert.equal(valid.statusCode, 200);
    assert.deepEqual(valid.json(), { apiMajorVersion: 1, status: 'supported' });
    assertResponseIdentifiers(valid);

    const suffixGarbage = await app.inject({
      method: 'GET',
      url: '/v1/system/compatibility?clientPlatform=web&clientVersion=1.2.3garbage',
    });
    assertProblem(suffixGarbage, 400, 'VALIDATION_FAILED');

    const unknown = await app.inject({
      method: 'GET',
      url: `/v1/system/compatibility?clientPlatform=web&${leakedMarker}=secret`,
    });
    assertProblem(unknown, 400, 'VALIDATION_FAILED');
    const unknownBody: unknown = unknown.json();
    assert.deepEqual((unknownBody as Record<string, unknown>)['fieldErrors'], [
      { field: 'request', code: 'UNKNOWN_FIELD' },
    ]);
    assert.doesNotMatch(unknown.body, new RegExp(leakedMarker));
  });
});

void test('validates closed compatibility bodies without implicit scalar coercion', async () => {
  await withApp({}, async (app) => {
    const valid = await app.inject({
      method: 'POST',
      url: '/v1/system/compatibility/check',
      payload: { clientPlatform: 'desktop', clientVersion: '2.4.0' },
    });
    assert.equal(valid.statusCode, 200);
    assert.deepEqual(valid.json(), { apiMajorVersion: 1, status: 'supported' });

    const invalidType = await app.inject({
      method: 'POST',
      url: '/v1/system/compatibility/check',
      payload: { clientPlatform: 'desktop', clientVersion: 24 },
    });
    assertProblem(invalidType, 400, 'VALIDATION_FAILED');
    const invalidTypeBody: unknown = invalidType.json();
    assert.deepEqual((invalidTypeBody as Record<string, unknown>)['fieldErrors'], [
      { field: 'clientVersion', code: 'INVALID_TYPE' },
    ]);

    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/system/compatibility/check',
      payload: { clientPlatform: 'web', clientVersion: '1.0.0', [leakedMarker]: 'secret' },
    });
    assertProblem(unknown, 400, 'VALIDATION_FAILED');
    assert.doesNotMatch(unknown.body, new RegExp(leakedMarker));
  });
});

void test('maps an oversized JSON body to safe Problem Details', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/system/compatibility/check',
      payload: { clientPlatform: 'web', clientVersion: 'a'.repeat(70_000) },
    });
    assertProblem(response, 413, 'PAYLOAD_TOO_LARGE');
    assert.doesNotMatch(response.body, /a{100}/);
  });
});

void test('scrubs unexpected application errors into stable Problem Details', async () => {
  await withApp(
    {
      compatibilityPort: {
        check: () => Promise.reject(new Error(`select * from secret ${leakedMarker}`)),
      },
    },
    async (app) => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/system/compatibility?clientPlatform=web&clientVersion=1.2.3',
      });
      assertProblem(response, 500, 'INTERNAL_ERROR');
      assert.doesNotMatch(response.body, new RegExp(leakedMarker));
      assert.doesNotMatch(response.body, /select|secret/i);
    },
  );
});

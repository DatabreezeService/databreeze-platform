import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { format, resolveConfig } from 'prettier';
import type { OpenAPIObject } from '@nestjs/swagger';

import { createApiApplication } from '../src/bootstrap.js';
import { UnavailablePayosPaymentService } from '../src/features/bua/application/payos-payment.service.js';

void test('the checked-in v1 OpenAPI artifact matches a fresh application generation', async () => {
  const artifactPath = path.resolve(process.cwd(), 'openapi', 'v1.json');
  const actual = await readFile(artifactPath, 'utf8').catch(() => undefined);
  assert.ok(actual, 'openapi/v1.json must be checked in');

  const { app, openApi: rawOpenApi } = await createApiApplication({
    payosPaymentService: new UnavailablePayosPaymentService() as unknown as import('../src/features/bua/application/payos-payment.service.js').PayosPaymentService,
  });
  try {
    const openApi = rawOpenApi as OpenAPIObject;
    assert.ok(openApi.paths['/v1/billing/payos/plans']);
    assert.ok(openApi.paths['/v1/billing/payos/checkout-sessions']);
    assert.ok(openApi.paths['/v1/billing/payos/sessions/{orderCode}']);
    assert.ok(openApi.paths['/v1/billing/payos/webhook']);
    const prettierConfig = (await resolveConfig(artifactPath)) ?? {};
    assert.equal(
      actual,
      await format(JSON.stringify(openApi), {
        ...prettierConfig,
        filepath: artifactPath,
        parser: 'json',
      }),
    );
  } finally {
    await app.close();
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { UnavailablePayosPaymentService } from '../../../src/features/bua/application/payos-payment.service.js';
import { RequestTenantContextProblemError } from '../../../src/platform/http/request-tenant-context.port.js';

void test('[BUA-004] PayOS protected catalog returns canonical authentication failure without leaking a 500', async () => {
  const { app } = await createApiApplication({
    payosPaymentService: new UnavailablePayosPaymentService() as unknown as import('../../../src/features/bua/application/payos-payment.service.js').PayosPaymentService,
    requestTenantContext: { resolve: async () => { throw new RequestTenantContextProblemError('AUTHENTICATION_FAILED'); } },
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/billing/payos/plans' });
    assert.equal(response.statusCode, 401);
    assert.equal((JSON.parse(response.body) as { readonly code?: string }).code, 'AUTHENTICATION_FAILED');
  } finally {
    await app.close();
  }
});

void test('[BUA-001, BUA-002] PayOS checkout rejects client payloads that omit the versioned plan command', async () => {
  const { app } = await createApiApplication({
    payosPaymentService: new UnavailablePayosPaymentService() as unknown as import('../../../src/features/bua/application/payos-payment.service.js').PayosPaymentService,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/billing/payos/checkout-sessions',
      payload: { planId: 'personal-monthly' },
    });
    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

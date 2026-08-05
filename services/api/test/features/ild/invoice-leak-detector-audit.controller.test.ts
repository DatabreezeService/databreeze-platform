import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-00000000b101',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-00000000b102',
    workspaceId: '00000000-0000-4000-8000-00000000b103',
  },
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-00000000b104',
  idempotencyKey: 'invoice-leak-detector-ephemeral-audit',
});
if (!contextResult.accepted) throw new Error('fixture context rejected');

const requestTenantContext: RequestTenantContextPortV1 = {
  resolve: () => Promise.resolve(contextResult.value),
};

const auditRequest = {
  invoice: {
    invoiceId: '00000000-0000-4000-8000-00000000b105',
    artifactVersionId: '00000000-0000-4000-8000-00000000b106',
    contentSha256: 'a'.repeat(64),
    supplierId: '00000000-0000-4000-8000-00000000b107',
    invoiceNumber: 'private-invoice-778',
    invoiceDate: '2026-08-05',
    currency: 'USD',
    total: 45,
    evidence: [{ sourceId: '00000000-0000-4000-8000-00000000b108', locator: 'page:1' }],
    lines: [
      {
        lineId: '00000000-0000-4000-8000-00000000b109',
        description: 'Private service plan',
        quantity: 3,
        unitPrice: 15,
        currency: 'USD',
        evidence: [{ sourceId: '00000000-0000-4000-8000-00000000b108', locator: 'table:1-row:2' }],
      },
    ],
  },
  governingLines: [
    {
      governingLineId: '00000000-0000-4000-8000-00000000b110',
      supplierId: '00000000-0000-4000-8000-00000000b107',
      description: 'Private service plan',
      unitPrice: 10,
      currency: 'USD',
      maxQuantity: 2,
      evidence: [{ sourceId: '00000000-0000-4000-8000-00000000b111', locator: 'record:9' }],
    },
  ],
  historicalInvoices: [
    {
      invoiceId: '00000000-0000-4000-8000-00000000b112',
      supplierId: '00000000-0000-4000-8000-00000000b107',
      contentSha256: 'a'.repeat(64),
      invoiceNumber: 'private-invoice-777',
      invoiceDate: '2026-08-01',
      evidence: [{ sourceId: '00000000-0000-4000-8000-00000000b113', locator: 'page:1' }],
    },
  ],
  tolerance: { amount: 0, percent: 0 },
  calculationVersion: 'ild-preview-v1',
};

void test('[ILD-008, ILD-010, ILD-012, IAM-009] ephemeral audit returns deterministic value-free findings', async () => {
  const { app } = await createApiApplication({ requestTenantContext });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/invoice-leak-detector/ephemeral-audit',
      payload: auditRequest,
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body) as {
      readonly accepted: boolean;
      readonly value: {
        readonly status: string;
        readonly expectedTotal: number | null;
        readonly variance: number | null;
        readonly findings: readonly {
          readonly type: string;
          readonly estimatedExposure: number;
          readonly evidence: readonly { readonly locatorFingerprint: string }[];
          readonly findingFingerprint: string;
        }[];
      };
    };
    assert.equal(body.accepted, true);
    assert.equal(body.value.status, 'NEEDS_REVIEW');
    assert.equal(body.value.expectedTotal, 20);
    assert.equal(body.value.variance, 25);
    assert.deepEqual(
      body.value.findings.map(({ type, estimatedExposure }) => ({ type, estimatedExposure })),
      [
        { type: 'PRICE_OVERCHARGE', estimatedExposure: 15 },
        { type: 'QUANTITY_OVERCHARGE', estimatedExposure: 10 },
        { type: 'DUPLICATE_INVOICE', estimatedExposure: 45 },
      ],
    );
    assert.ok(
      body.value.findings.every((finding) =>
        finding.evidence.every((evidence) => evidence.locatorFingerprint.startsWith('sha256:')),
      ),
    );
    assert.ok(
      body.value.findings.every((finding) => finding.findingFingerprint.startsWith('sha256:')),
    );
    assert.doesNotMatch(
      response.body,
      /private-invoice|Private service plan|page:1|table:1-row:2|record:9|tenantScope|organizationId|workspaceId/u,
    );
  } finally {
    await app.close();
  }
});

void test('[ILD-001, ILD-015] ephemeral audit rejects client scope and local source paths without reflection', async () => {
  const { app } = await createApiApplication({ requestTenantContext });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/invoice-leak-detector/ephemeral-audit',
      payload: {
        ...auditRequest,
        tenantScope: {
          scopeType: 'workspace',
          organizationId: '00000000-0000-4000-8000-00000000b114',
          workspaceId: '00000000-0000-4000-8000-00000000b115',
        },
        localInvoicePath: 'C:\\Private\\invoices\\invoice-778.pdf',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.doesNotMatch(response.body, /C:\\Private|b114|b115/u);
  } finally {
    await app.close();
  }
});

void test('[ILD-001, IAM-009] ephemeral audit requires an exact workspace tenant context', async () => {
  const organizationContextResult = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-00000000b116',
    tenantScope: {
      scopeType: 'organization',
      organizationId: '00000000-0000-4000-8000-00000000b117',
    },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-00000000b118',
    idempotencyKey: 'invoice-leak-detector-organization-context',
  });
  assert.equal(organizationContextResult.accepted, true);
  if (!organizationContextResult.accepted) return;
  const { app } = await createApiApplication({
    requestTenantContext: { resolve: () => Promise.resolve(organizationContextResult.value) },
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/invoice-leak-detector/ephemeral-audit',
      payload: auditRequest,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      accepted: false,
      code: 'WORKSPACE_SCOPE_REQUIRED',
    });
  } finally {
    await app.close();
  }
});

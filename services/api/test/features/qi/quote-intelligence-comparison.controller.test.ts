import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-00000000a101',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-00000000a102',
    workspaceId: '00000000-0000-4000-8000-00000000a103',
  },
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-00000000a104',
  idempotencyKey: 'quote-intelligence-ephemeral-comparison',
});
if (!contextResult.accepted) throw new Error('fixture context rejected');

const requestTenantContext: RequestTenantContextPortV1 = {
  resolve: () => Promise.resolve(contextResult.value),
};

const comparisonRequest = {
  comparisonId: '00000000-0000-4000-8000-00000000a105',
  targetCurrency: 'USD',
  exchangeRates: [
    {
      rateId: '00000000-0000-4000-8000-00000000a106',
      from: 'EUR',
      to: 'USD',
      rate: 1.2,
      effectiveDate: '2026-08-05',
      provenance: 'approved-rate-sheet',
    },
  ],
  quotes: [
    {
      supplierId: '00000000-0000-4000-8000-00000000a107',
      supplierName: 'Private Vendor One',
      freight: 5,
      leadDays: 8,
      evidence: [{ sourceId: '00000000-0000-4000-8000-00000000a108', locator: 'page:1' }],
      lines: [
        {
          lineId: '00000000-0000-4000-8000-00000000a109',
          description: 'Private industrial component',
          quantity: 2,
          unitPrice: 20,
          currency: 'USD',
          taxRate: 0.1,
          evidence: [
            { sourceId: '00000000-0000-4000-8000-00000000a108', locator: 'table:1-row:2' },
          ],
        },
      ],
    },
    {
      supplierId: '00000000-0000-4000-8000-00000000a110',
      supplierName: 'Private Vendor Two',
      freight: 4,
      leadDays: 12,
      evidence: [{ sourceId: '00000000-0000-4000-8000-00000000a111', locator: 'page:1' }],
      lines: [
        {
          lineId: '00000000-0000-4000-8000-00000000a112',
          description: 'Private industrial component',
          quantity: 2,
          unitPrice: 30,
          currency: 'EUR',
          taxRate: 0.1,
          evidence: [
            { sourceId: '00000000-0000-4000-8000-00000000a111', locator: 'table:1-row:2' },
          ],
        },
      ],
    },
  ],
  scoring: {
    policyVersion: 1,
    criteria: [
      {
        key: 'landed-cost',
        direction: 'LOWER_BETTER',
        weight: 100,
        values: {
          '00000000-0000-4000-8000-00000000a107': 49,
          '00000000-0000-4000-8000-00000000a110': 83.2,
        },
      },
    ],
  },
};

void test('[QI-010, QI-012, QI-014, IAM-009] ephemeral comparison returns value-free derived results', async () => {
  const { app } = await createApiApplication({ requestTenantContext });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/quote-intelligence/ephemeral-comparison',
      payload: comparisonRequest,
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body) as {
      readonly accepted: boolean;
      readonly value: {
        readonly status: string;
        readonly candidateSupplierId?: string;
        readonly requiresHumanApproval: boolean;
        readonly suppliers: readonly {
          readonly supplierId: string;
          readonly landedCost: number;
          readonly score?: number;
          readonly evidence: readonly { readonly locatorFingerprint: string }[];
          readonly scoreBreakdown?: readonly { readonly criterionFingerprint: string }[];
        }[];
      };
    };
    assert.equal(body.accepted, true);
    assert.equal(body.value.status, 'READY');
    assert.equal(body.value.candidateSupplierId, '00000000-0000-4000-8000-00000000a107');
    assert.equal(body.value.requiresHumanApproval, true);
    assert.deepEqual(
      body.value.suppliers.map((supplier) => ({
        supplierId: supplier.supplierId,
        landedCost: supplier.landedCost,
        score: supplier.score,
      })),
      [
        { supplierId: '00000000-0000-4000-8000-00000000a107', landedCost: 49, score: 1 },
        { supplierId: '00000000-0000-4000-8000-00000000a110', landedCost: 84, score: 0 },
      ],
    );
    assert.ok(
      body.value.suppliers.every((supplier) =>
        supplier.evidence.every((evidence) => evidence.locatorFingerprint.startsWith('sha256:')),
      ),
    );
    assert.ok(
      body.value.suppliers.every((supplier) =>
        supplier.scoreBreakdown?.every((item) => item.criterionFingerprint.startsWith('sha256:')),
      ),
    );
    assert.doesNotMatch(
      response.body,
      /Private Vendor|Private industrial component|page:1|table:1-row:2|landed-cost|tenantScope|organizationId|workspaceId/u,
    );
  } finally {
    await app.close();
  }
});

void test('[QI-003, QI-020] ephemeral comparison rejects client scope and raw local-source fields without reflection', async () => {
  const { app } = await createApiApplication({ requestTenantContext });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/quote-intelligence/ephemeral-comparison',
      payload: {
        ...comparisonRequest,
        tenantScope: {
          scopeType: 'workspace',
          organizationId: '00000000-0000-4000-8000-00000000a113',
          workspaceId: '00000000-0000-4000-8000-00000000a114',
        },
        rawSourcePath: 'C:\\Private\\quotes\\vendor-one.xlsx',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.doesNotMatch(response.body, /C:\\Private|a113|a114/u);
  } finally {
    await app.close();
  }
});

void test('[QI-001, IAM-009] ephemeral comparison requires an exact workspace tenant context', async () => {
  const organizationContextResult = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-00000000a115',
    tenantScope: {
      scopeType: 'organization',
      organizationId: '00000000-0000-4000-8000-00000000a116',
    },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-00000000a117',
    idempotencyKey: 'quote-intelligence-organization-context',
  });
  assert.equal(organizationContextResult.accepted, true);
  if (!organizationContextResult.accepted) return;
  const { app } = await createApiApplication({
    requestTenantContext: { resolve: () => Promise.resolve(organizationContextResult.value) },
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/quote-intelligence/ephemeral-comparison',
      payload: comparisonRequest,
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

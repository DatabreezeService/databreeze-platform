import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-00000000d001',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-00000000d002',
    workspaceId: '00000000-0000-4000-8000-00000000d003',
  },
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-00000000d004',
  idempotencyKey: 'data-quality-guard-validation',
});
if (!contextResult.accepted) throw new Error('fixture context rejected');

const requestTenantContext: RequestTenantContextPortV1 = {
  resolve: () => Promise.resolve(contextResult.value),
};

const validationRequest = {
  dataset: {
    datasetId: '00000000-0000-4000-8000-00000000d005',
    datasetVersionId: '00000000-0000-4000-8000-00000000d006',
    contentSha256: 'a'.repeat(64),
    rows: [
      { customerId: 'customer-private-1', total: -5 },
      { customerId: 'customer-private-1', total: 5 },
    ],
  },
  contract: {
    contractId: '00000000-0000-4000-8000-00000000d007',
    contractVersion: 1,
    contractSha256: 'b'.repeat(64),
    rules: [
      {
        ruleId: '00000000-0000-4000-8000-00000000d008',
        kind: 'unique',
        field: 'customerId',
        severity: 'ERROR',
        allowNull: false,
      },
      {
        ruleId: '00000000-0000-4000-8000-00000000d009',
        kind: 'range',
        field: 'total',
        severity: 'CRITICAL',
        min: 0,
        allowNull: false,
      },
    ],
  },
};

void test('[DQG-014, DQG-015, IAM-009] validation returns deterministic value-free findings and does not echo input rows', async () => {
  const { app } = await createApiApplication({ requestTenantContext });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/data-quality-guard/ephemeral-validation',
      payload: validationRequest,
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body) as {
      readonly accepted: boolean;
      readonly value: {
        readonly summary: { readonly state: string; readonly failedRules: number };
        readonly findings: readonly {
          readonly reasonCode: string;
          readonly valueFingerprint: string;
        }[];
      };
    };
    assert.equal(body.accepted, true);
    assert.equal(body.value.summary.state, 'FAIL');
    assert.equal(body.value.summary.failedRules, 2);
    assert.deepEqual(
      body.value.findings.map((finding) => finding.reasonCode),
      ['DQG_UNIQUE', 'DQG_RANGE'],
    );
    assert.ok(body.value.findings.every((finding) => finding.valueFingerprint.startsWith('dqg-')));
    assert.doesNotMatch(
      response.body,
      /customer-private-1|-5|tenantScope|organizationId|workspaceId/u,
    );
  } finally {
    await app.close();
  }
});

void test('[DQG-006, DQG-015] validation rejects nested source-bearing objects without reflecting their values', async () => {
  const { app } = await createApiApplication({ requestTenantContext });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/data-quality-guard/ephemeral-validation',
      payload: {
        ...validationRequest,
        dataset: {
          ...validationRequest.dataset,
          rows: [{ customerId: { raw: 'do-not-echo' }, total: 1 }],
        },
      },
    });

    assert.equal(response.statusCode, 400);
    assert.doesNotMatch(response.body, /do-not-echo/u);
  } finally {
    await app.close();
  }
});

void test('[DQG-001, IAM-009] ephemeral validation requires an exact workspace tenant context', async () => {
  const organizationContextResult = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-00000000d010',
    tenantScope: {
      scopeType: 'organization',
      organizationId: '00000000-0000-4000-8000-00000000d011',
    },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-00000000d012',
    idempotencyKey: 'data-quality-guard-organization-context',
  });
  assert.equal(organizationContextResult.accepted, true);
  if (!organizationContextResult.accepted) return;
  const { app } = await createApiApplication({
    requestTenantContext: { resolve: () => Promise.resolve(organizationContextResult.value) },
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/data-quality-guard/ephemeral-validation',
      payload: validationRequest,
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

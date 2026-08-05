import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-00000000fa01',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-00000000fa02',
    workspaceId: '00000000-0000-4000-8000-00000000fa03',
  },
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-00000000fa04',
  idempotencyKey: 'folder-autopilot-preview',
});
if (!contextResult.accepted) throw new Error('fixture context rejected');

const requestTenantContext: RequestTenantContextPortV1 = {
  resolve: () => Promise.resolve(contextResult.value),
};

const previewRequest = {
  recipeId: '00000000-0000-4000-8000-00000000fa05',
  version: 1,
  name: 'Invoice intake',
  filter: { extensions: ['xlsx'], prefix: 'incoming' },
  steps: [
    {
      stepId: '00000000-0000-4000-8000-00000000fa06',
      action: 'COPY',
      destinationTemplate: 'review/{{name}}',
      approvalRequired: true,
    },
  ],
  inputDeviceGrantId: '00000000-0000-4000-8000-00000000fa07',
  outputDeviceGrantId: '00000000-0000-4000-8000-00000000fa08',
  capabilityDigest: 'a'.repeat(64),
  recipeHash: 'b'.repeat(64),
  files: [
    {
      fileId: 'invoice-1',
      relativePath: 'incoming/invoice.xlsx',
      sizeBytes: 42,
      contentSha256: 'c'.repeat(64),
    },
    {
      fileId: 'notes-1',
      relativePath: 'incoming/notes.txt',
      sizeBytes: 3,
      contentSha256: 'd'.repeat(64),
    },
  ],
};

void test('[FA-003, FA-008, FA-009, IAM-009] an authenticated request gets an ephemeral, relative-path-only preview', async () => {
  const { app } = await createApiApplication({ requestTenantContext });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/folder-autopilot/ephemeral-preview',
      payload: previewRequest,
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body) as {
      readonly accepted: boolean;
      readonly value: {
        readonly operations: readonly { readonly source: string; readonly destination: string }[];
        readonly requiresApproval: boolean;
        readonly skippedFileIds: readonly string[];
      };
    };
    assert.equal(body.accepted, true);
    assert.deepEqual(
      body.value.operations.map(({ source, destination }) => ({ source, destination })),
      [{ source: 'incoming/invoice.xlsx', destination: 'review/invoice.xlsx' }],
    );
    assert.equal(body.value.requiresApproval, true);
    assert.deepEqual(body.value.skippedFileIds, ['notes-1']);
    assert.doesNotMatch(response.body, /[A-Za-z]:\\/u);
    assert.doesNotMatch(response.body, /tenantScope|organizationId|workspaceId/u);
  } finally {
    await app.close();
  }
});

void test('[FA-003] ephemeral preview rejects client-provided tenant scope and local paths without reflecting them', async () => {
  const { app } = await createApiApplication({ requestTenantContext });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/folder-autopilot/ephemeral-preview',
      payload: {
        ...previewRequest,
        tenantScope: {
          scopeType: 'workspace',
          organizationId: '00000000-0000-4000-8000-00000000fa09',
          workspaceId: '00000000-0000-4000-8000-00000000fa10',
        },
        localPath: 'C:\\Users\\operator\\Payroll',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.doesNotMatch(response.body, /C:\\Users\\operator\\Payroll|fa09|fa10/u);
  } finally {
    await app.close();
  }
});

void test('[FA-003] ephemeral preview rejects a path-shaped opaque file identifier', async () => {
  const { app } = await createApiApplication({ requestTenantContext });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/folder-autopilot/ephemeral-preview',
      payload: {
        ...previewRequest,
        files: [{ ...previewRequest.files[0], fileId: 'C:\\Users\\operator\\Payroll' }],
      },
    });

    assert.equal(response.statusCode, 400);
    assert.doesNotMatch(response.body, /C:\\Users\\operator\\Payroll/u);
  } finally {
    await app.close();
  }
});

void test('[FA-002, IAM-009] ephemeral preview requires an exact workspace tenant context', async () => {
  const organizationContextResult = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-00000000fa11',
    tenantScope: {
      scopeType: 'organization',
      organizationId: '00000000-0000-4000-8000-00000000fa12',
    },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-00000000fa13',
    idempotencyKey: 'folder-autopilot-organization-context',
  });
  assert.equal(organizationContextResult.accepted, true);
  if (!organizationContextResult.accepted) return;
  const { app } = await createApiApplication({
    requestTenantContext: { resolve: () => Promise.resolve(organizationContextResult.value) },
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/folder-autopilot/ephemeral-preview',
      payload: previewRequest,
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

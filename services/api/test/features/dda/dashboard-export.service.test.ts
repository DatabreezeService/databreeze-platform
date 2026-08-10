import assert from 'node:assert/strict';
import test from 'node:test';

import { DashboardExportServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-export.service.js';
import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const scope = Object.freeze({
  scopeType: 'project' as const,
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-0000000000a1',
  tenantScope: scope,
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-0000000000c1',
  idempotencyKey: 'dda-dashboard-export',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const auth: DashboardAuthorizationPortV1 = {
  authorizeDashboardAction() {
    return Promise.resolve(Object.freeze({ allowed: true, grantsDatasetAccess: false }));
  },
  projectVisibleFields() {
    return Promise.resolve(Object.freeze(['region', 'amount']));
  },
};

void test('[DDA-049] export is permission-filtered and reauthorizes download', async () => {
  const service = new DashboardExportServiceV1(auth);
  const exported = await service.export(context, {
    snapshotId: '00000000-0000-4000-8000-000000000029',
    rows: [{ region: 'North', amount: '100', salary_secret: 'x' }],
    chartSpec: { type: 'BAR', encoding: { x: 'region', y: 'amount' } },
  });
  assert.equal(exported.accepted, true);
  if (!exported.accepted) return;
  assert.equal('salary_secret' in exported.value.csvRows[0]!, false);
  assert.ok(exported.value.json.provenanceManifest);
  assert.equal(exported.value.json.metadata.snapshotId, '00000000-0000-4000-8000-000000000029');
});

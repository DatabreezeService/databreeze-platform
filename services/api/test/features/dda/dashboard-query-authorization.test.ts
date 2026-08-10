import assert from 'node:assert/strict';
import test from 'node:test';

import { DashboardQueryServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-query.service.js';
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
  idempotencyKey: 'dda-dashboard-query',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

void test('[DDA-026] dashboard share/view does not grant Dataset, original, evidence, analysis, or folder permission', async () => {
  const auth: DashboardAuthorizationPortV1 = {
    async authorizeDashboardAction(input) {
      if (input.action === 'VIEW' || input.action === 'SHARE') {
        return Object.freeze({
          allowed: true,
          grantsDatasetAccess: false,
          grantsOriginalAccess: false,
          grantsEvidenceAccess: false,
          grantsAnalysisAccess: false,
          grantsFolderAccess: false,
          grantsRowFieldExpansion: false,
        });
      }
      return Object.freeze({ allowed: false, grantsDatasetAccess: false });
    },
    async projectVisibleFields() {
      return Object.freeze(['region']);
    },
  };
  const service = new DashboardQueryServiceV1(auth);
  const viewed = await service.view(context, {
    snapshotId: '00000000-0000-4000-8000-000000000029',
    rows: [
      { region: 'North', amount: '100', salary_secret: 'x' },
      { region: 'South', amount: '200', salary_secret: 'y' },
    ],
  });
  assert.equal(viewed.accepted, true);
  if (!viewed.accepted) return;
  assert.equal(viewed.value.permissionExpansion.grantsDatasetAccess, false);
  assert.equal(viewed.value.permissionExpansion.grantsOriginalAccess, false);
  assert.equal(viewed.value.permissionExpansion.grantsEvidenceAccess, false);
  assert.equal(viewed.value.permissionExpansion.grantsAnalysisAccess, false);
  assert.equal(viewed.value.permissionExpansion.grantsFolderAccess, false);
  for (const row of viewed.value.rows) {
    assert.equal('salary_secret' in row, false);
    assert.equal('amount' in row, false);
    assert.ok('region' in row);
  }
  assert.equal(viewed.value.deniedFieldsExposed, false);
});

void test('[DDA-026] read, filter, drill, download, event, and share resolution re-authorize current scope', async () => {
  let calls = 0;
  const auth: DashboardAuthorizationPortV1 = {
    async authorizeDashboardAction() {
      calls += 1;
      return Object.freeze({ allowed: true, grantsDatasetAccess: false });
    },
    async projectVisibleFields() {
      return Object.freeze(['region']);
    },
  };
  const service = new DashboardQueryServiceV1(auth);
  for (const action of ['VIEW', 'FILTER', 'DRILL', 'DOWNLOAD', 'SUBSCRIBE', 'RESOLVE_SHARE'] as const) {
    const result = await service.authorizeAction(context, {
      snapshotId: '00000000-0000-4000-8000-000000000029',
      action,
    });
    assert.equal(result.accepted, true);
  }
  assert.equal(calls, 6);
});

void test('[DDA-026] permission revocation denies subsequent reads without leaking hidden field names', async () => {
  const auth: DashboardAuthorizationPortV1 = {
    async authorizeDashboardAction() {
      return Object.freeze({ allowed: false, grantsDatasetAccess: false });
    },
    async projectVisibleFields() {
      return Object.freeze([]);
    },
  };
  const service = new DashboardQueryServiceV1(auth);
  const denied = await service.view(context, {
    snapshotId: '00000000-0000-4000-8000-000000000029',
    rows: [{ region: 'North', salary_secret: 'x' }],
  });
  assert.equal(denied.accepted, false);
  if (!denied.accepted) {
    assert.equal(denied.code, 'UNAUTHORIZED');
    assert.equal(JSON.stringify(denied).includes('salary_secret'), false);
  }
});

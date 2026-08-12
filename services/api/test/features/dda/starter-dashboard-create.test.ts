import assert from 'node:assert/strict';
import test from 'node:test';

import { StarterDashboardService } from '../../../src/features/dda/dashboard/application/starter-dashboard.service.js';
import { StarterDashboardTemplateRegistry } from '../../../src/features/dda/dashboard/application/starter-dashboard-template.registry.js';

const tenantScope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
} as never;

void test('[DDA-054] creates one private starter dashboard idempotently without publishing', async () => {
  const created: unknown[] = [];
  const queued: string[] = [];
  const service = new StarterDashboardService({
    registry: new StarterDashboardTemplateRegistry(),
    savePrivateDashboard: async (record) => {
      created.push(record);
      return record;
    },
    queueMaterialization: async (dashboardVersionId) => {
      queued.push(dashboardVersionId);
    },
    findExistingForDatasetVersion: async (datasetVersionId) => {
      const hit = created.find(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          'datasetVersionId' in item &&
          (item as { datasetVersionId: string }).datasetVersionId === datasetVersionId,
      );
      return hit as
        | {
            readonly dashboardVersionId: string;
            readonly datasetVersionId: string;
            readonly templateId: string;
            readonly visibility: 'PRIVATE';
            readonly published: false;
            readonly aiUsed: false;
          }
        | undefined;
    },
  });

  const first = await service.createStarterDashboard(
    { tenantScope, memberAuthorized: true },
    {
      datasetVersionId: '00000000-0000-4000-8000-000000000701',
      policyVersionId: '00000000-0000-4000-8000-000000000702',
      profile: 'INVENTORY',
      roles: Object.freeze({ measure: 'qty', category: 'sku', time: 'as_of' }),
      units: Object.freeze({ qty: 'COUNT' }),
      grains: Object.freeze(['DAY']),
      idempotencyKey: 'starter-1',
    },
  );
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.value.visibility, 'PRIVATE');
  assert.equal(first.value.published, false);
  assert.equal(first.value.aiUsed, false);
  assert.equal(queued.length, 1);

  const second = await service.createStarterDashboard(
    { tenantScope, memberAuthorized: true },
    {
      datasetVersionId: '00000000-0000-4000-8000-000000000701',
      policyVersionId: '00000000-0000-4000-8000-000000000702',
      profile: 'INVENTORY',
      roles: Object.freeze({ measure: 'qty', category: 'sku', time: 'as_of' }),
      units: Object.freeze({ qty: 'COUNT' }),
      grains: Object.freeze(['DAY']),
      idempotencyKey: 'starter-1',
    },
  );
  assert.equal(second.accepted, true);
  if (!second.accepted) return;
  assert.equal(second.value.dashboardVersionId, first.value.dashboardVersionId);
  assert.equal(created.length, 1);
  assert.equal(queued.length, 1);
});

void test('[DDA-054] dataset switch loads that dataset canvas only', async () => {
  const service = new StarterDashboardService({
    registry: new StarterDashboardTemplateRegistry(),
    savePrivateDashboard: async (record) => record,
    queueMaterialization: async () => undefined,
    findExistingForDatasetVersion: async (datasetVersionId) =>
      Object.freeze({
        dashboardVersionId: `dash-for-${datasetVersionId}`,
        datasetVersionId,
        templateId: 'starter.generic.table.v1',
        visibility: 'PRIVATE' as const,
        published: false as const,
        aiUsed: false as const,
      }),
  });

  const loaded = await service.loadDatasetCanvas(
    { tenantScope, memberAuthorized: true },
    '00000000-0000-4000-8000-000000000801',
  );
  assert.equal(loaded.accepted, true);
  if (!loaded.accepted) return;
  assert.equal(loaded.value.dashboardVersionId, 'dash-for-00000000-0000-4000-8000-000000000801');
});

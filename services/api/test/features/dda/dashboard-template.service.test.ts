import assert from 'node:assert/strict';
import test from 'node:test';

import { DashboardTemplateServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-template.service.js';

const scope = Object.freeze({
  scopeType: 'project' as const,
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});

void test('[DDA-048] templates contain presentation patterns only and strip foreign scope payloads', async () => {
  const service = new DashboardTemplateServiceV1();
  const template = service.createFromDraft({
    sourceTenantScope: scope,
    pages: [{ pageId: 'page-1', title: { vi: 'Trang', en: 'Page' } }],
    widgets: [{ widgetId: 'w1', type: 'KPI', title: { vi: 'KPI', en: 'KPI' } }],
    filters: [{ filterId: 'f1', field: 'region', operator: 'IN', scope: 'DASHBOARD' }],
    forbidden: {
      datasetVersionId: '00000000-0000-4000-8000-000000000018',
      secret: 'token',
      materializedValues: [1, 2, 3],
      permissions: ['dataset.read'],
    },
  });
  assert.equal(template.accepted, true);
  if (!template.accepted) return;
  assert.equal('datasetVersionId' in template.value, false);
  assert.equal('secret' in template.value, false);
  assert.equal('materializedValues' in template.value, false);
  assert.equal('permissions' in template.value, false);
  assert.equal(template.value.widgets[0]?.type, 'KPI');
});

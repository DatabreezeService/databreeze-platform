import assert from 'node:assert/strict';
import test from 'node:test';

import { PersonalViewService } from '../../../src/features/dda/dashboard/application/personal-view.service.js';

const tenantScope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
} as never;

void test('[DDA-033] personal filters do not mutate shared dashboard version', async () => {
  const service = new PersonalViewService();
  const created = await service.saveNamedView(
    { tenantScope, actorId: '00000000-0000-4000-8000-000000000501', memberAuthorized: true },
    {
      dashboardVersionId: '00000000-0000-4000-8000-000000000601',
      name: 'Cua hang HN',
      filters: Object.freeze([{ field: 'store', operator: 'EQ', value: 'HN' }]),
      expectedRevision: 1,
    },
  );
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(created.value.ownerActorId, '00000000-0000-4000-8000-000000000501');
  assert.equal(created.value.sharedWithWorkspace, false);
  assert.equal(created.value.dashboardVersionId, '00000000-0000-4000-8000-000000000601');
  assert.equal(created.value.filters[0]?.value, 'HN');

  const updated = await service.saveNamedView(
    { tenantScope, actorId: '00000000-0000-4000-8000-000000000501', memberAuthorized: true },
    {
      dashboardVersionId: '00000000-0000-4000-8000-000000000601',
      name: 'Cua hang HN',
      filters: Object.freeze([{ field: 'store', operator: 'EQ', value: 'HCM' }]),
      expectedRevision: 1,
      viewId: created.value.viewId,
    },
  );
  assert.equal(updated.accepted, true);
  if (!updated.accepted) return;
  assert.equal(updated.value.revision, 2);

  const conflict = await service.saveNamedView(
    { tenantScope, actorId: '00000000-0000-4000-8000-000000000501', memberAuthorized: true },
    {
      dashboardVersionId: '00000000-0000-4000-8000-000000000601',
      name: 'Cua hang HN',
      filters: Object.freeze([{ field: 'store', operator: 'EQ', value: 'DN' }]),
      expectedRevision: 1,
      viewId: created.value.viewId,
    },
  );
  assert.equal(conflict.accepted, false);
  if (conflict.accepted) return;
  assert.equal(conflict.code, 'REVISION_CONFLICT');
});

void test('[DDA-033] named view stays private unless explicitly shared', async () => {
  const service = new PersonalViewService();
  const created = await service.saveNamedView(
    { tenantScope, actorId: '00000000-0000-4000-8000-000000000501', memberAuthorized: true },
    {
      dashboardVersionId: '00000000-0000-4000-8000-000000000601',
      name: 'Private',
      filters: Object.freeze([]),
      expectedRevision: 1,
    },
  );
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const denied = await service.loadView(
    { tenantScope, actorId: '00000000-0000-4000-8000-000000000599', memberAuthorized: true },
    created.value.viewId,
  );
  assert.equal(denied.accepted, false);

  const shared = await service.shareWithWorkspace(
    { tenantScope, actorId: '00000000-0000-4000-8000-000000000501', memberAuthorized: true },
    created.value.viewId,
    created.value.revision,
  );
  assert.equal(shared.accepted, true);
  if (!shared.accepted) return;
  assert.equal(shared.value.sharedWithWorkspace, true);

  const allowed = await service.loadView(
    { tenantScope, actorId: '00000000-0000-4000-8000-000000000599', memberAuthorized: true },
    created.value.viewId,
  );
  assert.equal(allowed.accepted, true);
});

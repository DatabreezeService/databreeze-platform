import assert from 'node:assert/strict';
import test from 'node:test';

import { selectAuthoritativeMembership } from '../../../src/features/iam/application/membership-authority.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000201';
const workspaceId = '00000000-0000-4000-8000-000000000202';
const projectId = '00000000-0000-4000-8000-000000000203';
const principalId = '00000000-0000-4000-8000-000000000204';

function context() {
  const parsed = createIamTenantContextV1({
    tenantScope: { scopeType: 'project', organizationId, workspaceId, projectId },
    actorId: principalId,
    correlationId: '00000000-0000-4000-8000-000000000205',
    idempotencyKey: 'membership-authority-test',
    authorizationEpoch: 1,
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid membership authority context');
  return parsed.value;
}

void test('[IAM-003, IAM-014] shared membership authority picks the narrowest active scope', () => {
  const selected = selectAuthoritativeMembership(
    [
      {
        id: '00000000-0000-4000-8000-000000000212',
        principalId,
        scope: { scopeType: 'organization', organizationId },
        roleId: 'owner',
        status: 'ACTIVE',
        revision: 1,
      },
      {
        id: '00000000-0000-4000-8000-000000000211',
        principalId,
        scope: { scopeType: 'workspace', organizationId, workspaceId },
        roleId: 'viewer',
        status: 'ACTIVE',
        revision: 1,
      },
      {
        id: '00000000-0000-4000-8000-000000000213',
        principalId,
        scope: { scopeType: 'project', organizationId, workspaceId, projectId },
        roleId: 'operator',
        status: 'ACTIVE',
        revision: 1,
      },
    ],
    context(),
    principalId,
  );
  assert.equal(selected?.roleId, 'operator');
});

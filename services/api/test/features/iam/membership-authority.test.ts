import assert from 'node:assert/strict';
import test from 'node:test';

import { selectAuthoritativeMembership } from '../../../src/features/iam/application/membership-authority.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

const organizationId = '00000000-0000-4000-8000-000000000201';
const workspaceId = '00000000-0000-4000-8000-000000000202';
const projectId = '00000000-0000-4000-8000-000000000203';
const principalId = '00000000-0000-4000-8000-000000000204';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid membership authority identifier');
  return parsed.value;
}

function context() {
  const parsed = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'project',
      organizationId: stable(organizationId),
      workspaceId: stable(workspaceId),
      projectId: stable(projectId),
    },
    actorId: stable(principalId),
    correlationId: stable('00000000-0000-4000-8000-000000000205'),
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
        id: stable('00000000-0000-4000-8000-000000000212'),
        principalId: stable(principalId),
        scope: { scopeType: 'organization', organizationId: stable(organizationId) },
        roleId: 'owner',
        status: 'ACTIVE',
        revision: 1,
      },
      {
        id: stable('00000000-0000-4000-8000-000000000211'),
        principalId: stable(principalId),
        scope: {
          scopeType: 'workspace',
          organizationId: stable(organizationId),
          workspaceId: stable(workspaceId),
        },
        roleId: 'viewer',
        status: 'ACTIVE',
        revision: 1,
      },
      {
        id: stable('00000000-0000-4000-8000-000000000213'),
        principalId: stable(principalId),
        scope: {
          scopeType: 'project',
          organizationId: stable(organizationId),
          workspaceId: stable(workspaceId),
          projectId: stable(projectId),
        },
        roleId: 'operator',
        status: 'ACTIVE',
        revision: 1,
      },
    ],
    context(),
    stable(principalId),
  );
  assert.equal(selected?.roleId, 'operator');
});

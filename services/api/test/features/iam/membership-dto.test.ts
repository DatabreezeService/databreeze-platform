import assert from 'node:assert/strict';
import test from 'node:test';

import { validate } from 'class-validator';

import { MembershipScopeDto } from '../../../src/features/iam/api/membership.dto.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000701',
  workspace: '00000000-0000-4000-8000-000000000702',
  project: '00000000-0000-4000-8000-000000000703',
};

async function errors(input: Partial<MembershipScopeDto>) {
  const value = Object.assign(new MembershipScopeDto(), input);
  return validate(value);
}

void test('[IAM-004] membership scope DTO accepts matching hierarchy identifiers', async () => {
  assert.equal(
    (
      await errors({
        scopeType: 'organization',
        organizationId: ids.organization,
      })
    ).length,
    0,
  );
  assert.equal(
    (
      await errors({
        scopeType: 'workspace',
        organizationId: ids.organization,
        workspaceId: ids.workspace,
      })
    ).length,
    0,
  );
  assert.equal(
    (
      await errors({
        scopeType: 'project',
        organizationId: ids.organization,
        workspaceId: ids.workspace,
        projectId: ids.project,
      })
    ).length,
    0,
  );
});

void test('[IAM-004] membership scope DTO rejects inconsistent hierarchy identifiers', async () => {
  assert.ok(
    (
      await errors({
        scopeType: 'organization',
        organizationId: ids.organization,
        projectId: ids.project,
      })
    ).some((error) => error.property === 'scopeType'),
  );
  assert.ok(
    (
      await errors({
        scopeType: 'workspace',
        organizationId: ids.organization,
      })
    ).some((error) => error.property === 'scopeType'),
  );
  assert.ok(
    (
      await errors({
        scopeType: 'project',
        organizationId: ids.organization,
        workspaceId: ids.workspace,
      })
    ).some((error) => error.property === 'scopeType'),
  );
});

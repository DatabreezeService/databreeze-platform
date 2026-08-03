import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  createAuditPageCursorV1,
  parseAuditPageCursorV1,
} from '../../../src/features/aud/application/audit-page-cursor.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const parsedWorkspaceScope = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId,
  workspaceId,
});
assert.equal(parsedWorkspaceScope.accepted, true);
if (!parsedWorkspaceScope.accepted) throw new Error('invalid workspace scope fixture');
const workspaceScope = parsedWorkspaceScope.value;

void test('[AUD-001, IAM-009] audit page cursors bind resource, tenant scope, and offset', () => {
  const cursor = createAuditPageCursorV1('events', workspaceScope, 100);
  assert.deepEqual(parseAuditPageCursorV1(cursor, 'events', workspaceScope), {
    accepted: true,
    offset: 100,
  });
  assert.deepEqual(parseAuditPageCursorV1(cursor, 'seals', workspaceScope), {
    accepted: false,
    code: 'INVALID_CURSOR',
  });
  const siblingScope = parseTenantScopeV1({
    scopeType: 'workspace',
    organizationId,
    workspaceId: '00000000-0000-4000-8000-000000000003',
  });
  assert.equal(siblingScope.accepted, true);
  if (!siblingScope.accepted) return;
  assert.deepEqual(parseAuditPageCursorV1(cursor, 'events', siblingScope.value), {
    accepted: false,
    code: 'INVALID_CURSOR',
  });
});

void test('[AUD-001] audit page cursors fail closed for malformed or oversized values', () => {
  for (const cursor of ['', 'not/base64', 'e30', 'a'.repeat(513)]) {
    assert.deepEqual(parseAuditPageCursorV1(cursor, 'events', workspaceScope), {
      accepted: false,
      code: 'INVALID_CURSOR',
    });
  }
});

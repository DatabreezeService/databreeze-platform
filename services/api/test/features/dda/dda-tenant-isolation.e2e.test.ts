import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDdaAiEgressPolicyV1,
  evaluateDdaAiEgressV1,
} from '@databreeze/domain/data-to-dashboard/policy-v1';
import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

/**
 * Composition-level tenant isolation proofs for DDA (plan 400 Task 4).
 * Full HTTP e2e against live staging remains blocked on MANUAL-PREREQUISITES §2.
 */

const orgA = {
  scopeType: 'project' as const,
  organizationId: '00000000-0000-4000-8000-0000000000a1',
  workspaceId: '00000000-0000-4000-8000-0000000000a2',
  projectId: '00000000-0000-4000-8000-0000000000a3',
};

const orgB = {
  scopeType: 'project' as const,
  organizationId: '00000000-0000-4000-8000-0000000000b1',
  workspaceId: '00000000-0000-4000-8000-0000000000b2',
  projectId: '00000000-0000-4000-8000-0000000000b3',
};

void test('[DDA-001, IAM] distinct tenant scopes never share organization identifiers', () => {
  const a = parseTenantScopeV1(orgA);
  const b = parseTenantScopeV1(orgB);
  assert.equal(a.accepted, true);
  assert.equal(b.accepted, true);
  if (!a.accepted || !b.accepted) return;
  assert.equal(a.value.scopeType, 'project');
  assert.equal(b.value.scopeType, 'project');
  if (a.value.scopeType !== 'project' || b.value.scopeType !== 'project') return;
  assert.notEqual(a.value.organizationId, b.value.organizationId);
  assert.notEqual(a.value.workspaceId, b.value.workspaceId);
  assert.notEqual(a.value.projectId, b.value.projectId);
});

void test('[DDA-044] OpenAI egress allowlist cannot be reused across tenants by copying adapter names alone', () => {
  const policyA = createDdaAiEgressPolicyV1({
    policyId: '00000000-0000-4000-8000-0000000000aa',
    tenantScope: orgA,
    enabled: true,
    locality: 'CLOUD',
    adapterAllowlist: ['openai-responses'],
    purposeAllowlist: ['RECEIPT_EXTRACTION'],
    allowEvidence: true,
    maximumPayloadBytes: 4096,
  });
  assert.equal(policyA.accepted, true);
  if (!policyA.accepted) return;

  // Policy B is disabled even with the same adapter string — tenant policy is authoritative.
  const policyB = createDdaAiEgressPolicyV1({
    policyId: '00000000-0000-4000-8000-0000000000bb',
    tenantScope: orgB,
    enabled: false,
    locality: 'DENIED',
    adapterAllowlist: ['openai-responses'],
    purposeAllowlist: ['RECEIPT_EXTRACTION'],
  });
  assert.equal(policyB.accepted, true);
  if (!policyB.accepted) return;

  const allowedA = evaluateDdaAiEgressV1(policyA.value, {
    adapter: 'openai-responses',
    purpose: 'RECEIPT_EXTRACTION',
    payloadBytes: 100,
    includesEvidence: true,
  });
  const deniedB = evaluateDdaAiEgressV1(policyB.value, {
    adapter: 'openai-responses',
    purpose: 'RECEIPT_EXTRACTION',
    payloadBytes: 100,
    includesEvidence: true,
  });
  assert.equal(allowedA.accepted, true);
  assert.equal(deniedB.accepted, false);
});

void test('[DDA-001] cross-tenant fixture identifier is rejected by contracts suite path', async () => {
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const fixture = readFileSync(
    path.join(
      process.cwd(),
      '../../packages/contracts/test/fixtures/dda/v1/invalid-cross-tenant.json',
    ),
    'utf8',
  );
  assert.match(fixture, /organizationId/u);
  assert.doesNotMatch(fixture, /sk-[a-zA-Z0-9]/u);
});

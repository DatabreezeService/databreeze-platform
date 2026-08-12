import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGENT_TOOL_NAMES_V1,
  AgentToolRegistryV1,
} from '../../../src/features/dda/agent/application/agent-tool-registry.js';

void test('[DDA-060] registry exposes exactly the closed tool name set', () => {
  const registry = new AgentToolRegistryV1();
  const names = registry.listNames();
  assert.deepEqual([...names].sort(), [...AGENT_TOOL_NAMES_V1].sort());
  assert.equal(names.length, 10);
});

void test('[DDA-060] unknown tool is rejected', () => {
  const registry = new AgentToolRegistryV1();
  const resolved = registry.resolve('dataset.drop');
  assert.equal(resolved.accepted, false);
  if (resolved.accepted) return;
  assert.equal(resolved.code, 'UNKNOWN_TOOL');
});

void test('[DDA-060] each tool declares level, IAM action, bounds, and audit policy', () => {
  const registry = new AgentToolRegistryV1();
  for (const name of AGENT_TOOL_NAMES_V1) {
    const resolved = registry.resolve(name);
    assert.equal(resolved.accepted, true);
    if (!resolved.accepted) return;
    assert.ok(resolved.value.requiredAgentLevel.length > 0);
    assert.ok(resolved.value.requiredIamAction.includes('.'));
    assert.ok(resolved.value.maximumRows > 0);
    assert.ok(resolved.value.maximumBytes > 0);
    assert.ok(resolved.value.timeoutMs > 0);
    assert.ok(['NONE', 'LOW', 'MEDIUM', 'HIGH'].includes(resolved.value.costClass));
    assert.ok(['READ', 'PROPOSAL', 'MUTATION'].includes(resolved.value.sideEffectClass));
    assert.equal(resolved.value.auditPolicy, 'REQUIRED');
  }
});

void test('[DDA-060] applyConfirmed requires APPLY_CONFIRMED_CHANGES and mutation class', () => {
  const registry = new AgentToolRegistryV1();
  const resolved = registry.resolve('dashboard.applyConfirmed');
  assert.equal(resolved.accepted, true);
  if (!resolved.accepted) return;
  assert.equal(resolved.value.requiredAgentLevel, 'APPLY_CONFIRMED_CHANGES');
  assert.equal(resolved.value.sideEffectClass, 'MUTATION');
  assert.equal(resolved.value.requiresUserConfirmation, true);
});

void test('[DDA-060] analyze-level tools do not require confirmation', () => {
  const registry = new AgentToolRegistryV1();
  for (const name of ['dataset.describe', 'dataset.sample', 'analysis.execute'] as const) {
    const resolved = registry.resolve(name);
    assert.equal(resolved.accepted, true);
    if (!resolved.accepted) return;
    assert.equal(resolved.value.requiredAgentLevel, 'ANALYZE');
    assert.equal(resolved.value.requiresUserConfirmation, false);
  }
});

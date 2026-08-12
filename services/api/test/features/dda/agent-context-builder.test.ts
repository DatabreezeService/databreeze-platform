import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentContextBuilderService } from '../../../src/features/dda/agent/application/agent-context-builder.service.js';

const tenantScope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
} as never;

void test('[DDA-060] context package respects hard bounds', () => {
  const builder = new AgentContextBuilderService();
  const datasetBindings = Array.from({ length: 12 }, (_, index) => ({
    datasetId: `00000000-0000-4000-8000-0000000007${String(index).padStart(2, '0')}`,
    datasetVersionId: `00000000-0000-4000-8000-0000000008${String(index).padStart(2, '0')}`,
    label: `Dataset ${index}`,
    schemaFingerprint: `fp-${index}`,
  }));
  const recentMessages = Array.from({ length: 20 }, (_, index) => ({
    messageId: `00000000-0000-4000-8000-0000000009${String(index).padStart(2, '0')}`,
    role: index % 2 === 0 ? ('USER' as const) : ('AGENT' as const),
    text: `message-${index}`,
  }));
  const evidenceRefs = Array.from({ length: 40 }, (_, index) => ({
    evidenceId: `00000000-0000-4000-8000-000000000a${String(index).padStart(2, '0')}`,
    kind: 'RESULT_CELL' as const,
  }));

  const built = builder.build({
    tenantScope,
    locale: 'vi-VN',
    agentLevel: 'ANALYZE',
    workspacePolicyProjection: { accessPreset: 'VIEWER', deniedDatasetIds: [] },
    datasetBindings,
    recentMessages,
    summaryText: 'x'.repeat(12_000),
    evidenceRefs,
    dashboardContext: { dashboardId: '00000000-0000-4000-8000-000000000b01' },
    filterContext: 'store=HN',
  });

  assert.equal(built.accepted, true);
  if (!built.accepted) return;
  assert.equal(built.value.datasetBindings.length, 8);
  assert.equal(built.value.recentMessages.length, 12);
  assert.equal(built.value.summaryText.length, 8_000);
  assert.equal(built.value.evidenceRefs.length, 24);
  assert.equal(built.value.estimatedProviderTokenCeiling, 24_000);
  assert.equal(built.value.locale, 'vi-VN');
  assert.ok(built.value.systemPolicy.includes('untrusted'));
});

void test('[DDA-060] stale context package is rejected', () => {
  const builder = new AgentContextBuilderService();
  const built = builder.build({
    tenantScope,
    locale: 'en',
    agentLevel: 'ANALYZE',
    workspacePolicyProjection: { accessPreset: 'EDITOR', deniedDatasetIds: [] },
    datasetBindings: [
      {
        datasetId: '00000000-0000-4000-8000-000000000701',
        datasetVersionId: '00000000-0000-4000-8000-000000000702',
        label: 'Sales',
        schemaFingerprint: 'fp-1',
      },
    ],
    recentMessages: [],
    summaryText: '',
    evidenceRefs: [],
    contextRevision: 3,
    expectedContextRevision: 2,
  });
  assert.equal(built.accepted, false);
  if (built.accepted) return;
  assert.equal(built.code, 'STALE_CONTEXT');
});

void test('[DDA-060] restricted datasets are omitted from bindings', () => {
  const builder = new AgentContextBuilderService();
  const built = builder.build({
    tenantScope,
    locale: 'vi-VN',
    agentLevel: 'ANALYZE',
    workspacePolicyProjection: {
      accessPreset: 'VIEWER',
      deniedDatasetIds: ['00000000-0000-4000-8000-000000000701'],
    },
    datasetBindings: [
      {
        datasetId: '00000000-0000-4000-8000-000000000701',
        datasetVersionId: '00000000-0000-4000-8000-000000000702',
        label: 'Restricted',
        schemaFingerprint: 'fp-r',
      },
      {
        datasetId: '00000000-0000-4000-8000-000000000703',
        datasetVersionId: '00000000-0000-4000-8000-000000000704',
        label: 'Allowed',
        schemaFingerprint: 'fp-a',
      },
    ],
    recentMessages: [],
    summaryText: '',
    evidenceRefs: [],
  });
  assert.equal(built.accepted, true);
  if (!built.accepted) return;
  assert.equal(built.value.datasetBindings.length, 1);
  assert.equal(built.value.datasetBindings[0]?.datasetId, '00000000-0000-4000-8000-000000000703');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { createDdaAiEgressPolicyV1 } from '@databreeze/domain/data-to-dashboard/policy-v1';
import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import { AnalysisNarrativeServiceV1 } from '../../../src/features/dda/analyst/application/analysis-narrative.service.js';
import type { NarrativeAdapterPortV1 } from '../../../src/features/dda/analyst/application/narrative-adapter.port.js';
import { OpenAiNarrativeAdapter } from '../../../src/features/dda/analyst/adapter/openai-narrative.adapter.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
if (!scopeResult.accepted) throw new Error('scope fixture invalid');
const scope: TenantScopeV1 = scopeResult.value;

const narrativeCasesPath = resolve(
  process.cwd(),
  '../../tools/fixture-validation/fixtures/dda/openai-assistance/narrative-cases.json',
);

function enabledPolicy() {
  const created = createDdaAiEgressPolicyV1({
    policyId: '00000000-0000-4000-8000-0000000000ab',
    tenantScope: scope,
    enabled: true,
    locality: 'CLOUD',
    purposeAllowlist: ['NARRATIVE'],
    adapterAllowlist: ['openai-responses'],
    allowResultRows: true,
    allowMetadata: true,
    maximumPayloadBytes: 65_536,
    retentionDays: 0,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('policy');
  return created.value;
}

void test('[DDA-018, DDA-019] narrative rejects claims without exact result-cell IDs', async () => {
  const adapter: NarrativeAdapterPortV1 = {
    isAvailable() {
      return Promise.resolve(true);
    },
    proposeNarrative() {
      return Promise.resolve(
        Object.freeze({
          status: 'PROPOSED' as const,
          locale: 'vi' as const,
          claims: Object.freeze([
            Object.freeze({
              text: 'Doanh so tang',
              resultCellIds: Object.freeze(['missing-cell']),
            }),
          ]),
        }),
      );
    },
  };
  const service = new AnalysisNarrativeServiceV1(adapter, {
    policyStore: { getPolicy: () => enabledPolicy() },
    killSwitchEnv: () => 'true',
  });
  const result = await service.propose(scope, {
    locale: 'vi',
    resultPackage: {
      resultManifestId: '00000000-0000-4000-8000-000000000301',
      cells: [{ cellId: 'cell-1', label: 'Doanh so', value: '100' }],
      provenanceIds: ['prov-1'],
    },
  });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'INVALID_CLAIM');
});

void test('[DDA-018, DDA-044] narrative outage leaves saved snapshot viewing available', async () => {
  const service = new AnalysisNarrativeServiceV1(
    {
      isAvailable() {
        return Promise.resolve(false);
      },
      proposeNarrative() {
        return Promise.resolve(
          Object.freeze({
            status: 'FAILED' as const,
            locale: 'vi' as const,
            claims: Object.freeze([]),
          }),
        );
      },
    },
    {
      policyStore: { getPolicy: () => enabledPolicy() },
      killSwitchEnv: () => 'true',
    },
  );
  const result = await service.propose(scope, {
    locale: 'vi',
    resultPackage: {
      resultManifestId: '00000000-0000-4000-8000-000000000301',
      cells: [{ cellId: 'cell-1', label: 'KPI', value: '1' }],
      provenanceIds: [],
    },
  });
  assert.equal(result.accepted, false);
  assert.ok(service.fallbackCapabilities().includes('SAVED_SNAPSHOT_VIEW'));
});

void test('[DDA-044] OpenAI narrative adapter stays offline without credentials', async () => {
  const adapter = new OpenAiNarrativeAdapter({
    enabled: false,
    apiKeyPresent: false,
    apiKey: '',
    modelSnapshot: 'gpt-4o-mini-2024-07-18',
    store: false,
    toolsEnabled: false,
    baseUrl: 'https://api.openai.com/v1',
    timeoutMs: 1000,
  });
  assert.equal(await adapter.isAvailable(), false);
});

void test('[DDA-018] offline narrative cases fixture is present', () => {
  const cases = JSON.parse(readFileSync(narrativeCasesPath, 'utf8')) as {
    readonly cases: readonly unknown[];
  };
  assert.ok(cases.cases.length >= 1);
});

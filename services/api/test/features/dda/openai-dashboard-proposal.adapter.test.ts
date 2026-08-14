import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { createDdaAiEgressPolicyV1 } from '@databreeze/domain/data-to-dashboard/policy-v1';
import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import { DashboardProposalServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-proposal.service.js';
import type { DashboardProposalPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-proposal.port.js';
import {
  loadOpenAiDashboardProposalConfig,
  OpenAiDashboardProposalAdapter,
} from '../../../src/features/dda/dashboard/adapter/openai-dashboard-proposal.adapter.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
if (!scopeResult.accepted) throw new Error('scope fixture invalid');
const scope: TenantScopeV1 = scopeResult.value;

const dashboardCasesPath = resolve(
  process.cwd(),
  '../../tools/fixture-validation/fixtures/dda/openai-assistance/dashboard-cases.json',
);

function enabledPolicy() {
  const created = createDdaAiEgressPolicyV1({
    policyId: '00000000-0000-4000-8000-0000000000ab',
    tenantScope: scope,
    enabled: true,
    locality: 'CLOUD',
    purposeAllowlist: ['PLAN_PROPOSAL'],
    adapterAllowlist: ['openai-responses'],
    allowMetadata: true,
    maximumPayloadBytes: 65_536,
    retentionDays: 0,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('policy');
  return created.value;
}

function baseRequest() {
  return {
    tenantScope: scope,
    analysisPlanId: '00000000-0000-4000-8000-000000000401',
    authorizedFields: ['region', 'amount'],
    authorizedMetrics: ['amount'],
    widgetAllowlist: ['KPI', 'TABLE', 'BAR'] as const,
    locale: 'vi' as const,
    resultShapes: ['TABLE'],
    accessibilityRules: ['label-required'],
    responsiveConstraints: ['stack-mobile'],
    costBounds: { maxWidgets: 8, maxPages: 2 },
  };
}

void test('[DDA-020, DDA-022] dashboard proposal rejects unknown widgets and scripts', async () => {
  const adapter: DashboardProposalPortV1 = {
    isAvailable() {
      return Promise.resolve(true);
    },
    proposeDashboard() {
      return Promise.resolve(
        Object.freeze({
          status: 'PROPOSED' as const,
          pages: Object.freeze([
            Object.freeze({
              pageId: 'page-1',
              title: Object.freeze({ vi: 'Tong quan', en: 'Overview' }),
            }),
          ]),
          widgets: Object.freeze([
            Object.freeze({
              widgetId: 'w1',
              type: 'KPI' as const,
              pageId: 'page-1',
              title: Object.freeze({ vi: '<script>x</script>', en: 'https://evil.example' }),
              bindings: Object.freeze(['amount']),
            }),
          ]),
          filters: Object.freeze([]),
        }),
      );
    },
  };
  const service = new DashboardProposalServiceV1(adapter, {
    policyStore: { getPolicy: () => enabledPolicy() },
    killSwitchEnv: () => 'true',
  });
  const result = await service.propose(baseRequest());
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'HOSTILE_CONTENT_REJECTED');
});

void test('[DDA-024, DDA-044] proposal is preview-only and never publishes', async () => {
  const adapter: DashboardProposalPortV1 = {
    isAvailable() {
      return Promise.resolve(true);
    },
    proposeDashboard() {
      return Promise.resolve(
        Object.freeze({
          status: 'PROPOSED' as const,
          pages: Object.freeze([
            Object.freeze({
              pageId: 'page-1',
              title: Object.freeze({ vi: 'Tong quan', en: 'Overview' }),
            }),
          ]),
          widgets: Object.freeze([
            Object.freeze({
              widgetId: 'w1',
              type: 'KPI' as const,
              pageId: 'page-1',
              title: Object.freeze({ vi: 'Doanh so', en: 'Revenue' }),
              bindings: Object.freeze(['amount']),
            }),
          ]),
          filters: Object.freeze([]),
          rationale: 'KPI for revenue',
          assumptions: Object.freeze(['authorized metrics only']),
        }),
      );
    },
  };
  const service = new DashboardProposalServiceV1(adapter, {
    policyStore: { getPolicy: () => enabledPolicy() },
    killSwitchEnv: () => 'true',
  });
  const result = await service.propose(baseRequest());
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.previewOnly, true);
  assert.equal(result.value.publishes, false);
  assert.ok(service.fallbackCapabilities().includes('SAVED_SNAPSHOT_VIEW'));
});

void test('[DDA-044] OpenAI dashboard adapter disabled without credentials', async () => {
  const adapter = new OpenAiDashboardProposalAdapter({
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

void test('[DDA-043][DDA-044] OpenAI dashboard proposals require the validated server owner flag and model', () => {
  const enabled = loadOpenAiDashboardProposalConfig({
    OPENAI_API_KEY: 'sk-test-not-a-real-key',
    DATABREEZE_OPENAI_DASHBOARD_ENABLED: 'true',
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.configurationValid, true);

  const absentOwnerFlag = loadOpenAiDashboardProposalConfig({
    OPENAI_API_KEY: 'sk-test-not-a-real-key',
  });
  assert.equal(absentOwnerFlag.enabled, false);

  const invalidModel = loadOpenAiDashboardProposalConfig({
    OPENAI_API_KEY: 'sk-test-not-a-real-key',
    DATABREEZE_OPENAI_DASHBOARD_ENABLED: 'true',
    DATABREEZE_OPENAI_DASHBOARD_MODEL: 'https://untrusted.example/model',
  });
  assert.equal(invalidModel.configurationValid, false);
  assert.equal(invalidModel.enabled, false);
});

void test('[DDA-020] offline dashboard cases fixture is present', () => {
  const cases = JSON.parse(readFileSync(dashboardCasesPath, 'utf8')) as {
    readonly cases: readonly unknown[];
  };
  assert.ok(cases.cases.length >= 1);
});

/* eslint-disable @typescript-eslint/require-await -- transport doubles mirror async provider ports. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  loadOpenAiAnalysisConfig,
  OpenAiAnalysisAdapter,
} from '../../../src/features/dda/analyst/adapter/openai-analysis.adapter.js';
import { AnalysisProposalServiceV1 } from '../../../src/features/dda/analyst/application/analysis-proposal.service.js';
import type { AnalysisAdapterPortV1 } from '../../../src/features/dda/analyst/application/analysis-adapter.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { deterministicCapabilitiesWhenAiUnavailableV1 } from '@databreeze/domain/data-to-dashboard/policy-v1';

const fixturePath = resolve(
  process.cwd(),
  '../../tools/fixture-validation/fixtures/dda/openai-assistance/analysis-cases.json',
);

const scope = Object.freeze({
  scopeType: 'project' as const,
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-0000000000a1',
  tenantScope: scope,
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-0000000000c1',
  idempotencyKey: 'dda-openai-analysis',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const catalog = Object.freeze({
  datasetVersionId: '00000000-0000-4000-8000-000000000018',
  semanticVersionId: '00000000-0000-4000-8000-000000000019',
  metricVersionId: '00000000-0000-4000-8000-00000000001a',
  permissionProjectionVersionId: '00000000-0000-4000-8000-000000000021',
  authorizedFields: Object.freeze(['region', 'amount', 'year'] as const),
  authorizedJoins: Object.freeze([] as const),
  units: Object.freeze({ amount: 'VND' }),
  grains: Object.freeze(['MONTH'] as const),
});

void test('[DDA-015, DDA-043] OpenAI analysis adapter sends bounded catalog and rejects SQL/code', async () => {
  let captured: unknown;
  const adapter = new OpenAiAnalysisAdapter(
    {
      enabled: true,
      apiKeyPresent: true,
      apiKey: 'sk-test-not-a-real-key-cccccccccccccccc',
      modelSnapshot: 'gpt-4o-mini-2024-07-18',
      store: false,
      toolsEnabled: false,
      baseUrl: 'https://api.openai.com/v1',
      timeoutMs: 1000,
    },
    {
      transport: {
        async create(input) {
          captured = input;
          return {
            id: 'resp_analysis',
            model: 'gpt-4o-mini-2024-07-18',
            status: 'completed',
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      dimensions: ['region'],
                      filters: [{ field: 'year', operator: 'EQ', value: '2026' }],
                      timeGrain: 'MONTH',
                      joins: [],
                      output: { form: 'TABLE', maxRows: 100 },
                      assumptions: ['authorized sales only'],
                      ambiguityAlternatives: [],
                      rationale: 'Bounded proposal',
                    }),
                  },
                ],
              },
            ],
            usage: { input_tokens: 10, output_tokens: 20 },
          };
        },
      },
    },
  );

  const proposal = await adapter.proposeTypedPlan({
    question: 'Doanh so theo vung?',
    tenantScope: scope,
    catalog: {
      datasetVersionId: catalog.datasetVersionId,
      semanticVersionId: catalog.semanticVersionId,
      metricVersionId: catalog.metricVersionId,
      permissionProjectionVersionId: catalog.permissionProjectionVersionId,
      authorizedFields: catalog.authorizedFields,
      authorizedJoins: catalog.authorizedJoins,
      allowedMetrics: ['amount'],
      allowedDimensions: ['region'],
      units: catalog.units,
      grains: catalog.grains,
      timeBounds: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
      locale: 'vi',
      outputBounds: { form: 'TABLE', maxRows: 100 },
      estimatedCostLimits: { cpuMs: 1000, memoryMb: 128 },
    },
  });
  assert.equal(proposal.status, 'PROPOSED');
  assert.ok(captured);
  const body = captured as {
    store: boolean;
    tools: unknown[];
    text: { format: { strict: boolean } };
    input: unknown[];
  };
  assert.equal(body.store, false);
  assert.deepEqual(body.tools, []);
  assert.equal(body.text.format.strict, true);
  assert.match(JSON.stringify(body.input), /authorizedFields/u);
  assert.doesNotMatch(JSON.stringify(body.input), /rawRows/u);
});

void test('[DDA-015, DDA-044] disabled OpenAI still permits manual typed plans', async () => {
  const adapter: AnalysisAdapterPortV1 = {
    isAvailable() {
      return Promise.resolve(false);
    },
    proposeTypedPlan() {
      return Promise.resolve(
        Object.freeze({ status: 'FAILED' as const, code: 'ADAPTER_UNAVAILABLE' }),
      );
    },
  };
  const service = new AnalysisProposalServiceV1(adapter, catalog);
  const result = await service.propose(context, {
    question: 'Doanh so theo vung thang nay?',
    manualTypedPlan: true,
    datasetVersionId: catalog.datasetVersionId,
    semanticVersionId: catalog.semanticVersionId,
    metricVersionId: catalog.metricVersionId,
    dimensions: ['region'],
    filters: [{ field: 'year', operator: 'EQ', value: '2026' }],
    timeRange: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
    timeGrain: 'MONTH',
    joins: [],
    units: { amount: 'VND' },
    parameters: {},
    output: { form: 'TABLE', maxRows: 100 },
    assumptions: ['manual'],
    estimate: { cpuMs: 100, memoryMb: 64 },
    permissionProjectionVersionId: catalog.permissionProjectionVersionId,
  });
  assert.equal(result.accepted, true);
  if (result.accepted) assert.equal(result.value.adapterUsed, false);
  assert.ok(deterministicCapabilitiesWhenAiUnavailableV1().includes('MANUAL_TYPED_ANALYSIS'));
});

void test('[DDA-043] analysis adapter config defaults disabled without key', () => {
  const config = loadOpenAiAnalysisConfig({
    OPENAI_API_KEY: undefined,
    DATABREEZE_OPENAI_ANALYSIS_ENABLED: 'true',
  });
  assert.equal(config.enabled, false);
  assert.equal(config.store, false);
});

void test('[DDA-015] offline analysis cases fixture is present', () => {
  const cases = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    readonly cases: readonly unknown[];
  };
  assert.ok(cases.cases.length >= 2);
});

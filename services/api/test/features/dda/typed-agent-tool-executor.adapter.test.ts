/* eslint-disable @typescript-eslint/require-await */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { DdaAnalysisPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';
import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';

import type {
  AgentAuthorityPortV1,
  AgentToolExecutionResultV1,
  AgentToolExecutorInputV1,
} from '../../../src/features/dda/agent/application/agent-runtime.port.js';
import type { AgentConsequentialCommandPortV1 } from '../../../src/features/dda/agent/application/agent-consequential-command.port.js';
import {
  AGENT_TOOL_NAMES_V1,
  AgentToolRegistryV1,
} from '../../../src/features/dda/agent/application/agent-tool-registry.js';
import type {
  AgentAnalysisPlanInputPortV1,
  AgentAnalysisPlanResolverPortV1,
  AgentDatasetReaderPortV1,
  AgentDashboardPreviewPortV1,
  AgentDashboardValuePortV1,
  AgentDependencyResultV1,
  AgentEvidenceResolverPortV1,
  AgentEtlCorrectionPortV1,
  AgentSourceOpenPortV1,
  TypedAgentToolExecutorDependenciesV1,
} from '../../../src/features/dda/agent/application/typed-agent-tool-executor-dependencies.port.js';
import { TypedAgentToolExecutorAdapter } from '../../../src/features/dda/agent/adapter/typed-agent-tool-executor.adapter.js';
import type { IamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000001',
  workspace: '00000000-0000-4000-8000-000000000002',
  actor: '00000000-0000-4000-8000-000000000003',
  correlation: '00000000-0000-4000-8000-000000000004',
  dataset: '00000000-0000-4000-8000-000000000005',
  datasetVersion: '00000000-0000-4000-8000-000000000006',
  plan: '00000000-0000-4000-8000-000000000007',
  planVersion: '00000000-0000-4000-8000-000000000008',
  dashboard: '00000000-0000-4000-8000-000000000009',
  page: '00000000-0000-4000-8000-000000000010',
  widget: '00000000-0000-4000-8000-000000000011',
  source: '00000000-0000-4000-8000-000000000012',
  evidence: '00000000-0000-4000-8000-000000000013',
  issue: '00000000-0000-4000-8000-000000000014',
  preview: '00000000-0000-4000-8000-000000000015',
  command: '00000000-0000-4000-8000-000000000016',
});

const tenantScope = Object.freeze({
  scopeType: 'workspace' as const,
  organizationId: ids.organization,
  workspaceId: ids.workspace,
});

const context = Object.freeze({
  tenantScope,
  actorId: ids.actor,
  correlationId: ids.correlation,
  idempotencyKey: 'request-1',
  authorizationEpoch: 1,
  mfaReenrollmentRequired: false,
}) as IamTenantContextV1;

function ok<TValue>(value: TValue): AgentDependencyResultV1<TValue> {
  return Object.freeze({ accepted: true as const, value });
}

function plan(): DdaAnalysisPlanV1 {
  return {
    schemaVersion: 1,
    planId: ids.plan,
    planVersionId: ids.planVersion,
    tenantScope,
    datasetVersionId: ids.datasetVersion,
    semanticVersionId: ids.plan,
    metricVersionId: ids.planVersion,
    dimensions: ['region'],
    filters: [],
    timeRange: {
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-12-31T23:59:59.000Z',
    },
    timeGrain: 'MONTH',
    joins: [],
    units: [{ field: 'amount', unit: 'VND' }],
    parameters: [],
    output: { form: 'TABLE', maxRows: 50 },
    assumptions: [],
    estimate: { cpuMs: 10, memoryMb: 10 },
    permissionProjectionVersionId: ids.plan,
    planHash: 'a'.repeat(64),
    createdAt: '2026-08-13T00:00:00.000Z',
  } as unknown as DdaAnalysisPlanV1;
}

function createAuthority(options?: {
  readonly level?: 'ANALYZE' | 'PROPOSE_CHANGES' | 'APPLY_CONFIRMED_CHANGES';
  readonly accessPreset?: 'EDITOR' | 'VIEWER';
  readonly deniedDatasetIds?: readonly string[];
  readonly throwError?: boolean;
}): AgentAuthorityPortV1 & { readonly calls: AgentToolExecutorInputV1[] } {
  const calls: AgentToolExecutorInputV1[] = [];
  return {
    calls,
    async authorize() {
      if (options?.throwError) throw new Error('authority unavailable');
      return Object.freeze({
        allowed: true as const,
        effectiveAgentLevel: options?.level ?? 'APPLY_CONFIRMED_CHANGES',
        accessPreset: options?.accessPreset ?? ('EDITOR' as const),
        deniedDatasetIds: Object.freeze([...(options?.deniedDatasetIds ?? [])]),
      });
    },
  };
}

function createDependencies(overrides: Partial<TypedAgentToolExecutorDependenciesV1> = {}) {
  const calls: string[] = [];
  const forwardedContexts: IamTenantContextV1[] = [];
  const auditRecords: Array<Record<string, unknown>> = [];
  const authority = createAuthority();
  const dataset: AgentDatasetReaderPortV1 = {
    async describe(input) {
      calls.push('dataset.describe');
      forwardedContexts.push(input.context);
      return ok({ datasetId: input.datasetId, schema: [{ field: 'amount', type: 'number' }] });
    },
    async sample(input) {
      calls.push('dataset.sample');
      forwardedContexts.push(input.context);
      return ok({
        sampleId: ids.evidence,
        columns: ['amount'],
        evidenceRefs: [{ evidenceId: ids.evidence, kind: 'RESULT_CELL' }],
      });
    },
  };
  const analysisPlanInput: AgentAnalysisPlanInputPortV1 = {
    async resolve(input) {
      calls.push('analysis.plan.input');
      forwardedContexts.push(input.context);
      return ok({
        datasetVersionId: ids.datasetVersion,
        semanticVersionId: ids.plan,
        metricVersionId: ids.planVersion,
        permissionProjectionVersionId: ids.plan,
        timeGrain: 'MONTH',
        units: { amount: 'VND' },
        dimensions: [],
        filters: [],
        joins: [],
        timeRange: {
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-12-31T23:59:59.000Z',
        },
        output: { form: 'TABLE', maxRows: 50 },
        question: input.question,
      });
    },
  };
  const analysisProposal = {
    async propose() {
      calls.push('analysis.plan');
      return {
        accepted: true as const,
        value: {
          plan: plan(),
          preview: { datasetVersionId: ids.datasetVersion, maxRows: 50 },
        },
      };
    },
  };
  const analysisPlanResolver: AgentAnalysisPlanResolverPortV1 = {
    async resolve(input) {
      calls.push('analysis.execute.resolve');
      forwardedContexts.push(input.context);
      return ok({
        plan: plan(),
        datasetId: ids.dataset,
      });
    },
  };
  const deterministicResults = {
    async execute(input: { readonly plan: DdaAnalysisPlanV1; readonly tenantScope: unknown }) {
      calls.push('analysis.execute');
      assert.equal(input.tenantScope, tenantScope);
      return {
        resultId: ids.evidence,
        cells: [
          {
            cellId: ids.evidence,
            field: 'amount',
            value: 30,
            unit: 'VND',
            planVersionId: input.plan.planVersionId,
            metricVersionId: input.plan.metricVersionId,
          },
        ],
        provenance: {
          planVersionId: input.plan.planVersionId,
          datasetVersionId: input.plan.datasetVersionId,
          engineVersion: 'engine-test',
        },
      };
    },
  };
  const dashboardProposal = {
    async propose(_context: IamTenantContextV1, input: { readonly question: string }) {
      calls.push('dashboard.propose');
      assert.equal(input.question, 'make a chart');
      return ok({
        proposalId: ids.preview,
        options: [{ optionId: ids.widget }],
        previewOnly: true,
        publishes: false,
      });
    },
  };
  const dashboardPreview: AgentDashboardPreviewPortV1 = {
    async resolve(input) {
      calls.push('dashboard.preview');
      forwardedContexts.push(input.context);
      return ok({
        previewCommandId: input.previewCommandId,
        expectedVersion: 4,
        revision: 7,
        idempotencyKey: 'apply-1',
        dashboardId: ids.dashboard,
        command: {
          schemaVersion: 3,
          kind: 'REMOVE_WIDGET',
          commandId: ids.command,
          dashboardId: ids.dashboard,
          expectedVersionId: ids.plan,
          expectedRevision: 7,
          widgetId: ids.widget,
          createdAt: '2026-08-13T00:00:00.000Z',
        },
      });
    },
  };
  const dashboardDraft = {
    async applyAuthoringCommand() {
      calls.push('dashboard.applyConfirmed');
      return ok({ commandId: ids.command, revision: 8, publishes: false });
    },
  };
  const dashboardValue: AgentDashboardValuePortV1 = {
    async explainValue(input) {
      calls.push('dashboard.explainValue');
      forwardedContexts.push(input.context);
      return ok({
        explanation: 'deterministic reference',
        evidenceRefs: [{ evidenceId: ids.evidence, kind: 'RESULT_CELL' }],
      });
    },
  };
  const evidence: AgentEvidenceResolverPortV1 = {
    async resolve(input) {
      calls.push('evidence.resolve');
      forwardedContexts.push(input.context);
      return ok({
        evidenceId: input.evidenceId,
        kind: 'RESULT_CELL',
        reference: { resultId: ids.evidence },
      });
    },
  };
  const source: AgentSourceOpenPortV1 = {
    async open(input) {
      calls.push('source.open');
      forwardedContexts.push(input.context);
      return ok({ sourceId: input.sourceId, kind: 'OPEN_ON_SOURCE_DEVICE' });
    },
  };
  const etl: AgentEtlCorrectionPortV1 = {
    async proposeCorrection(input) {
      calls.push('etl.proposeCorrection');
      forwardedContexts.push(input.context);
      return ok({
        proposalId: ids.preview,
        state: 'NEEDS_REVIEW',
        plan: { correction: input.correction },
      });
    },
  };
  const audit = {
    async emitContentSafeSummary(input: Record<string, unknown>) {
      auditRecords.push(input);
    },
  };
  const iamActionAuthorization = {
    async authorize() {
      return { allowed: true as const };
    },
  };
  const commandResults = new Map<
    string,
    { readonly fingerprint: string; readonly result: AgentToolExecutionResultV1 }
  >();
  const consequentialCommand: AgentConsequentialCommandPortV1 = {
    async execute(input) {
      const scope = input.context.tenantScope as {
        readonly organizationId: string;
        readonly workspaceId?: string;
        readonly projectId?: string;
      };
      const key = [
        scope.organizationId,
        scope.workspaceId ?? '',
        scope.projectId ?? '',
        input.context.actorId,
        input.descriptor.name,
        input.idempotencyKey,
      ].join(':');
      const existing = commandResults.get(key);
      if (existing !== undefined) {
        return existing.fingerprint === input.inputFingerprint
          ? existing.result
          : { accepted: false as const, code: 'IDEMPOTENCY_CONFLICT' as const };
      }
      if (!(await input.audit('ATTEMPTED'))) {
        return { accepted: false as const, code: 'PROVIDER_FAILURE' as const };
      }
      const result = await input.perform();
      if (!result.accepted) return result;
      if (!(await input.audit('SUCCEEDED'))) {
        return { accepted: false as const, code: 'PROVIDER_FAILURE' as const };
      }
      commandResults.set(key, { fingerprint: input.inputFingerprint, result });
      return result;
    },
  };

  return {
    calls,
    forwardedContexts,
    auditRecords,
    authority,
    dependencies: {
      registry: new AgentToolRegistryV1(),
      authority,
      iamActionAuthorization,
      consequentialCommand,
      dataset,
      analysisPlanInput,
      analysisProposalService: analysisProposal,
      analysisPlanResolver,
      deterministicResults,
      dashboardProposalService: dashboardProposal,
      dashboardPreview,
      dashboardDraftService: dashboardDraft,
      dashboardValue,
      evidence,
      source,
      etl,
      audit,
      ...overrides,
    } as TypedAgentToolExecutorDependenciesV1,
  };
}

function executorFor(overrides: Partial<TypedAgentToolExecutorDependenciesV1> = {}) {
  const harness = createDependencies(overrides);
  return { harness, executor: new TypedAgentToolExecutorAdapter(harness.dependencies) };
}

function descriptorFor(registry: AgentToolRegistryV1, name: string) {
  const resolved = registry.resolve(name);
  assert.equal(resolved.accepted, true);
  if (!resolved.accepted) throw new Error(`missing descriptor ${name}`);
  return resolved.value;
}

function request(
  registry: AgentToolRegistryV1,
  name: string,
  input: Readonly<Record<string, unknown>>,
  correlationId: string = context.correlationId,
): AgentToolExecutorInputV1 {
  return {
    context,
    descriptor: descriptorFor(registry, name),
    input,
    authority: {
      allowed: true,
      effectiveAgentLevel: 'APPLY_CONFIRMED_CHANGES',
      accessPreset: 'EDITOR',
      deniedDatasetIds: [],
    },
    correlationId,
  };
}

void test('[DDA-060] maps exactly the ten registered names and rejects a forged unknown descriptor', async () => {
  const { harness, executor } = executorFor();
  const registry = harness.dependencies.registry;
  const inputs: Record<string, Readonly<Record<string, unknown>>> = {
    'dataset.describe': { datasetId: ids.dataset },
    'dataset.sample': { datasetId: ids.dataset, limit: 2, columns: ['amount'] },
    'analysis.plan': { datasetId: ids.dataset, question: 'show monthly amount' },
    'analysis.execute': {
      planId: ids.planVersion,
      datasetId: ids.dataset,
      datasetVersionId: ids.datasetVersion,
    },
    'dashboard.propose': { dashboardId: ids.dashboard, question: 'make a chart' },
    'dashboard.applyConfirmed': {
      previewCommandId: ids.preview,
      userConfirmation: true,
      expectedVersion: 4,
      revision: 7,
      idempotencyKey: 'apply-1',
    },
    'dashboard.explainValue': { dashboardId: ids.dashboard, widgetId: ids.widget },
    'evidence.resolve': { evidenceId: ids.evidence },
    'source.open': { sourceId: ids.source },
    'etl.proposeCorrection': {
      datasetId: ids.dataset,
      issueId: ids.issue,
      correction: 'trim amount text',
    },
  };
  assert.deepEqual(Object.keys(inputs).sort(), [...AGENT_TOOL_NAMES_V1].sort());
  for (const name of AGENT_TOOL_NAMES_V1) {
    const result = await executor.execute(request(registry, name, inputs[name]!));
    assert.equal(result.accepted, true, name);
    if (result.accepted) {
      const descriptor = descriptorFor(registry, name);
      assert.deepEqual(
        Object.keys(result.value as Record<string, unknown>).sort(),
        descriptor.outputSchema.properties
          .filter((key) =>
            Object.prototype.hasOwnProperty.call(result.value as Record<string, unknown>, key),
          )
          .sort(),
        `${name} output is closed`,
      );
      for (const required of descriptor.outputSchema.requiredProperties) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(result.value, required),
          true,
          `${name} required output ${required}`,
        );
      }
    }
  }
  assert.deepEqual(harness.calls, [
    'dataset.describe',
    'dataset.sample',
    'analysis.plan.input',
    'analysis.plan',
    'analysis.execute.resolve',
    'analysis.execute',
    'dashboard.propose',
    'dashboard.preview',
    'dashboard.applyConfirmed',
    'dashboard.explainValue',
    'evidence.resolve',
    'source.open',
    'etl.proposeCorrection',
  ]);
  for (const name of AGENT_TOOL_NAMES_V1) {
    assert.equal(
      harness.auditRecords.some((record) => record['action'] === `DDA_AGENT_TOOL_${name}`),
      true,
      `${name} is audited`,
    );
  }

  const forged = {
    ...descriptorFor(registry, 'dataset.describe'),
    name: 'shell.execute',
  } as unknown as AgentToolExecutorInputV1['descriptor'];
  const forgedResult = await executor.execute({
    ...request(registry, 'dataset.describe', { datasetId: ids.dataset }),
    descriptor: forged,
  });
  assert.deepEqual(forgedResult, { accepted: false, code: 'UNKNOWN_TOOL' });

  const validDescriptor = descriptorFor(registry, 'dataset.describe');
  const wrongAction = {
    ...validDescriptor,
    requiredIamAction:
      validDescriptor.requiredIamAction === PERMISSIONS_V1.ARTIFACT_RECORD_READ
        ? PERMISSIONS_V1.PROJECT_RECORD_READ
        : PERMISSIONS_V1.ARTIFACT_RECORD_READ,
  };
  const wrongActionResult = await executor.execute({
    ...request(registry, 'dataset.describe', { datasetId: ids.dataset }),
    descriptor: wrongAction,
  });
  assert.deepEqual(wrongActionResult, { accepted: false, code: 'UNAUTHORIZED' });
});

void test('[DDA-060][IAM-024] revalidates the registry descriptor, authority level, preset, denied dataset, and tenant context', async () => {
  const lowAuthority = createAuthority({ level: 'ANALYZE' });
  const { harness, executor } = executorFor({ authority: lowAuthority });
  const descriptor = descriptorFor(harness.dependencies.registry, 'dashboard.propose');
  const result = await executor.execute({
    context,
    descriptor,
    input: { dashboardId: ids.dashboard, question: 'make a chart' },
    authority: {
      allowed: true,
      effectiveAgentLevel: 'APPLY_CONFIRMED_CHANGES',
      accessPreset: 'EDITOR',
      deniedDatasetIds: [],
    },
    correlationId: context.correlationId,
  });
  assert.deepEqual(result, { accepted: false, code: 'UNAUTHORIZED' });
  assert.equal(harness.calls.includes('dashboard.propose'), false);

  const denied = createAuthority({ deniedDatasetIds: [ids.dataset] });
  const deniedHarness = createDependencies({ authority: denied });
  const deniedExecutor = new TypedAgentToolExecutorAdapter(deniedHarness.dependencies);
  const deniedResult = await deniedExecutor.execute({
    ...request(deniedHarness.dependencies.registry, 'dataset.describe', { datasetId: ids.dataset }),
    authority: {
      allowed: true,
      effectiveAgentLevel: 'APPLY_CONFIRMED_CHANGES',
      accessPreset: 'EDITOR',
      deniedDatasetIds: [ids.dataset],
    },
  });
  assert.deepEqual(deniedResult, { accepted: false, code: 'DATASET_RESTRICTED' });
  assert.equal(deniedHarness.calls.includes('dataset.describe'), false);

  const viewer = createAuthority({ accessPreset: 'VIEWER', level: 'APPLY_CONFIRMED_CHANGES' });
  const viewerHarness = createDependencies({ authority: viewer });
  const viewerResult = await new TypedAgentToolExecutorAdapter(viewerHarness.dependencies).execute({
    ...request(viewerHarness.dependencies.registry, 'dashboard.applyConfirmed', {
      previewCommandId: ids.preview,
      userConfirmation: true,
      expectedVersion: 4,
      revision: 7,
      idempotencyKey: 'apply-1',
    }),
    authority: {
      allowed: true,
      effectiveAgentLevel: 'APPLY_CONFIRMED_CHANGES',
      accessPreset: 'VIEWER',
      deniedDatasetIds: [],
    },
  });
  assert.deepEqual(viewerResult, { accepted: false, code: 'UNAUTHORIZED' });
  assert.equal(viewerHarness.calls.includes('dashboard.preview'), false);
});

void test('[DDA-043][DDA-060] rejects input smuggling, wrong types, non-stable IDs, and over-bound samples', async () => {
  const { harness, executor } = executorFor();
  const registry = harness.dependencies.registry;
  const smuggled = await executor.execute(
    request(registry, 'dataset.describe', {
      datasetId: ids.dataset,
      rawQuery: 'select * from secrets',
    }),
  );
  assert.deepEqual(smuggled, { accepted: false, code: 'MALFORMED_TOOL_CALL' });
  const wrongType = await executor.execute(
    request(registry, 'dataset.sample', { datasetId: ids.dataset, limit: '50' }),
  );
  assert.deepEqual(wrongType, { accepted: false, code: 'MALFORMED_TOOL_CALL' });
  const invalidId = await executor.execute(
    request(registry, 'dataset.describe', { datasetId: 'customer-visible-name' }),
  );
  assert.deepEqual(invalidId, { accepted: false, code: 'MALFORMED_TOOL_CALL' });
  const overBound = await executor.execute(
    request(registry, 'dataset.sample', { datasetId: ids.dataset, limit: 51 }),
  );
  assert.deepEqual(overBound, { accepted: false, code: 'OVER_BOUND_SAMPLE' });
});

void test('[DDA-060] rejects oversized or forbidden dependency output before returning it', async () => {
  const dataset: AgentDatasetReaderPortV1 = {
    async describe() {
      return ok({ localPath: 'C:\\Users\\secret\\data.csv' });
    },
    async sample() {
      return ok({ rows: Array.from({ length: 51 }, () => ({ amount: 1 })) });
    },
  };
  const { harness, executor } = executorFor({ dataset });
  const forbidden = await executor.execute(
    request(harness.dependencies.registry, 'dataset.describe', { datasetId: ids.dataset }),
  );
  assert.deepEqual(forbidden, { accepted: false, code: 'PROVIDER_FAILURE' });
  const oversizedRows = await executor.execute(
    request(harness.dependencies.registry, 'dataset.sample', { datasetId: ids.dataset }),
  );
  assert.deepEqual(oversizedRows, { accepted: false, code: 'PROVIDER_FAILURE' });

  const unavailable = executorFor({
    dataset: undefined,
  } as unknown as Partial<TypedAgentToolExecutorDependenciesV1>);
  const unavailableResult = await unavailable.executor.execute(
    request(unavailable.harness.dependencies.registry, 'dataset.describe', {
      datasetId: ids.dataset,
    }),
  );
  assert.deepEqual(unavailableResult, { accepted: false, code: 'PROVIDER_FAILURE' });
});

void test('[DDA-060] maps downstream throws and timeouts to safe result codes', async () => {
  const throwing: AgentDatasetReaderPortV1 = {
    async describe() {
      throw new Error('raw database error must not escape');
    },
    async sample() {
      return ok({ rows: [] });
    },
  };
  const { harness, executor } = executorFor({ dataset: throwing });
  const thrown = await executor.execute(
    request(harness.dependencies.registry, 'dataset.describe', { datasetId: ids.dataset }),
  );
  assert.deepEqual(thrown, { accepted: false, code: 'PROVIDER_FAILURE' });

  const timeoutRegistry = new AgentToolRegistryV1();
  const baseDescriptor = descriptorFor(timeoutRegistry, 'dataset.describe');
  const fastDescriptor = { ...baseDescriptor, timeoutMs: 5 };
  const fastRegistry = {
    resolve(name: string) {
      const resolved = timeoutRegistry.resolve(name);
      if (!resolved.accepted || name !== 'dataset.describe') return resolved;
      return ok(fastDescriptor);
    },
  } as unknown as AgentToolRegistryV1;
  const slow: AgentDatasetReaderPortV1 = {
    async describe(input) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        input.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      });
      return ok({ schema: [] });
    },
    async sample() {
      return ok({ rows: [] });
    },
  };
  const timeoutHarness = createDependencies({ registry: fastRegistry, dataset: slow });
  const timeoutExecutor = new TypedAgentToolExecutorAdapter(timeoutHarness.dependencies);
  const timeout = await timeoutExecutor.execute({
    ...request(timeoutHarness.dependencies.registry, 'dataset.describe', {
      datasetId: ids.dataset,
    }),
    descriptor: fastDescriptor,
  });
  assert.deepEqual(timeout, { accepted: false, code: 'PROVIDER_TIMEOUT' });
});

void test('[DDA-024][DDA-060] keeps dashboard proposals preview-only and requires the exact confirmed preview for mutation', async () => {
  const { harness, executor } = executorFor();
  const registry = harness.dependencies.registry;
  const proposal = await executor.execute(
    request(registry, 'dashboard.propose', {
      dashboardId: ids.dashboard,
      question: 'make a chart',
    }),
  );
  assert.equal(proposal.accepted, true);
  assert.deepEqual(harness.calls.includes('dashboard.applyConfirmed'), false);

  const unconfirmed = await executor.execute(
    request(registry, 'dashboard.applyConfirmed', {
      previewCommandId: ids.preview,
      userConfirmation: false,
      expectedVersion: 4,
      revision: 7,
      idempotencyKey: 'apply-1',
    }),
  );
  assert.deepEqual(unconfirmed, { accepted: false, code: 'UNCONFIRMED_DASHBOARD_APPLY' });

  const wrongIdempotency = await executor.execute(
    request(registry, 'dashboard.applyConfirmed', {
      previewCommandId: ids.preview,
      userConfirmation: true,
      expectedVersion: 4,
      revision: 7,
      idempotencyKey: 'wrong',
    }),
  );
  assert.deepEqual(wrongIdempotency, { accepted: false, code: 'UNAUTHORIZED' });

  const staleRevision = await executor.execute(
    request(registry, 'dashboard.applyConfirmed', {
      previewCommandId: ids.preview,
      userConfirmation: true,
      expectedVersion: 5,
      revision: 7,
      idempotencyKey: 'apply-1',
    }),
  );
  assert.deepEqual(staleRevision, { accepted: false, code: 'UNAUTHORIZED' });

  const applied = await executor.execute(
    request(registry, 'dashboard.applyConfirmed', {
      previewCommandId: ids.preview,
      userConfirmation: true,
      expectedVersion: 4,
      revision: 7,
      idempotencyKey: 'apply-1',
    }),
  );
  assert.equal(applied.accepted, true);

  const repeated = await executor.execute(
    request(registry, 'dashboard.applyConfirmed', {
      previewCommandId: ids.preview,
      userConfirmation: true,
      expectedVersion: 4,
      revision: 7,
      idempotencyKey: 'apply-1',
    }),
  );
  assert.deepEqual(repeated, applied);
  assert.equal(harness.calls.filter((call) => call === 'dashboard.applyConfirmed').length, 1);
  assert.equal(
    harness.auditRecords.some(
      (record) => record['action'] === 'DDA_AGENT_TOOL_dashboard.applyConfirmed',
    ),
    true,
  );
});

void test('[DDA-060] analysis execution resolves an existing tenant-bound plan and calls deterministic results only', async () => {
  const { harness, executor } = executorFor();
  const result = await executor.execute(
    request(
      harness.dependencies.registry,
      'analysis.execute',
      {
        planId: ids.planVersion,
        datasetId: ids.dataset,
        datasetVersionId: ids.datasetVersion,
        parameters: { region: 'north' },
      },
      'turn-request-1:tool:analysis-execute',
    ),
  );
  assert.equal(result.accepted, true);
  assert.deepEqual(harness.calls, ['analysis.execute.resolve', 'analysis.execute']);
  assert.equal(
    harness.forwardedContexts.every((value) => value === context),
    true,
  );
});

void test('[DDA-060][IAM-024] analysis execution authorizes the logical dataset and exact version separately', async () => {
  const { harness, executor } = executorFor();
  const result = await executor.execute(
    request(harness.dependencies.registry, 'analysis.execute', {
      planId: ids.planVersion,
      datasetId: ids.datasetVersion,
      datasetVersionId: ids.datasetVersion,
    }),
  );
  assert.deepEqual(result, { accepted: false, code: 'UNAUTHORIZED' });
  assert.equal(harness.calls.includes('analysis.execute'), false);
});

void test('[DDA-060][IAM-024] analysis provenance cannot drift from the resolved exact version', async () => {
  const deterministicResults = {
    async execute() {
      return {
        resultId: ids.evidence,
        cells: [],
        provenance: {
          planVersionId: ids.planVersion,
          datasetVersionId: ids.plan,
          engineVersion: 'engine-test',
        },
      };
    },
  };
  const { harness, executor } = executorFor({ deterministicResults });
  const result = await executor.execute(
    request(harness.dependencies.registry, 'analysis.execute', {
      planId: ids.planVersion,
      datasetId: ids.dataset,
      datasetVersionId: ids.datasetVersion,
    }),
  );
  assert.deepEqual(result, { accepted: false, code: 'PROVIDER_FAILURE' });
});

void test('[DDA-052][IAE-007] LOCAL source actions are returned without paths and references stay permission-filtered', async () => {
  const source: AgentSourceOpenPortV1 = {
    async open(input) {
      return ok({
        sourceId: input.sourceId,
        kind: 'OPEN_ON_SOURCE_DEVICE',
        localPath: 'C:\\Users\\secret\\source.csv',
      });
    },
  };
  const evidence: AgentEvidenceResolverPortV1 = {
    async resolve(input) {
      return ok({
        evidenceId: input.evidenceId,
        kind: 'SOURCE',
        reference: { sourceId: ids.source },
      });
    },
  };
  const { harness, executor } = executorFor({ source, evidence });
  const opened = await executor.execute(
    request(harness.dependencies.registry, 'source.open', { sourceId: ids.source }),
  );
  assert.equal(opened.accepted, true);
  if (!opened.accepted) return;
  assert.equal(JSON.stringify(opened.value).includes('localPath'), false);
  assert.equal(JSON.stringify(opened.value).includes('C:\\Users'), false);

  const resolved = await executor.execute(
    request(harness.dependencies.registry, 'evidence.resolve', { evidenceId: ids.evidence }),
  );
  assert.equal(resolved.accepted, true);
  if (!resolved.accepted) return;
  assert.equal(JSON.stringify(resolved.value).includes('localPath'), false);

  const leakingEvidence: AgentEvidenceResolverPortV1 = {
    async resolve(input) {
      return ok({
        evidenceId: input.evidenceId,
        kind: 'SOURCE',
        reference: { sourceId: ids.source },
        rows: [],
      });
    },
  };
  const leakingHarness = executorFor({ evidence: leakingEvidence });
  const leakingResult = await leakingHarness.executor.execute(
    request(leakingHarness.harness.dependencies.registry, 'evidence.resolve', {
      evidenceId: ids.evidence,
    }),
  );
  assert.deepEqual(leakingResult, { accepted: false, code: 'PROVIDER_FAILURE' });
});

void test('[DDA-045] consequential calls fail closed when audit is unavailable or fails, and successful calls record safe references', async () => {
  const missingAudit = createDependencies();
  const missingAuditDependencies = { ...missingAudit.dependencies };
  delete missingAuditDependencies.audit;
  const blocked = await new TypedAgentToolExecutorAdapter(missingAuditDependencies).execute(
    request(missingAudit.dependencies.registry, 'etl.proposeCorrection', {
      datasetId: ids.dataset,
      issueId: ids.issue,
      correction: 'trim amount text',
    }),
  );
  assert.deepEqual(blocked, { accepted: false, code: 'PROVIDER_FAILURE' });
  assert.equal(missingAudit.calls.includes('etl.proposeCorrection'), false);

  const failingAudit = {
    async emitContentSafeSummary() {
      throw new Error('audit unavailable');
    },
  };
  const failed = createDependencies({ audit: failingAudit });
  const result = await new TypedAgentToolExecutorAdapter(failed.dependencies).execute(
    request(failed.dependencies.registry, 'analysis.plan', {
      datasetId: ids.dataset,
      question: 'show monthly amount',
    }),
  );
  assert.deepEqual(result, { accepted: false, code: 'PROVIDER_FAILURE' });
  assert.equal(failed.calls.includes('analysis.plan'), false);
});

void test('[DDA-016][DSM-016] ETL correction is a review proposal and never an acceptance', async () => {
  const { harness, executor } = executorFor();
  const result = await executor.execute(
    request(harness.dependencies.registry, 'etl.proposeCorrection', {
      datasetId: ids.dataset,
      issueId: ids.issue,
      correction: 'trim amount text',
    }),
  );
  assert.equal(result.accepted, true);
  assert.equal(harness.calls.includes('etl.accept'), false);
  if (result.accepted) {
    assert.equal((result.value as { state: string }).state, 'NEEDS_REVIEW');
  }
});

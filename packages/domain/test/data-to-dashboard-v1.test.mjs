import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DDA_SCHEMA_VERSION_V1,
  createDdaAnalysisPlanV1,
  createDdaEtlPlanV1,
  createDdaFolderManifestV1,
  createDdaMaterializationV1,
  createDdaReceiptCandidateV1,
  createDdaRefreshEventV1,
  createDashboardSnapshotV1,
  createDashboardVersionV1,
} from '@databreeze/domain/data-to-dashboard/v1';

const scope = Object.freeze({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});

const otherScope = Object.freeze({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000099',
  workspaceId: '00000000-0000-4000-8000-000000000098',
  projectId: '00000000-0000-4000-8000-000000000097',
});

const hash = 'a'.repeat(64);
const createdAt = '2026-08-10T10:00:00.000Z';

const ids = Object.freeze({
  plan: '00000000-0000-4000-8000-000000000010',
  version: '00000000-0000-4000-8000-000000000011',
  input: '00000000-0000-4000-8000-000000000012',
  schema: '00000000-0000-4000-8000-000000000013',
  mapping: '00000000-0000-4000-8000-000000000014',
  rule: '00000000-0000-4000-8000-000000000015',
  engine: '00000000-0000-4000-8000-000000000016',
  step: '00000000-0000-4000-8000-000000000017',
  dataset: '00000000-0000-4000-8000-000000000018',
  semantic: '00000000-0000-4000-8000-000000000019',
  metric: '00000000-0000-4000-8000-00000000001a',
  dashboard: '00000000-0000-4000-8000-00000000001b',
  page: '00000000-0000-4000-8000-00000000001c',
  widget: '00000000-0000-4000-8000-00000000001d',
  filter: '00000000-0000-4000-8000-00000000001e',
  materialization: '00000000-0000-4000-8000-00000000001f',
  resultManifest: '00000000-0000-4000-8000-000000000020',
  permission: '00000000-0000-4000-8000-000000000021',
  parent: '00000000-0000-4000-8000-000000000022',
  artifact: '00000000-0000-4000-8000-000000000023',
  retention: '00000000-0000-4000-8000-000000000024',
  evidence: '00000000-0000-4000-8000-000000000025',
  capability: '00000000-0000-4000-8000-000000000026',
  binding: '00000000-0000-4000-8000-000000000027',
  event: '00000000-0000-4000-8000-000000000028',
  snapshot: '00000000-0000-4000-8000-000000000029',
  capture: '00000000-0000-4000-8000-00000000002a',
});

function etlPlanInput(overrides = {}) {
  return {
    planId: ids.plan,
    planVersionId: ids.version,
    tenantScope: scope,
    inputArtifactVersionId: ids.input,
    schemaVersionId: ids.schema,
    mappingVersionId: ids.mapping,
    ruleSetVersionId: ids.rule,
    engineBindingId: ids.engine,
    transformations: [
      {
        stepId: ids.step,
        kind: 'TRIM_TEXT',
        inputs: [ids.input],
        config: { field: 'name' },
      },
    ],
    contentHash: hash,
    schemaHash: hash,
    dataClassification: 'INTERNAL',
    dataModePolicyVersionId: ids.permission,
    retentionReferenceId: ids.retention,
    evidenceReferenceId: ids.evidence,
    createdAt,
    ...overrides,
  };
}

function analysisPlanInput(overrides = {}) {
  return {
    planId: ids.plan,
    planVersionId: ids.version,
    tenantScope: scope,
    datasetVersionId: ids.dataset,
    semanticVersionId: ids.semantic,
    metricVersionId: ids.metric,
    dimensions: ['region'],
    filters: [{ field: 'year', operator: 'EQ', value: '2026' }],
    timeRange: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
    timeGrain: 'MONTH',
    joins: [],
    units: { amount: 'VND' },
    parameters: {},
    output: { form: 'TABLE', maxRows: 100 },
    assumptions: ['Uses accepted sales dataset only'],
    estimate: { cpuMs: 100, memoryMb: 64 },
    permissionProjectionVersionId: ids.permission,
    planHash: hash,
    createdAt,
    ...overrides,
  };
}

function dashboardVersionInput(overrides = {}) {
  return {
    dashboardId: ids.dashboard,
    versionId: ids.version,
    tenantScope: scope,
    parentVersionId: ids.parent,
    pages: [
      {
        pageId: ids.page,
        order: 1,
        title: { vi: 'Doanh so', en: 'Sales' },
        layout: {
          desktop: [{ widgetId: ids.widget, x: 0, y: 0, w: 6, h: 4 }],
          tablet: [{ widgetId: ids.widget, x: 0, y: 0, w: 6, h: 4 }],
          mobile: [{ widgetId: ids.widget, x: 0, y: 0, w: 4, h: 4 }],
        },
      },
    ],
    widgets: [
      {
        widgetId: ids.widget,
        type: 'KPI',
        pageId: ids.page,
        binding: {
          analysisPlanVersionId: ids.plan,
          materializationDefinitionId: ids.materialization,
        },
        title: { vi: 'Tong doanh so', en: 'Total sales' },
      },
    ],
    filters: [
      {
        filterId: ids.filter,
        field: 'region',
        operator: 'IN',
        scope: 'DASHBOARD',
      },
    ],
    datasetBindings: [
      {
        datasetVersionId: ids.dataset,
        semanticVersionId: ids.semantic,
        metricVersionId: ids.metric,
      },
    ],
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    freshnessPolicy: 'ON_CHANGE',
    publicationPolicy: 'REVIEWED',
    canonicalHash: hash,
    createdAt,
    ...overrides,
  };
}

function materializationInput(overrides = {}) {
  return {
    materializationId: ids.materialization,
    tenantScope: scope,
    dashboardVersionId: ids.version,
    widgetId: ids.widget,
    analysisPlanVersionId: ids.plan,
    datasetVersionId: ids.dataset,
    semanticVersionId: ids.semantic,
    metricVersionId: ids.metric,
    permissionProjectionVersionId: ids.permission,
    parameterHash: hash,
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    engineVersion: 'engine-1.0.0',
    adapterVersion: 'adapter-1.0.0',
    effectivePolicyVersionId: ids.permission,
    resultManifestId: ids.resultManifest,
    cacheIdentityHash: hash,
    createdAt,
    ...overrides,
  };
}

function snapshotInput(overrides = {}) {
  return {
    snapshotId: ids.snapshot,
    tenantScope: scope,
    dashboardVersionId: ids.version,
    materializationIds: [ids.materialization],
    inputSelectorHash: hash,
    permissionProjectionVersionId: ids.permission,
    audience: 'WORKSPACE_VIEWERS',
    freshnessState: 'FRESH',
    evidenceState: 'AVAILABLE',
    canonicalHash: hash,
    createdAt,
    ...overrides,
  };
}

void test('[DDA-003] creates immutable ETL plans with full TenantScope and lineage bindings', () => {
  const mutable = etlPlanInput();
  const result = createDdaEtlPlanV1(mutable);
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.schemaVersion, DDA_SCHEMA_VERSION_V1);
  assert.equal(result.value.tenantScope.projectId, scope.projectId);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.transformations), true);
  mutable.transformations[0].kind = 'EXECUTE_SQL';
  assert.equal(result.value.transformations[0].kind, 'TRIM_TEXT');
});

void test('[DDA-003] rejects ETL plans missing TenantScope', () => {
  const result = createDdaEtlPlanV1(etlPlanInput({ tenantScope: undefined }));
  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.equal(result.code, 'INVALID_SCOPE');
});

void test('[DDA-003] rejects cross-scope parent and input references', () => {
  const parent = createDashboardVersionV1(
    dashboardVersionInput({ tenantScope: otherScope, parentVersionId: undefined }),
  );
  assert.equal(parent.accepted, true);
  if (!parent.accepted) return;

  const crossParent = createDashboardVersionV1(
    dashboardVersionInput({
      parentVersionId: parent.value.versionId,
      parentTenantScope: otherScope,
    }),
  );
  assert.equal(crossParent.accepted, false);
  if (crossParent.accepted) return;
  assert.equal(crossParent.code, 'CROSS_SCOPE_REFERENCE');

  const crossInput = createDdaEtlPlanV1(
    etlPlanInput({
      inputTenantScope: otherScope,
    }),
  );
  assert.equal(crossInput.accepted, false);
  if (crossInput.accepted) return;
  assert.equal(crossInput.code, 'CROSS_SCOPE_REFERENCE');
});

void test('[DDA-003, DDA-005] rejects arbitrary-code transformation kinds', () => {
  for (const kind of ['EXECUTE_SQL', 'PYTHON', 'JAVASCRIPT', 'SHELL', 'ARBITRARY_CODE']) {
    const result = createDdaEtlPlanV1(
      etlPlanInput({
        transformations: [
          {
            stepId: ids.step,
            kind,
            inputs: [ids.input],
            config: { code: 'drop table' },
          },
        ],
      }),
    );
    assert.equal(result.accepted, false, kind);
    if (result.accepted) return;
    assert.equal(result.code, 'UNSUPPORTED_TRANSFORM');
  }
});

void test('[DDA-003, DDA-027] rejects STREAMING freshness as an implemented V1 policy', () => {
  const result = createDashboardVersionV1(dashboardVersionInput({ freshnessPolicy: 'STREAMING' }));
  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.equal(result.code, 'UNSUPPORTED_FRESHNESS');
});

void test('[DDA-003, DDA-022] rejects unstable page and widget identifiers', () => {
  const badPage = createDashboardVersionV1(
    dashboardVersionInput({
      pages: [
        {
          pageId: 'page-1',
          order: 1,
          title: { vi: 'Doanh so', en: 'Sales' },
          layout: {
            desktop: [{ widgetId: ids.widget, x: 0, y: 0, w: 6, h: 4 }],
            tablet: [{ widgetId: ids.widget, x: 0, y: 0, w: 6, h: 4 }],
            mobile: [{ widgetId: ids.widget, x: 0, y: 0, w: 4, h: 4 }],
          },
        },
      ],
    }),
  );
  assert.equal(badPage.accepted, false);
  if (badPage.accepted) return;
  assert.equal(badPage.code, 'INVALID_IDENTIFIER');

  const badWidget = createDashboardVersionV1(
    dashboardVersionInput({
      widgets: [
        {
          widgetId: 'kpi-1',
          type: 'KPI',
          pageId: ids.page,
          binding: {
            analysisPlanVersionId: ids.plan,
            materializationDefinitionId: ids.materialization,
          },
          title: { vi: 'Tong doanh so', en: 'Total sales' },
        },
      ],
    }),
  );
  assert.equal(badWidget.accepted, false);
  if (badWidget.accepted) return;
  assert.equal(badWidget.code, 'INVALID_IDENTIFIER');
});

void test('[DDA-003, DDA-029] rejects incomplete materialization cache identities', () => {
  const result = createDdaMaterializationV1(
    materializationInput({
      permissionProjectionVersionId: undefined,
    }),
  );
  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.equal(result.code, 'INCOMPLETE_CACHE_IDENTITY');
});

void test('[DDA-003, DDA-025] rejects snapshot hashes that omit value-affecting fields', () => {
  const materialization = createDdaMaterializationV1(materializationInput());
  assert.equal(materialization.accepted, true);
  if (!materialization.accepted) return;

  const version = createDashboardVersionV1(dashboardVersionInput({ parentVersionId: undefined }));
  assert.equal(version.accepted, true);
  if (!version.accepted) return;

  const result = createDashboardSnapshotV1(
    snapshotInput({
      dashboardVersion: version.value,
      materializations: [materialization.value],
      canonicalHash: 'b'.repeat(64),
    }),
  );
  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.equal(result.code, 'INVALID_HASH');
});

void test('[DDA-003] creates typed analysis plans, folder manifests, receipts, and refresh events', () => {
  const analysis = createDdaAnalysisPlanV1(analysisPlanInput());
  assert.equal(analysis.accepted, true);
  if (!analysis.accepted) return;
  assert.equal(analysis.value.output.form, 'TABLE');

  const folder = createDdaFolderManifestV1({
    manifestId: ids.binding,
    tenantScope: scope,
    capabilityGrantId: ids.capability,
    purpose: 'SALES_FOLDER',
    supportedProfiles: ['CSV', 'XLSX'],
    publicationProjectionId: ids.permission,
    manifestHash: hash,
    version: 1,
  });
  assert.equal(folder.accepted, true);
  if (!folder.accepted) return;
  assert.equal('localPath' in folder.value, false);

  const receipt = createDdaReceiptCandidateV1({
    candidateId: ids.capture,
    tenantScope: scope,
    artifactVersionId: ids.artifact,
    profileVersionId: ids.version,
    fieldCandidates: {
      merchant: { value: 'Cafe', confidence: 0.9 },
      total: { value: '120000', confidence: 0.95 },
    },
    adapterVersion: 'ocr-1',
    evidenceReferenceId: ids.evidence,
    candidateHash: hash,
  });
  assert.equal(receipt.accepted, true);
  if (!receipt.accepted) return;
  assert.equal('imageBytes' in receipt.value, false);

  const refresh = createDdaRefreshEventV1({
    eventId: ids.event,
    tenantScope: scope,
    dashboardId: ids.dashboard,
    snapshotId: ids.snapshot,
    freshnessState: 'FRESH',
    occurredAt: createdAt,
    eventHash: hash,
  });
  assert.equal(refresh.accepted, true);
  if (!refresh.accepted) return;
  assert.equal('resultCells' in refresh.value, false);
});

test('creates unified-workspace grants, conversation bounds, and table candidates', async () => {
  const { createDdaAgentGrantV1, createDdaConversationV1, createDdaTableExtractionCandidateV1, createDdaStarterDashboardEventV1, createDdaConversationContextEventV1 } =
    await import('@databreeze/domain/data-to-dashboard/v1');

  const grant = createDdaAgentGrantV1({
    grantId: ids.binding,
    tenantScope: scope,
    memberId: ids.permission,
    level: 'ANALYZE',
    revision: 1,
    updatedAt: createdAt,
  });
  assert.equal(grant.accepted, true);

  const unknownGrant = createDdaAgentGrantV1({
    grantId: ids.binding,
    tenantScope: scope,
    memberId: ids.permission,
    level: 'ADMIN',
    revision: 1,
    updatedAt: createdAt,
  });
  assert.equal(unknownGrant.accepted, false);

  const conversation = createDdaConversationV1({
    conversationId: ids.event,
    tenantScope: scope,
    title: 'Phan tich',
    activeDatasetIds: [ids.dataset],
    history: [
      {
        messageId: ids.step,
        role: 'USER',
        text: 'Tong doanh so?',
        createdAt,
      },
    ],
    updatedAt: createdAt,
  });
  assert.equal(conversation.accepted, true);

  const tooManyDatasets = createDdaConversationV1({
    conversationId: ids.event,
    tenantScope: scope,
    title: 'Too many',
    activeDatasetIds: Array.from({ length: 9 }, (_, index) => `00000000-0000-4000-8000-${String(200 + index).padStart(12, '0')}`),
    history: [],
    updatedAt: createdAt,
  });
  assert.equal(tooManyDatasets.accepted, false);

  const context = createDdaConversationContextEventV1({
    eventId: ids.event,
    conversationId: ids.snapshot,
    tenantScope: scope,
    kind: 'DATASET_VERSION_ADVANCED',
    beforeVersionId: ids.version,
    afterVersionId: ids.input,
    occurredAt: createdAt,
  });
  assert.equal(context.accepted, true);

  const table = createDdaTableExtractionCandidateV1({
    candidateId: ids.capture,
    tenantScope: scope,
    artifactVersionId: ids.artifact,
    pageCount: 1,
    columns: ['Item'],
    cells: [
      {
        row: 0,
        column: 0,
        text: 'Cafe',
        confidence: 90,
        evidence: { page: 1, x: 1, y: 1, width: 2, height: 2 },
      },
    ],
    evidenceReferenceId: ids.evidence,
    candidateHash: hash,
  });
  assert.equal(table.accepted, true);

  const missingEvidence = createDdaTableExtractionCandidateV1({
    candidateId: ids.capture,
    tenantScope: scope,
    artifactVersionId: ids.artifact,
    pageCount: 1,
    columns: ['Item'],
    cells: [{ row: 0, column: 0, text: 'Cafe', confidence: 90 }],
    evidenceReferenceId: ids.evidence,
    candidateHash: hash,
  });
  assert.equal(missingEvidence.accepted, false);

  const starter = createDdaStarterDashboardEventV1({
    eventId: ids.event,
    tenantScope: scope,
    datasetVersionId: ids.version,
    dashboardVersionId: ids.dashboard,
    templateId: 'STARTER_KPI_TABLE_V1',
    aiUsed: false,
    occurredAt: createdAt,
  });
  assert.equal(starter.accepted, true);

  const aiStarter = createDdaStarterDashboardEventV1({
    eventId: ids.event,
    tenantScope: scope,
    datasetVersionId: ids.version,
    dashboardVersionId: ids.dashboard,
    templateId: 'STARTER_KPI_TABLE_V1',
    aiUsed: true,
    occurredAt: createdAt,
  });
  assert.equal(aiStarter.accepted, false);
});

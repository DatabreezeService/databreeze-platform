/* eslint-disable @typescript-eslint/require-await -- repository doubles mirror async ports. */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import type {
  DdaDashboardAuthoringCommand,
  DdaDashboardChartProposal,
} from '@databreeze/contracts/v3';
import {
  createDashboardVersionV1,
  type DashboardVersionV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryDashboardDraftRepositoryAdapter } from '../../../src/features/dda/dashboard/adapter/in-memory-dashboard-draft-repository.adapter.js';
import { InMemoryDashboardProposalRepositoryAdapter } from '../../../src/features/dda/dashboard/adapter/in-memory-dashboard-proposal-repository.adapter.js';
import type { DashboardProposalRecordV1 } from '../../../src/features/dda/dashboard/application/dashboard-proposal-repository.port.js';
import { DashboardDraftServiceV1 } from '../../../src/features/dda/dashboard/application/dashboard-draft.service.js';
import type { DashboardDraftRepositoryPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-repository.port.js';
import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const scope = scopeResult.accepted ? scopeResult.value : (null as never);

const contextResult = createIamTenantContextV1({
  actorId: '00000000-0000-4000-8000-0000000000a1',
  tenantScope: scope,
  authorizationEpoch: 1,
  correlationId: '00000000-0000-4000-8000-0000000000c1',
  idempotencyKey: 'dda-authoring-command-test',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const ids = Object.freeze({
  dashboard: '00000000-0000-4000-8000-00000000001b',
  version: '00000000-0000-4000-8000-000000000011',
  page: '00000000-0000-4000-8000-00000000001c',
  widget: '00000000-0000-4000-8000-00000000001d',
  widgetTwo: '00000000-0000-4000-8000-00000000002d',
  plan: '00000000-0000-4000-8000-000000000010',
  materialization: '00000000-0000-4000-8000-00000000001f',
  dataset: '00000000-0000-4000-8000-000000000018',
  semantic: '00000000-0000-4000-8000-000000000019',
  metric: '00000000-0000-4000-8000-00000000001a',
  proposal: '00000000-0000-4000-8000-0000000000b1',
  option: '00000000-0000-4000-8000-0000000000b2',
});

function baseVersion(): DashboardVersionV1 {
  const created = createDashboardVersionV1({
    dashboardId: ids.dashboard,
    versionId: ids.version,
    tenantScope: scope,
    pages: [
      {
        pageId: ids.page,
        order: 1,
        title: { vi: 'Doanh thu', en: 'Sales' },
        layout: {
          desktop: [
            { widgetId: ids.widget, x: 0, y: 0, w: 6, h: 4 },
            { widgetId: ids.widgetTwo, x: 6, y: 0, w: 6, h: 4 },
          ],
          tablet: [
            { widgetId: ids.widget, x: 0, y: 0, w: 6, h: 4 },
            { widgetId: ids.widgetTwo, x: 6, y: 0, w: 6, h: 4 },
          ],
          mobile: [
            { widgetId: ids.widget, x: 0, y: 0, w: 4, h: 4 },
            { widgetId: ids.widgetTwo, x: 0, y: 4, w: 4, h: 4 },
          ],
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
        title: { vi: 'Tong doanh thu', en: 'Total sales' },
      },
      {
        widgetId: ids.widgetTwo,
        type: 'TEXT_NOTE',
        pageId: ids.page,
        binding: {
          analysisPlanVersionId: ids.plan,
          materializationDefinitionId: ids.materialization,
        },
        title: { vi: 'Ghi chú', en: 'Note' },
      },
    ],
    filters: [],
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
    canonicalHash: 'a'.repeat(64),
    createdAt: '2026-08-12T02:00:00.000Z',
  });
  if (!created.accepted) throw new Error(`invalid fixture: ${created.code}`);
  return created.value;
}

function proposal(): DdaDashboardChartProposal {
  return {
    schemaVersion: 3,
    proposalId: ids.proposal,
    dashboardId: ids.dashboard,
    parentVersionId: ids.version,
    analysisPlanVersionId: ids.plan,
    expectedRevision: 1,
    previewOnly: true,
    publishes: false,
    createdAt: '2026-08-12T02:01:00.000Z',
    summary: { vi: 'Đề xuất biểu đồ', en: 'Chart proposal' },
    options: [
      {
        optionId: ids.option,
        type: 'BAR',
        title: { vi: 'Theo khu vực', en: 'By region' },
        rationale: { vi: 'So sánh', en: 'Compare' },
        accessibilityDescription: { vi: 'Biểu đồ', en: 'Chart' },
        assumptions: [],
        binding: {
          analysisPlanVersionId: ids.plan,
          materializationDefinitionId: ids.materialization,
          dimensionIds: [],
          measureIds: [],
        },
        defaultSpan: 6,
        supportedSpans: [6, 12],
        dimensions: [],
        measures: [],
        estimate: { cpuMs: 10, memoryMb: 16 },
        evidenceBehavior: 'REQUIRED',
      },
    ],
  };
}

async function seeded() {
  const repository = new InMemoryDashboardDraftRepositoryAdapter();
  const proposals = new InMemoryDashboardProposalRepositoryAdapter();
  const version = baseVersion();
  await repository.saveVersion(version);
  await repository.saveIdentity({
    dashboardId: ids.dashboard,
    tenantScope: scope,
    title: { vi: 'Bảng điều khiển', en: 'Dashboard' },
    status: 'DRAFT',
    draftVersionId: version.versionId,
    revision: 1,
  });
  const record: DashboardProposalRecordV1 = {
    tenantScope: scope,
    actorId: context.actorId,
    proposal: proposal(),
    state: 'PROPOSED',
    createdAt: '2026-08-12T02:01:00.000Z',
  };
  await proposals.save(record);
  return {
    repository,
    proposals,
    service: new DashboardDraftServiceV1(repository, undefined, { proposalRepository: proposals }),
  };
}

function command<T extends DdaDashboardAuthoringCommand>(value: T): T {
  return value;
}

void test('[DDA-022/DDA-023] accepts a stored proposal with server-owned version and replays idempotently', async () => {
  const { service, proposals, repository } = await seeded();
  const input = command({
    schemaVersion: 3,
    commandId: '00000000-0000-4000-8000-0000000000c2',
    createdAt: '2026-08-12T02:02:00.000Z',
    kind: 'ACCEPT_PROPOSAL',
    dashboardId: ids.dashboard,
    expectedRevision: 1,
    expectedVersionId: ids.version,
    proposalId: ids.proposal,
    selectedOptionIds: [ids.option],
  });
  const first = await service.applyAuthoringCommand(context, input);
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.value.publishes, false);
  assert.notEqual(first.value.versionId, ids.version);
  assert.equal(first.value.revision, 2);
  const replay = await service.applyAuthoringCommand(context, input);
  assert.deepEqual(replay, first);
  const identity = await repository.findIdentity(scope, ids.dashboard);
  assert.equal(identity?.revision, 2);
  const accepted = await proposals.findById(scope, ids.proposal);
  assert.equal(accepted?.state, 'ACCEPTED');
});

void test('[DDA-020] authoring mutations require edit authorization, not view authorization', async () => {
  const { repository, proposals } = await seeded();
  let action: string | undefined;
  const authorization: DashboardAuthorizationPortV1 = {
    authorizeDashboardAction(input) {
      action = input.action;
      return Promise.resolve({ allowed: true, grantsDatasetAccess: false });
    },
    projectVisibleFields() {
      return Promise.resolve([]);
    },
  };
  const service = new DashboardDraftServiceV1(repository, authorization, {
    proposalRepository: proposals,
  });
  const result = await service.applyAuthoringCommand(
    context,
    command({
      schemaVersion: 3,
      commandId: '00000000-0000-4000-8000-0000000000cb',
      createdAt: '2026-08-12T02:02:30.000Z',
      kind: 'REMOVE_WIDGET',
      dashboardId: ids.dashboard,
      expectedRevision: 1,
      expectedVersionId: ids.version,
      widgetId: ids.widget,
    }),
  );
  assert.equal(result.accepted, true);
  assert.equal(action, 'EDIT');
});

void test('[DDA-022] proposal acceptance failure leaves the draft revision untouched', async () => {
  const { repository, proposals } = await seeded();
  const failingProposalRepository = {
    findById: proposals.findById.bind(proposals),
    save: proposals.save.bind(proposals),
    markAccepted: async () => false,
  };
  const service = new DashboardDraftServiceV1(repository, undefined, {
    proposalRepository: failingProposalRepository,
  });
  const result = await service.applyAuthoringCommand(
    context,
    command({
      schemaVersion: 3,
      commandId: '00000000-0000-4000-8000-0000000000cc',
      createdAt: '2026-08-12T02:02:40.000Z',
      kind: 'ACCEPT_PROPOSAL',
      dashboardId: ids.dashboard,
      expectedRevision: 1,
      expectedVersionId: ids.version,
      proposalId: ids.proposal,
      selectedOptionIds: [ids.option],
    }),
  );
  assert.deepEqual(result, { accepted: false, code: 'UNAVAILABLE' });
  assert.equal((await repository.findIdentity(scope, ids.dashboard))?.revision, 1);
});

void test('[DDA-016][DDA-024] refuses proposal acceptance when commit compensation is unavailable', async () => {
  const { repository, proposals } = await seeded();
  let commitCalls = 0;
  const failingRepository: DashboardDraftRepositoryPortV1 = {
    saveIdentity: repository.saveIdentity.bind(repository),
    findIdentity: repository.findIdentity.bind(repository),
    saveVersion: repository.saveVersion.bind(repository),
    findVersion: repository.findVersion.bind(repository),
    saveRemovedWidget: repository.saveRemovedWidget.bind(repository),
    findRemovedWidget: repository.findRemovedWidget.bind(repository),
    findCommandResult: repository.findCommandResult.bind(repository),
    commitAuthoringVersion: async () => {
      commitCalls += 1;
      throw new Error('commit failed');
    },
  };
  const proposalRepository = {
    findById: proposals.findById.bind(proposals),
    save: proposals.save.bind(proposals),
    markAccepted: proposals.markAccepted.bind(proposals),
  };

  const service = new DashboardDraftServiceV1(failingRepository, undefined, {
    proposalRepository,
  });
  const result = await service.applyAuthoringCommand(
    context,
    command({
      schemaVersion: 3,
      commandId: '00000000-0000-4000-8000-0000000000d1',
      createdAt: '2026-08-12T02:02:50.000Z',
      kind: 'ACCEPT_PROPOSAL',
      dashboardId: ids.dashboard,
      expectedRevision: 1,
      expectedVersionId: ids.version,
      proposalId: ids.proposal,
      selectedOptionIds: [ids.option],
    }),
  );

  assert.deepEqual(result, { accepted: false, code: 'UNAVAILABLE' });
  assert.equal(commitCalls, 0);
  assert.equal((await proposals.findById(scope, ids.proposal))?.state, 'PROPOSED');
  assert.equal((await repository.findIdentity(scope, ids.dashboard))?.revision, 1);
});

void test('[DDA-024] bounds SET_LAYOUT to a twelve-column grid and commits valid cells', async () => {
  const { service, repository } = await seeded();
  const invalid = await service.applyAuthoringCommand(
    context,
    command({
      schemaVersion: 3,
      commandId: '00000000-0000-4000-8000-0000000000c3',
      createdAt: '2026-08-12T02:03:00.000Z',
      kind: 'SET_LAYOUT',
      dashboardId: ids.dashboard,
      expectedRevision: 1,
      expectedVersionId: ids.version,
      breakpoint: 'desktop',
      cells: [{ widgetId: ids.widget, x: 8, y: 0, w: 5, h: 4 }],
    }),
  );
  assert.deepEqual(invalid, { accepted: false, code: 'INVALID_LAYOUT' });

  const valid = await service.applyAuthoringCommand(
    context,
    command({
      schemaVersion: 3,
      commandId: '00000000-0000-4000-8000-0000000000c4',
      createdAt: '2026-08-12T02:04:00.000Z',
      kind: 'SET_LAYOUT',
      dashboardId: ids.dashboard,
      expectedRevision: 1,
      expectedVersionId: ids.version,
      breakpoint: 'desktop',
      cells: [
        { widgetId: ids.widget, x: 6, y: 2, w: 6, h: 4 },
        { widgetId: ids.widgetTwo, x: 0, y: 2, w: 6, h: 4 },
      ],
    }),
  );
  assert.equal(valid.accepted, true);
  if (valid.accepted) {
    const version = await repository.findVersion(scope, valid.value.versionId);
    assert.equal(version?.pages[0]?.layout.desktop[0]?.x, 6);
  }
});

void test('[DDA-022] SET_LAYOUT preserves the existing target-breakpoint widget set', async () => {
  const { service, repository } = await seeded();
  const current = await repository.findVersion(scope, ids.version);
  assert.ok(current);
  if (!current) return;
  const page = current.pages[0];
  assert.ok(page);
  if (!page) return;
  await repository.saveVersion({
    ...current,
    pages: [
      {
        ...page,
        layout: {
          ...page.layout,
          mobile: page.layout.mobile.slice(0, 1),
        },
      },
    ],
  });

  const result = await service.applyAuthoringCommand(
    context,
    command({
      schemaVersion: 3,
      commandId: '00000000-0000-4000-8000-0000000000d2',
      createdAt: '2026-08-12T02:04:30.000Z',
      kind: 'SET_LAYOUT',
      dashboardId: ids.dashboard,
      expectedRevision: 1,
      expectedVersionId: ids.version,
      breakpoint: 'mobile',
      cells: [
        { widgetId: ids.widget, x: 0, y: 0, w: 4, h: 4 },
        { widgetId: ids.widgetTwo, x: 0, y: 4, w: 4, h: 4 },
      ],
    }),
  );

  assert.deepEqual(result, { accepted: false, code: 'INVALID_LAYOUT' });
});

void test('[DDA-025] remove and restore create immutable versions and preserve the removed widget', async () => {
  const { service } = await seeded();
  const removed = await service.applyAuthoringCommand(
    context,
    command({
      schemaVersion: 3,
      commandId: '00000000-0000-4000-8000-0000000000c5',
      createdAt: '2026-08-12T02:05:00.000Z',
      kind: 'REMOVE_WIDGET',
      dashboardId: ids.dashboard,
      expectedRevision: 1,
      expectedVersionId: ids.version,
      widgetId: ids.widget,
    }),
  );
  assert.equal(removed.accepted, true, JSON.stringify(removed));
  if (!removed.accepted) return;
  const restored = await service.applyAuthoringCommand(
    context,
    command({
      schemaVersion: 3,
      commandId: '00000000-0000-4000-8000-0000000000c6',
      createdAt: '2026-08-12T02:06:00.000Z',
      kind: 'RESTORE_WIDGET',
      dashboardId: ids.dashboard,
      expectedRevision: 2,
      expectedVersionId: removed.value.versionId,
      widgetId: ids.widget,
    }),
  );
  assert.equal(restored.accepted, true);
});

void test('[DDA-026] CONFIGURE_PRESENTATION is a server-created version with safe display metadata', async () => {
  const { service, repository } = await seeded();
  const configured = await service.applyAuthoringCommand(
    context,
    command({
      schemaVersion: 3,
      commandId: '00000000-0000-4000-8000-0000000000ca',
      createdAt: '2026-08-12T02:06:30.000Z',
      kind: 'CONFIGURE_PRESENTATION',
      dashboardId: ids.dashboard,
      expectedRevision: 1,
      expectedVersionId: ids.version,
      widgetId: ids.widget,
      title: { vi: 'Doanh thu thuần', en: 'Net sales' },
      display: { showTitle: true, showLegend: false, showEvidence: true },
    }),
  );
  assert.equal(configured.accepted, true);
  if (configured.accepted) {
    const version = await repository.findVersion(scope, configured.value.versionId);
    assert.equal(
      version?.widgets.find((widget) => widget.widgetId === ids.widget)?.title.en,
      'Net sales',
    );
    assert.deepEqual(
      (version as (DashboardVersionV1 & { presentation?: unknown }) | undefined)?.presentation,
      {
        showTitle: true,
        showLegend: false,
        showEvidence: true,
      },
    );
    if (!version) return;
    const { canonicalHash, ...canonicalState } = version as DashboardVersionV1 & {
      readonly presentation?: unknown;
    };
    assert.equal(
      canonicalHash,
      createHash('sha256').update(JSON.stringify(canonicalState)).digest('hex'),
    );
  }
});

void test('[DDA-026][DDA-043] rejects stale revisions, invalid selections, and untrusted publish commands', async () => {
  const { service } = await seeded();
  const stale = await service.applyAuthoringCommand(
    context,
    command({
      schemaVersion: 3,
      commandId: '00000000-0000-4000-8000-0000000000c7',
      createdAt: '2026-08-12T02:07:00.000Z',
      kind: 'REMOVE_WIDGET',
      dashboardId: ids.dashboard,
      expectedRevision: 99,
      expectedVersionId: ids.version,
      widgetId: ids.widget,
    }),
  );
  assert.deepEqual(stale, { accepted: false, code: 'REVISION_CONFLICT' });

  const invalidSelection = await service.applyAuthoringCommand(
    context,
    command({
      schemaVersion: 3,
      commandId: '00000000-0000-4000-8000-0000000000c8',
      createdAt: '2026-08-12T02:08:00.000Z',
      kind: 'ACCEPT_PROPOSAL',
      dashboardId: ids.dashboard,
      expectedRevision: 1,
      expectedVersionId: ids.version,
      proposalId: ids.proposal,
      selectedOptionIds: ['00000000-0000-4000-8000-0000000000b9'],
    }),
  );
  assert.deepEqual(invalidSelection, { accepted: false, code: 'INVALID_SELECTION' });

  const publish = await service.applyAuthoringCommand(context, {
    schemaVersion: 3,
    commandId: '00000000-0000-4000-8000-0000000000c9',
    createdAt: '2026-08-12T02:09:00.000Z',
    kind: 'PUBLISH',
    dashboardId: ids.dashboard,
    expectedRevision: 1,
    expectedVersionId: ids.version,
  } as never);
  assert.deepEqual(publish, { accepted: false, code: 'INVALID_COMMAND' });
});

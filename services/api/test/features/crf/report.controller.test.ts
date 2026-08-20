import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { createIamTenantContextV1 } from '../../../src/platform/iam-tenant-context.js';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import { InMemoryCrfReportRepositoryAdapter } from '../../../src/features/crf/adapter/in-memory-report-repository.adapter.js';
import { CrfReportController } from '../../../src/features/crf/api/report.controller.js';
import type { IamRepositoryPortV1 } from '../../../src/features/iam/application/iam-repository.port.js';
import type { IamHierarchyRepositoryPortV1 } from '../../../src/features/iam/application/hierarchy-repository.port.js';
import type { GovernedDatasetRepositoryPortV1 } from '../../../src/features/dsm/application/governed-dataset-repository.port.js';
import type { DatasetVersionRepositoryPortV1 } from '../../../src/features/dsm/application/dataset-version-repository.port.js';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('test identifier');
  return parsed.value;
}

function accepted<T>(
  result:
    | { readonly accepted: true; readonly value: T }
    | { readonly accepted: false; readonly code: unknown },
): T {
  if (!result.accepted) throw new Error('test context');
  return result.value;
}

const organizationId = stable('00000000-0000-4000-8000-000000000911');
const workspaceId = stable('00000000-0000-4000-8000-000000000912');
const actorId = stable('00000000-0000-4000-8000-000000000913');
const clientId = stable('00000000-0000-4000-8000-000000000914');
const datasetId = stable('00000000-0000-4000-8000-000000000915');
const datasetVersionId = stable('00000000-0000-4000-8000-000000000916');
const scope = { scopeType: 'workspace' as const, organizationId, workspaceId };
const context = accepted(
  createIamTenantContextV1({
    tenantScope: scope,
    actorId,
    correlationId: stable('00000000-0000-4000-8000-000000000917'),
    idempotencyKey: 'crf-test',
    authorizationEpoch: 1,
    mfaReenrollmentRequired: false,
  }),
);

const governed: GovernedDatasetRepositoryPortV1 = {
  find: async () => ({
    schemaVersion: 1,
    datasetId,
    versionId: datasetVersionId,
    tenantScope: scope,
    name: 'Sales',
    fields: [],
    status: 'PUBLISHED',
    createdAt: '2026-08-18T00:00:00.000Z' as never,
    canonicalHash: 'a'.repeat(64),
  }),
  list: async () => [],
  listPublished: async () => [],
  save: async () => undefined,
  withTransaction: async (_context, work) =>
    work({
      find: async () => undefined,
      list: async () => [],
      listPublished: async () => [],
      save: async () => undefined,
    }),
};

const versions: DatasetVersionRepositoryPortV1 = {
  find: async () => ({
    schemaVersion: 1,
    datasetId,
    versionId: datasetVersionId,
    tenantScope: scope,
    inputArtifactVersionIds: [],
    schemaVersionId: stable('00000000-0000-4000-8000-000000000918'),
    mappingVersionId: stable('00000000-0000-4000-8000-000000000919'),
    ruleSetVersionId: stable('00000000-0000-4000-8000-000000000920'),
    engineBuild: 'local',
    contentFingerprint: 'b'.repeat(64),
    rowCount: 10,
    qualityState: 'PASS',
    lineageManifestHash: 'c'.repeat(64),
  }),
  list: async () => [],
  save: async () => undefined,
  withTransaction: async (_context, work) =>
    work({
      find: async () => undefined,
      list: async () => [],
      save: async () => undefined,
    }),
};

function controller(
  roleId = 'owner',
  projectKind: 'CLIENT' | 'INTERNAL' = 'CLIENT',
  projectOrganizationId = organizationId,
) {
  const iam: IamRepositoryPortV1 = {
    findMembership: async () => ({
      id: actorId,
      principalId: actorId,
      scope,
      roleId,
      status: 'ACTIVE' as const,
      revision: 1,
    }),
    listMemberships: async () => [],
    saveMembership: async () => undefined,
    withTransaction: async (_context, work) =>
      work({
        findMembership: async () => undefined,
        listMemberships: async () => [],
        saveMembership: async () => undefined,
      }),
  };
  const hierarchy = {
    findProject: async () => ({
      schemaVersion: 1 as const,
      id: clientId,
      organizationId: projectOrganizationId,
      workspaceId,
      kind: projectKind,
      name: 'Client project',
      status: 'ACTIVE' as const,
      createdAt: '2026-08-18T00:00:00.000Z' as never,
    }),
  } as unknown as IamHierarchyRepositoryPortV1;
  return new CrfReportController(
    new InMemoryCrfReportRepositoryAdapter(),
    governed,
    versions,
    { resolve: async () => context },
    iam,
    hierarchy,
  );
}

function command() {
  return {
    schemaVersion: 4,
    name: 'Báo cáo doanh thu tháng',
    clientId,
    period: '2026-08',
    datasetId,
    datasetVersionId,
    supportedFormats: ['WEB'],
  };
}

void test('[CRF-001/CRF-020] create is server-scoped and idempotent', async () => {
  const target = controller();
  const first = await target.create({ body: command() }, 'crf-idempotency-1', command());
  const second = await target.create({ body: command() }, 'crf-idempotency-1', command());
  assert.equal(first.report.reportId, second.report.reportId);
  const list = await target.list({ query: {} });
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0]?.datasetVersionId, datasetVersionId);
});

void test('[CRF-001] unknown authority fields are rejected before persistence', async () => {
  await assert.rejects(
    () =>
      controller().create({ body: command() }, 'crf-idempotency-2', {
        ...command(),
        tenantScope: scope,
      }),
    BadRequestException,
  );
});

void test('[CRF-001] report creation requires an active IAM client project', async () => {
  await assert.rejects(
    () =>
      controller('owner', 'INTERNAL').create({ body: command() }, 'crf-idempotency-3', command()),
    ForbiddenException,
  );
});

void test('[CRF-001] report creation rejects a client outside the current tenant scope', async () => {
  await assert.rejects(
    () =>
      controller('owner', 'CLIENT', stable('00000000-0000-4000-8000-000000000999')).create(
        { body: command() },
        'crf-idempotency-4',
        command(),
      ),
    ForbiddenException,
  );
});

void test('[CRF-001] report reads are permission-gated', async () => {
  await assert.rejects(() => controller('unknown-role').list({ query: {} }), ForbiddenException);
});

void test('[CRF-001] missing report does not enumerate another scope', async () => {
  await assert.rejects(
    () => controller().get({}, '00000000-0000-4000-8000-000000000999'),
    NotFoundException,
  );
});

void test('[CRF-001] read routes reject authority smuggling in request params', async () => {
  await assert.rejects(
    () =>
      controller().get(
        { params: { organizationId: organizationId } },
        '00000000-0000-4000-8000-000000000999',
      ),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      controller().run(
        { params: { workspaceId: workspaceId } },
        '00000000-0000-4000-8000-000000000999',
        '00000000-0000-4000-8000-000000000998',
      ),
    BadRequestException,
  );
});

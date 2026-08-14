import assert from 'node:assert/strict';
import test from 'node:test';

import { createGovernedDatasetDefinitionV1 } from '@databreeze/domain/dataset-governance/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import { AppModule } from '../../src/app.module.js';
import { IamAgentGrantDatasetTargetValidationAdapter } from '../../src/features/dsm/adapter/iam-agent-grant-dataset-target-validation.adapter.js';
import { InMemoryGovernedDatasetRepositoryAdapter } from '../../src/features/dsm/adapter/in-memory-governed-dataset-repository.adapter.js';
import { DsmModule } from '../../src/features/dsm/dsm.module.js';
import { GOVERNED_DATASET_REPOSITORY_PORT } from '../../src/features/dsm/application/governed-dataset-repository.port.js';
import {
  GOVERNED_DATASET_AUTHORIZATION_PORT,
  type GovernedDatasetAuthorizationPortV1,
} from '../../src/features/dsm/application/governed-dataset-authorization.port.js';
import { InMemoryAgentGrantRepositoryAdapter } from '../../src/features/iam/adapter/in-memory-agent-grant-repository.adapter.js';
import { InMemoryIamRepositoryAdapter } from '../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { PrismaAgentGrantRepositoryAdapter } from '../../src/features/iam/adapter/prisma-agent-grant-repository.adapter.js';
import {
  IAM_AGENT_GRANT_SERVICE,
  type AgentGrantService,
} from '../../src/features/iam/application/agent-grant.service.js';
import { AGENT_GRANT_REPOSITORY_PORT } from '../../src/features/iam/application/agent-grant-repository.port.js';
import type { IamMembershipRecordV1 } from '../../src/features/iam/application/iam-repository.port.js';
import { IamModule } from '../../src/features/iam/iam.module.js';
import { PrismaGovernedDatasetRepositoryAdapter } from '../../src/features/dsm/adapter/prisma-governed-dataset-repository.adapter.js';
import { REQUEST_TENANT_CONTEXT } from '../../src/platform/http/request-tenant-context.port.js';
import { SessionRequestTenantContextAdapter } from '../../src/platform/http/session-tenant-context.adapter.js';
import { createIamTenantContextV1 } from '../../src/features/iam/application/tenant-context.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000b01',
  workspace: '00000000-0000-4000-8000-000000000b02',
  siblingWorkspace: '00000000-0000-4000-8000-000000000b03',
  owner: '00000000-0000-4000-8000-000000000b04',
  editor: '00000000-0000-4000-8000-000000000b05',
  currentDataset: '00000000-0000-4000-8000-000000000b06',
  foreignDataset: '00000000-0000-4000-8000-000000000b07',
  retiredDataset: '00000000-0000-4000-8000-000000000b08',
  currentVersion: '00000000-0000-4000-8000-000000000b09',
  foreignVersion: '00000000-0000-4000-8000-000000000b0a',
  retiredVersion: '00000000-0000-4000-8000-000000000b0b',
  correlation: '00000000-0000-4000-8000-000000000b0c',
};

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid root-composition fixture identifier');
  return parsed.value;
}

function context(
  actorId = ids.owner,
  key = 'root-composition',
  epoch = 1,
  workspaceId = ids.workspace,
) {
  const parsed = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(workspaceId),
    },
    actorId: stable(actorId),
    correlationId: stable(ids.correlation),
    idempotencyKey: key,
    authorizationEpoch: 7,
    workspaceAuthorizationEpoch: epoch,
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid root-composition fixture context');
  return parsed.value;
}

function membership(id: string, principalId: string, roleId: string): IamMembershipRecordV1 {
  return {
    id: stable(id),
    principalId: stable(principalId),
    scope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
    },
    roleId,
    status: 'ACTIVE',
    revision: 1,
  };
}

function definition(
  datasetId: string,
  versionId: string,
  workspaceId: string,
  status: 'PUBLISHED' | 'RETIRED',
) {
  const parsed = createGovernedDatasetDefinitionV1({
    datasetId,
    versionId,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organization,
      workspaceId,
    },
    name: 'Root dataset',
    fields: [
      {
        fieldId: '00000000-0000-4000-8000-000000000b0d',
        name: 'value',
        type: 'TEXT',
        nullable: true,
      },
    ],
    status,
    createdAt: '2026-08-13T00:00:00.000Z',
    publishedAt: status === 'PUBLISHED' ? '2026-08-13T00:01:00.000Z' : undefined,
    canonicalHash: 'b'.repeat(64),
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid root-composition fixture definition');
  return parsed.value;
}

function imported(root: ReturnType<typeof AppModule.register>, moduleType: unknown) {
  const module = root.imports?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'module' in candidate &&
      candidate.module === moduleType,
  );
  assert.ok(module);
  return module as { readonly providers?: readonly unknown[] };
}

function provider(module: { readonly providers?: readonly unknown[] }, token: unknown): unknown {
  const providers = module.providers ?? [];
  const match = providers.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === token,
  );
  return match && typeof match === 'object' && 'useValue' in match ? match.useValue : undefined;
}

void test('[IAM-024, DSM-018] root shares one canonical DSM catalog adapter with IAM restrictions', async () => {
  const iamRepository = new InMemoryIamRepositoryAdapter();
  iamRepository.seed([
    membership(ids.owner, ids.owner, 'owner'),
    membership(ids.editor, ids.editor, 'analyst'),
  ]);
  const grants = new InMemoryAgentGrantRepositoryAdapter();
  const catalog = new InMemoryGovernedDatasetRepositoryAdapter();
  await catalog.save(
    context(),
    definition(ids.currentDataset, ids.currentVersion, ids.workspace, 'PUBLISHED'),
  );
  await catalog.save(
    context(),
    definition(ids.retiredDataset, ids.retiredVersion, ids.workspace, 'RETIRED'),
  );
  await catalog.save(
    context(ids.owner, 'foreign-seed', 1, ids.siblingWorkspace),
    definition(ids.foreignDataset, ids.foreignVersion, ids.siblingWorkspace, 'PUBLISHED'),
  );

  const root = AppModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    iamRepository,
    agentGrantRepository: grants,
    governedDatasetRepository: catalog,
  });
  const iam = imported(root, IamModule);
  const dsm = imported(root, DsmModule);
  const service = provider(iam, IAM_AGENT_GRANT_SERVICE) as AgentGrantService;

  assert.ok(service);
  assert.equal(provider(dsm, GOVERNED_DATASET_REPOSITORY_PORT), catalog);
  assert.ok(
    (service as unknown as { datasetTargets: unknown }).datasetTargets instanceof
      IamAgentGrantDatasetTargetValidationAdapter,
  );

  const updated = await service.setDatasetRestrictions(context(ids.owner, 'root-set'), {
    memberId: ids.editor,
    deniedDatasetIds: [ids.currentDataset],
    expectedRevision: 0,
  });
  assert.deepEqual(updated, {
    accepted: true,
    value: {
      memberId: stable(ids.editor),
      deniedDatasetIds: [stable(ids.currentDataset)],
      revision: 1,
    },
  });
  const reloaded = AppModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    iamRepository,
    agentGrantRepository: grants,
    governedDatasetRepository: catalog,
  });
  const reloadedIam = imported(reloaded, IamModule);
  const reloadedService = provider(reloadedIam, IAM_AGENT_GRANT_SERVICE) as AgentGrantService;
  assert.deepEqual(
    await reloadedService.getDatasetRestrictions(context(ids.owner, 'root-get', 2), {
      memberId: ids.editor,
    }),
    updated,
  );
  assert.deepEqual(
    await service.setDatasetRestrictions(context(ids.owner, 'root-foreign'), {
      memberId: ids.editor,
      deniedDatasetIds: [ids.foreignDataset],
      expectedRevision: 1,
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );
  assert.deepEqual(
    await service.setDatasetRestrictions(context(ids.owner, 'root-retired'), {
      memberId: ids.editor,
      deniedDatasetIds: [ids.retiredDataset],
      expectedRevision: 1,
    }),
    { accepted: false, code: 'NOT_FOUND' },
  );
});

void test('[IAM-024, DSM-018] production-shaped root selects durable IAM, DSM, and live-session adapters once', () => {
  const database = {} as never;
  const root = AppModule.register({
    runtimeMode: 'production',
    allowInMemoryAdapters: false,
    iamDatabase: database,
    agentGrantDatabase: database,
    governedDatasetDatabase: database,
    sessionDatabase: database,
    ddaDatabase: database,
    approvalDatabase: database,
  });
  const iam = imported(root, IamModule);
  const dsm = imported(root, DsmModule);
  const service = provider(iam, IAM_AGENT_GRANT_SERVICE) as AgentGrantService;

  assert.ok(
    provider(iam, AGENT_GRANT_REPOSITORY_PORT) instanceof PrismaAgentGrantRepositoryAdapter,
  );
  assert.ok(
    provider(dsm, GOVERNED_DATASET_REPOSITORY_PORT) instanceof
      PrismaGovernedDatasetRepositoryAdapter,
  );
  assert.ok(service);
  assert.ok(
    (service as unknown as { datasetTargets: unknown }).datasetTargets instanceof
      IamAgentGrantDatasetTargetValidationAdapter,
  );
  assert.ok(provider(iam, REQUEST_TENANT_CONTEXT) instanceof SessionRequestTenantContextAdapter);
});

void test('[IAM-024] root session context is stale immediately after restriction mutation and re-resolves current epoch', async () => {
  const iamRepository = new InMemoryIamRepositoryAdapter();
  iamRepository.seed([
    membership(ids.owner, ids.owner, 'owner'),
    membership(ids.editor, ids.editor, 'analyst'),
  ]);
  const grants = new InMemoryAgentGrantRepositoryAdapter();
  const catalog = new InMemoryGovernedDatasetRepositoryAdapter();
  await catalog.save(
    context(),
    definition(ids.currentDataset, ids.currentVersion, ids.workspace, 'PUBLISHED'),
  );
  let currentPrincipal = {
    userId: ids.owner,
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    securityEpoch: 7,
    mfaRequired: false,
    mfaReenrollmentRequired: false,
  };
  const root = AppModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
    iamRepository,
    agentGrantRepository: grants,
    governedDatasetRepository: catalog,
    sessions: {
      findPrincipalByAccessToken: () => Promise.resolve(currentPrincipal),
    } as never,
  });
  const iam = imported(root, IamModule);
  const dsm = imported(root, DsmModule);
  const service = provider(iam, IAM_AGENT_GRANT_SERVICE) as AgentGrantService;
  const requestContext = provider(
    iam,
    REQUEST_TENANT_CONTEXT,
  ) as SessionRequestTenantContextAdapter;
  const governedAuthorization = provider(
    dsm,
    GOVERNED_DATASET_AUTHORIZATION_PORT,
  ) as GovernedDatasetAuthorizationPortV1;

  const before = await requestContext.resolve({
    method: 'GET',
    headers: { authorization: 'Bearer opaque-access-token-123456789' },
  });
  assert.equal(before.workspaceAuthorizationEpoch, 1);
  const changed = await service.setDatasetRestrictions(context(ids.owner, 'root-session-change'), {
    memberId: ids.editor,
    deniedDatasetIds: [ids.currentDataset],
    expectedRevision: 0,
  });
  assert.equal(changed.accepted, true);
  const stale = await service.authorize({
    context: before,
    memberId: ids.editor,
    requestedLevel: 'ANALYZE',
    resourceIds: [],
  });
  assert.deepEqual(stale, { accepted: false, code: 'STALE_AUTHORIZATION' });

  const current = await requestContext.resolve({
    method: 'GET',
    headers: { authorization: 'Bearer opaque-access-token-123456789' },
  });
  const cleared = await service.setDatasetRestrictions(
    context(ids.owner, 'root-session-clear', 2),
    {
      memberId: ids.editor,
      deniedDatasetIds: [],
      expectedRevision: 1,
    },
  );
  assert.equal(cleared.accepted, true);
  assert.deepEqual(
    await governedAuthorization.authorize(current, {
      action: 'READ_VERSION',
      datasetId: stable(ids.currentDataset),
    }),
    { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' },
  );

  currentPrincipal = { ...currentPrincipal };
  const after = await requestContext.resolve({
    method: 'GET',
    headers: { authorization: 'Bearer opaque-access-token-123456789' },
  });
  assert.equal(after.authorizationEpoch, 7);
  assert.equal(after.workspaceAuthorizationEpoch, 3);
  const fresh = await service.authorize({
    context: after,
    memberId: ids.editor,
    requestedLevel: 'ANALYZE',
    resourceIds: [],
  });
  assert.equal(fresh.accepted, true);
});

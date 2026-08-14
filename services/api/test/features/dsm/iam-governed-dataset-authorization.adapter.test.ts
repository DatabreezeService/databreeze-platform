import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryAgentGrantRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-agent-grant-repository.adapter.js';
import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { AccessPresetService } from '../../../src/features/iam/application/access-preset.service.js';
import type {
  IamMembershipRecordV1,
  IamRepositoryPortV1,
} from '../../../src/features/iam/application/iam-repository.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { IamGovernedDatasetAuthorizationAdapter } from '../../../src/features/dsm/adapter/iam-governed-dataset-authorization.adapter.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000a01',
  workspace: '00000000-0000-4000-8000-000000000a02',
  siblingWorkspace: '00000000-0000-4000-8000-000000000a03',
  project: '00000000-0000-4000-8000-000000000a04',
  siblingProject: '00000000-0000-4000-8000-000000000a05',
  owner: '00000000-0000-4000-8000-000000000a06',
  editor: '00000000-0000-4000-8000-000000000a07',
  viewer: '00000000-0000-4000-8000-000000000a08',
  projectActor: '00000000-0000-4000-8000-000000000a09',
  dataset: '00000000-0000-4000-8000-000000000a0a',
  restrictedDataset: '00000000-0000-4000-8000-000000000a0b',
  correlation: '00000000-0000-4000-8000-000000000a0c',
};

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid IAM adapter fixture identifier');
  return parsed.value;
}

function workspaceContext(actorId: string, key: string, workspaceId = ids.workspace) {
  const result = createIamTenantContextV1({
    actorId: stable(actorId),
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(workspaceId),
    },
    authorizationEpoch: 1,
    correlationId: stable(ids.correlation),
    idempotencyKey: key,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid IAM adapter fixture context');
  return result.value;
}

function projectContext(actorId: string, key: string, projectId = ids.project) {
  const result = createIamTenantContextV1({
    actorId: stable(actorId),
    tenantScope: {
      scopeType: 'project',
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      projectId: stable(projectId),
    },
    authorizationEpoch: 1,
    correlationId: stable(ids.correlation),
    idempotencyKey: key,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid IAM adapter fixture context');
  return result.value;
}

function membership(
  actorId: string,
  roleId: string,
  status: IamMembershipRecordV1['status'] = 'ACTIVE',
  scope: IamMembershipRecordV1['scope'] = {
    scopeType: 'workspace',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
  },
): IamMembershipRecordV1 {
  return {
    id: stable(actorId),
    principalId: stable(actorId),
    scope,
    roleId,
    status,
    revision: 1,
  };
}

function memberships(): InMemoryIamRepositoryAdapter {
  const repository = new InMemoryIamRepositoryAdapter();
  repository.seed([
    membership(ids.owner, 'owner'),
    membership(ids.editor, 'analyst'),
    membership(ids.viewer, 'viewer'),
    membership(ids.projectActor, 'viewer', 'ACTIVE', {
      scopeType: 'project',
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      projectId: stable(ids.project),
    }),
  ]);
  return repository;
}

function adapter(
  iam: IamRepositoryPortV1 = memberships(),
  grants = new InMemoryAgentGrantRepositoryAdapter(),
) {
  return {
    authorization: new IamGovernedDatasetAuthorizationAdapter(
      iam,
      new AccessPresetService(),
      grants,
    ),
    iam,
    grants,
  };
}

void test('[IAM-002, IAM-025, DSM-018] IAM adapter uses fresh presets: Viewer reads only, Editor and Owner mutate', async () => {
  const { authorization } = adapter();
  assert.deepEqual(
    await authorization.authorize(workspaceContext(ids.viewer, 'viewer-read'), {
      action: 'READ_VERSION',
      datasetId: stable(ids.dataset),
    }),
    { accepted: true, value: true },
  );
  assert.deepEqual(
    await authorization.authorize(workspaceContext(ids.viewer, 'viewer-create'), {
      action: 'CREATE_DRAFT',
      datasetId: stable(ids.dataset),
      versionId: stable(ids.dataset),
    }),
    { accepted: false, code: 'ACTION_DENIED' },
  );
  for (const actorId of [ids.editor, ids.owner]) {
    assert.deepEqual(
      await authorization.authorize(workspaceContext(actorId, `${actorId}-publish`), {
        action: 'PUBLISH',
        datasetId: stable(ids.dataset),
        versionId: stable(ids.dataset),
      }),
      { accepted: true, value: true },
    );
  }
});

void test('[IAM-002, DSM-018] organization membership inherits into its workspace and project scopes', async () => {
  const organizationMembershipIam = new InMemoryIamRepositoryAdapter();
  organizationMembershipIam.seed([
    membership(ids.owner, 'owner', 'ACTIVE', {
      scopeType: 'organization',
      organizationId: stable(ids.organization),
    }),
  ]);
  const { authorization } = adapter(organizationMembershipIam);

  assert.deepEqual(
    await authorization.authorize(workspaceContext(ids.owner, 'org-owner-workspace'), {
      action: 'READ_INDEX',
    }),
    { accepted: true, value: true },
  );
  assert.deepEqual(
    await authorization.authorize(projectContext(ids.owner, 'org-owner-project'), {
      action: 'READ_VERSION',
      datasetId: stable(ids.dataset),
    }),
    { accepted: true, value: true },
  );
});

void test('[IAM-009, IAM-019, DSM-018] IAM adapter defaults to all workspace datasets and applies current restrictions', async () => {
  const { authorization, grants } = adapter();
  const timestamp = parseStrictUtcTimestampV1('2026-08-13T00:00:00.000Z');
  assert.equal(timestamp.accepted, true);
  if (!timestamp.accepted) throw new Error('invalid restriction timestamp');
  await grants.saveDatasetRestrictions(
    workspaceContext(ids.owner, 'restrict-viewer'),
    {
      memberId: stable(ids.viewer),
      deniedDatasetIds: [stable(ids.restrictedDataset)],
      revision: 1,
      updatedAt: timestamp.value,
    },
    undefined,
  );
  assert.deepEqual(
    await authorization.authorize(workspaceContext(ids.viewer, 'restricted'), {
      action: 'READ_VERSION',
      datasetId: stable(ids.restrictedDataset),
    }),
    { accepted: false, code: 'DATASET_RESTRICTED' },
  );
  assert.deepEqual(
    await authorization.authorize(workspaceContext(ids.viewer, 'unrestricted'), {
      action: 'READ_VERSION',
      datasetId: stable(ids.dataset),
    }),
    { accepted: true, value: true },
  );
});

void test('[IAM-008, IAM-019] IAM adapter denies revoked actors and cross-project membership', async () => {
  const revokedIam = new InMemoryIamRepositoryAdapter();
  revokedIam.seed([membership(ids.viewer, 'viewer', 'REMOVED')]);
  const revoked = adapter(revokedIam).authorization;
  assert.deepEqual(
    await revoked.authorize(workspaceContext(ids.viewer, 'revoked'), {
      action: 'READ_VERSION',
      datasetId: stable(ids.dataset),
    }),
    { accepted: false, code: 'MEMBERSHIP_NOT_FOUND' },
  );

  const crossProject = adapter().authorization;
  assert.deepEqual(
    await crossProject.authorize(
      projectContext(ids.projectActor, 'sibling-project', ids.siblingProject),
      {
        action: 'READ_VERSION',
        datasetId: stable(ids.dataset),
      },
    ),
    { accepted: false, code: 'MEMBERSHIP_NOT_FOUND' },
  );
  assert.deepEqual(
    await crossProject.authorize(projectContext(ids.projectActor, 'exact-project'), {
      action: 'READ_VERSION',
      datasetId: stable(ids.dataset),
    }),
    { accepted: true, value: true },
  );
});

void test('[IAM-002, DSM-018] IAM adapter maps IAM outages to unavailable authority', async () => {
  const unavailableIam = {
    findMembership: async () => {
      await Promise.resolve();
      throw new Error('IAM_DOWN');
    },
  } as unknown as IamRepositoryPortV1;
  const { authorization } = adapter(unavailableIam);
  assert.deepEqual(
    await authorization.authorize(workspaceContext(ids.viewer, 'iam-outage'), {
      action: 'READ_INDEX',
    }),
    { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' },
  );
});

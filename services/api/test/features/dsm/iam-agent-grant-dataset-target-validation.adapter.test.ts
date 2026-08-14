import assert from 'node:assert/strict';
import test from 'node:test';

import { createGovernedDatasetDefinitionV1 } from '@databreeze/domain/dataset-governance/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import { IamAgentGrantDatasetTargetValidationAdapter } from '../../../src/features/dsm/adapter/iam-agent-grant-dataset-target-validation.adapter.js';
import { InMemoryGovernedDatasetRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-governed-dataset-repository.adapter.js';
import type { GovernedDatasetRepositoryPortV1 } from '../../../src/features/dsm/application/governed-dataset-repository.port.js';
import {
  createIamTenantContextV1,
  type IamTenantContextV1,
} from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000a01',
  workspace: '00000000-0000-4000-8000-000000000a02',
  siblingWorkspace: '00000000-0000-4000-8000-000000000a03',
  currentDataset: '00000000-0000-4000-8000-000000000a04',
  foreignDataset: '00000000-0000-4000-8000-000000000a05',
  retiredDataset: '00000000-0000-4000-8000-000000000a06',
  currentVersion: '00000000-0000-4000-8000-000000000a07',
  foreignVersion: '00000000-0000-4000-8000-000000000a08',
  retiredVersion: '00000000-0000-4000-8000-000000000a09',
  actor: '00000000-0000-4000-8000-000000000a0a',
  correlation: '00000000-0000-4000-8000-000000000a0b',
};

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid target-validation fixture identifier');
  return parsed.value;
}

function context(
  workspaceId = ids.workspace,
  idempotencyKey = 'target-validation',
): IamTenantContextV1 {
  const parsed = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(workspaceId),
    },
    actorId: stable(ids.actor),
    correlationId: stable(ids.correlation),
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid target-validation fixture context');
  return parsed.value;
}

function definition(
  datasetId: string,
  versionId: string,
  workspaceId: string,
  status: 'PUBLISHED' | 'RETIRED',
) {
  const created = createGovernedDatasetDefinitionV1({
    datasetId,
    versionId,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organization,
      workspaceId,
    },
    name: 'Target dataset',
    fields: [
      {
        fieldId: '00000000-0000-4000-8000-000000000a0c',
        name: 'amount',
        type: 'DECIMAL',
        nullable: true,
      },
    ],
    status,
    createdAt: '2026-08-13T00:00:00.000Z',
    publishedAt: status === 'PUBLISHED' ? '2026-08-13T00:01:00.000Z' : undefined,
    canonicalHash: 'a'.repeat(64),
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('invalid target-validation fixture definition');
  return created.value;
}

void test('[IAM-024, DSM-018] target validation accepts only current published datasets in the exact workspace', async () => {
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
    context(ids.siblingWorkspace),
    definition(ids.foreignDataset, ids.foreignVersion, ids.siblingWorkspace, 'PUBLISHED'),
  );

  const validator = new IamAgentGrantDatasetTargetValidationAdapter(catalog);
  assert.deepEqual(await validator.validate(context(), [stable(ids.currentDataset)]), {
    accepted: true,
  });
  assert.deepEqual(
    await validator.validate(context('00000000-0000-4000-8000-000000000a02', 'foreign-id'), [
      stable(ids.foreignDataset),
    ]),
    {
      accepted: false,
      code: 'NOT_FOUND',
    },
  );
  assert.deepEqual(await validator.validate(context(), [stable(ids.retiredDataset)]), {
    accepted: false,
    code: 'NOT_FOUND',
  });
  assert.deepEqual(
    await validator.validate(context(), [stable(ids.currentDataset), stable(ids.foreignDataset)]),
    {
      accepted: false,
      code: 'NOT_FOUND',
    },
  );
});

void test('[IAM-024, DSM-018] target validation maps catalog outages to unavailable without leaking dataset existence', async () => {
  const unavailableCatalog = {
    withTransaction: async (
      _context: IamTenantContextV1,
      work: (transaction: { readonly list: () => Promise<never> }) => Promise<unknown>,
    ) =>
      work({
        list: () => Promise.reject(new Error('DSM_DATABASE_UNAVAILABLE')),
      }),
  } as unknown as GovernedDatasetRepositoryPortV1;
  const validator = new IamAgentGrantDatasetTargetValidationAdapter(unavailableCatalog);

  assert.deepEqual(await validator.validate(context(), [stable(ids.currentDataset)]), {
    accepted: false,
    code: 'UNAVAILABLE',
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryEtlProposalRepositoryAdapter } from '../../../src/features/dda/etl/adapter/in-memory-etl-proposal-repository.adapter.js';
import { PrismaEtlProposalRepositoryAdapter } from '../../../src/features/dda/etl/adapter/prisma-etl-proposal-repository.adapter.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
const otherScopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000101',
  workspaceId: '00000000-0000-4000-8000-000000000102',
  projectId: '00000000-0000-4000-8000-000000000103',
});
assert.equal(scopeResult.accepted, true);
assert.equal(otherScopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);
const otherScope = otherScopeResult.accepted ? otherScopeResult.value : (null as never);
if (tenantScope.scopeType !== 'project' || otherScope.scopeType !== 'project') {
  throw new Error('project scope fixture required');
}
const proposalId = '00000000-0000-4000-8000-000000000201';

function record() {
  return {
    proposalId,
    revision: 1,
    state: 'READY_FOR_ACCEPTANCE' as const,
    blockingReasons: [],
    tenantScope,
    plan: { tenantScope },
    review: {},
    createdAt: '2026-08-13T00:00:00.000Z',
  } as never;
}

void test('[IAM-019] in-memory ETL proposal lookup requires a visible trusted scope', async () => {
  const repository = new InMemoryEtlProposalRepositoryAdapter();
  await repository.save(record());
  assert.equal((await repository.findById(proposalId, tenantScope))?.proposalId, proposalId);
  assert.equal(await repository.findById(proposalId, otherScope), undefined);
});

void test('[IAM-019] Prisma ETL proposal lookup pushes scope predicates and hides other tenants', async () => {
  const rows = new Map<string, Record<string, unknown>>();
  const whereCalls: unknown[] = [];
  const client = {
    etlProposalRecord: {
      upsert(input: { create: Record<string, unknown> }) {
        const row = {
          ...input.create,
          updatedAt: new Date('2026-08-13T00:00:00.000Z'),
        };
        rows.set(String(input.create['id']), row);
        return Promise.resolve(row);
      },
      findFirst(input: {
        where: {
          id: string;
          organizationId?: string;
          workspaceId?: string;
          projectId?: string;
        };
      }) {
        whereCalls.push(input.where);
        const row = rows.get(input.where['id']);
        if (!row) return Promise.resolve(null);
        if (
          input.where.organizationId !== undefined &&
          input.where.organizationId !== row['organizationId']
        )
          return Promise.resolve(null);
        if (input.where.workspaceId !== undefined && input.where.workspaceId !== row['workspaceId'])
          return Promise.resolve(null);
        if (input.where.projectId !== undefined && input.where.projectId !== row['projectId'])
          return Promise.resolve(null);
        return Promise.resolve(row);
      },
    },
  };
  const repository = new PrismaEtlProposalRepositoryAdapter(client as never);
  await repository.save(record());
  assert.equal((await repository.findById(proposalId, tenantScope))?.proposalId, proposalId);
  assert.equal(await repository.findById(proposalId, otherScope), undefined);
  assert.deepEqual(whereCalls.at(-1), {
    id: proposalId,
    organizationId: otherScope.organizationId,
    workspaceId: otherScope.workspaceId,
    projectId: otherScope.projectId,
  });
});

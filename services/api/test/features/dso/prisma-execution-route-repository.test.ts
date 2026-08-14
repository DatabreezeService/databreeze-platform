import assert from 'node:assert/strict';
import test from 'node:test';

import { createDataModePolicyVersionV1 } from '@databreeze/domain/data-mode/v1';
import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaExecutionRouteRepositoryAdapter,
  type ExecutionRouteDatabaseClientV1,
} from '../../../src/features/dso/adapter/prisma-execution-route-repository.adapter.js';
import { createExecutionRouteDecisionV1 } from '../../../src/features/dso/application/execution-route-decision.js';

const organizationId = '40000000-0000-4000-8000-000000000001';
const workspaceId = '40000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '40000000-0000-4000-8000-000000000003';
const projectId = '40000000-0000-4000-8000-000000000004';
const decisionId = '40000000-0000-4000-8000-000000000005';

function tenant(workspace = workspaceId) {
  const parsed = parseTenantScopeV1({
    scopeType: 'project',
    organizationId,
    workspaceId: workspace,
    projectId,
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid tenant');
  return parsed.value;
}

function decision() {
  const policy = createDataModePolicyVersionV1({
    policyId: '40000000-0000-4000-8000-000000000006',
    policyVersionId: '40000000-0000-4000-8000-000000000007',
    organizationId,
    workspaceId,
    revision: 3,
    mode: 'HYBRID',
    allowedPayloadClasses: {
      PUBLIC: ['CONTROL_METADATA'],
      INTERNAL: ['CONTROL_METADATA'],
      CONFIDENTIAL: [],
      RESTRICTED: [],
    },
    allowedPlacementKinds: ['CLOUD'],
    allowedExecutorClasses: ['CLOUD'],
    allowedDestinationClasses: ['WEB'],
    canonicalHash: 'a'.repeat(64),
    publishedAt: '2026-08-14T07:00:00.000Z',
  });
  assert.equal(policy.accepted, true);
  if (!policy.accepted) throw new Error('invalid policy');
  const parsed = createExecutionRouteDecisionV1({
    routeId: '40000000-0000-4000-8000-000000000008',
    decisionId,
    revision: 1,
    subject: {
      tenantScope: tenant(),
      input: {
        artifactVersionId: '40000000-0000-4000-8000-000000000009',
        artifactVersionHash: 'b'.repeat(64),
        placementId: '40000000-0000-4000-8000-000000000010',
        placementHash: 'c'.repeat(64),
        dataMode: 'Hybrid',
        classification: 'INTERNAL',
        payloadClass: 'CONTROL_METADATA',
        placementKind: 'CLOUD',
        placementAvailable: true,
      },
      action: { type: 'metadata.digest', version: 1, requiredCapabilities: ['metadata.read'] },
      target: {
        target: 'CLOUD',
        executorClass: 'CLOUD',
        grantedCapabilities: ['metadata.read'],
      },
      narrowingConstraints: [],
      authorizationEpoch: 9,
    },
    policy: policy.value,
    createdAt: '2026-08-14T08:00:00.000Z',
    expiresAt: '2026-08-14T08:10:00.000Z',
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid route');
  return parsed.value;
}

function client() {
  const rows: Record<string, unknown>[] = [];
  const database = {
    executionRouteDecisionRecord: {
      create({ data }: { readonly data: Record<string, unknown> }) {
        rows.push({ ...data });
        return Promise.resolve({ ...data });
      },
      findFirst({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
        return Promise.resolve(
          rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ??
            null,
        );
      },
    },
  };
  return database as unknown as ExecutionRouteDatabaseClientV1;
}

void test('[DSO-024/IAM-009] Prisma routes use every tenant-scope key and preserve immutable decisions', async () => {
  const repository = new PrismaExecutionRouteRepositoryAdapter(client());
  await repository.save(decision());
  assert.deepEqual(
    await repository.findExact({ tenantScope: tenant(), decisionId: decision().decisionId }),
    decision(),
  );
  assert.equal(
    await repository.findExact({
      tenantScope: tenant(siblingWorkspaceId),
      decisionId: decision().decisionId,
    }),
    undefined,
  );
  await repository.save(decision());
  await assert.rejects(
    repository.save({ ...decision(), decisionSubjectHash: 'f'.repeat(64) }),
    /DSO_IMMUTABLE_EXECUTION_ROUTE_DECISION/u,
  );
});

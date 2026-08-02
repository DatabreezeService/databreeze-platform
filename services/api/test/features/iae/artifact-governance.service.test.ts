import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryArtifactLineageRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-lineage-repository.adapter.js';
import { ArtifactGovernanceService } from '../../../src/features/iae/application/artifact-governance.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

function context(workspace: string, idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function stable(value: string) {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid identifier');
  return result.value;
}

const input = {
  lineageId: '00000000-0000-4000-8000-000000000020',
  derivedArtifactVersionId: '00000000-0000-4000-8000-000000000021',
  tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
  sourceArtifactVersionIds: ['00000000-0000-4000-8000-000000000022'],
  sourceTenantScopes: [{ scopeType: 'workspace', organizationId, workspaceId }],
  processorVersion: 'spreadsheet-auditor@1',
  coordinateLineage: [
    {
      sourceEvidenceId: '00000000-0000-4000-8000-000000000023',
      derivedEvidenceId: '00000000-0000-4000-8000-000000000024',
      transform: 'NORMALIZED',
    },
  ],
};
const sourceArtifactVersionId = input.sourceArtifactVersionIds[0] as string;

void test('[IAE-007, IAE-012] lineage is immutable, idempotent, and tenant scoped', async () => {
  const service = new ArtifactGovernanceService(new InMemoryArtifactLineageRepositoryAdapter());
  const created = await service.registerLineage(context(workspaceId, 'lineage-1'), input);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const repeated = await service.registerLineage(context(workspaceId, 'lineage-2'), input);
  assert.deepEqual(repeated, created);
  assert.equal(
    await service.findForDerived(
      context(siblingWorkspaceId, 'lineage-read'),
      stable(input.derivedArtifactVersionId),
    ),
    undefined,
  );
  assert.equal(
    (
      await service.listForSource(
        context(workspaceId, 'lineage-source'),
        stable(sourceArtifactVersionId),
      )
    ).length,
    1,
  );
});

void test('[IAE-007] lineage rejects cross-scope sources and conflicting derived versions', async () => {
  const service = new ArtifactGovernanceService(new InMemoryArtifactLineageRepositoryAdapter());
  const crossScope = await service.registerLineage(context(workspaceId, 'lineage-cross'), {
    ...input,
    sourceTenantScopes: [
      { scopeType: 'workspace', organizationId, workspaceId: siblingWorkspaceId },
    ],
  });
  assert.deepEqual(crossScope, { accepted: false, code: 'CROSS_SCOPE' });
  await service.registerLineage(context(workspaceId, 'lineage-conflict-a'), input);
  await assert.rejects(
    service.registerLineage(context(workspaceId, 'lineage-conflict-b'), {
      ...input,
      lineageId: '00000000-0000-4000-8000-000000000025',
      processorVersion: 'different@1',
    }),
    /IAE_DERIVED_LINEAGE_CONFLICT/u,
  );
});

void test('[IAE-021] retention evaluation aggregates every blocker deterministically', () => {
  const service = new ArtifactGovernanceService(new InMemoryArtifactLineageRepositoryAdapter());
  const result = service.evaluateRetention({
    evaluatedAt: '2026-01-01T00:00:00.000Z',
    workspaceRetentionUntil: '2026-02-01T00:00:00.000Z',
    resourceRetentionUntil: '2025-12-01T00:00:00.000Z',
    auditRetentionUntil: '2026-03-01T00:00:00.000Z',
    recoveryWindowUntil: '2025-12-01T00:00:00.000Z',
    activeApproval: true,
    legalHold: true,
  });
  assert.deepEqual(result, {
    accepted: true,
    value: {
      eligible: false,
      blockers: ['WORKSPACE_RETENTION', 'AUDIT_RETENTION', 'ACTIVE_APPROVAL', 'LEGAL_HOLD'],
      evaluatedAt: '2026-01-01T00:00:00.000Z',
    },
  });
});

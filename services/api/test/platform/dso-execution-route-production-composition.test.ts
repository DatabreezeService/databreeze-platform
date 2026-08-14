import assert from 'node:assert/strict';
import test from 'node:test';

/* eslint-disable @typescript-eslint/require-await -- deterministic production database doubles. */

import { AppModule } from '../../src/app.module.js';
import { DsoModule } from '../../src/features/dso/dso.module.js';
import { EXECUTION_ROUTE_AUTHORITY_PORT } from '../../src/features/dso/application/execution-route.service.js';
import { ExecutionRouteService } from '../../src/features/dso/application/execution-route.service.js';
import { createIamTenantContextV1 } from '../../src/features/iam/application/tenant-context.js';

function providerValue(root: ReturnType<typeof AppModule.register>, token: symbol): unknown {
  const dso = root.imports?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'module' in candidate &&
      candidate.module === DsoModule,
  ) as { readonly providers?: readonly unknown[] } | undefined;
  const provider = dso?.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === token,
  );
  return provider && typeof provider === 'object' && 'useValue' in provider
    ? provider.useValue
    : undefined;
}

void test('[DSO-024/026/027][IAM-019] AppModule composes durable route authority from exact current DSO and IAM state', async () => {
  const organizationId = '00000000-0000-4000-8000-000000000501';
  const workspaceId = '00000000-0000-4000-8000-000000000502';
  const policyId = '00000000-0000-4000-8000-000000000503';
  const versionId = '00000000-0000-4000-8000-000000000504';
  const database = {
    deviceDataModePolicyRecord: {
      findFirst: async () => ({
        id: versionId,
        policyId,
        organizationId,
        workspaceId,
        revision: 1,
        mode: 'LOCAL',
        allowedPayloadClasses: {
          PUBLIC: ['CONTROL_METADATA'],
          INTERNAL: ['CONTROL_METADATA'],
          CONFIDENTIAL: ['CONTROL_METADATA'],
          RESTRICTED: ['CONTROL_METADATA'],
        },
        allowedPlacementKinds: ['LOCAL'],
        allowedExecutorClasses: ['DESKTOP'],
        allowedDestinationClasses: ['DESKTOP'],
        canonicalHash: 'f'.repeat(64),
        publishedAt: new Date('2026-08-13T00:00:00.000Z'),
      }),
      findUnique: async () => null,
      findMany: async () => [],
      create: async () => ({}),
    },
    workspaceDataModePolicyRecord: {
      findFirst: async () => ({
        id: policyId,
        organizationId,
        workspaceId,
        currentVersionId: versionId,
        currentVersionHash: 'f'.repeat(64),
        revision: 1,
      }),
      create: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
    workspacePolicyActivationRecord: {
      findFirst: async () => null,
      create: async () => ({}),
    },
    workspaceIdentity: {
      findFirst: async () => ({
        id: workspaceId,
        organizationId,
        dataModePolicyId: policyId,
        currentDataModePolicyVersionId: versionId,
        dataModeProjection: 'LOCAL',
        authorizationEpoch: 2,
      }),
      updateMany: async () => ({ count: 1 }),
    },
    executionRouteDecisionRecord: {
      create: async () => ({}),
      findFirst: async () => null,
    },
    $transaction: async (work: (transaction: unknown) => Promise<unknown>) => work(database),
  };

  const root = AppModule.register({
    runtimeMode: 'production',
    ddaDatabase: database as never,
    approvalDatabase: database as never,
    dataModePolicyDatabase: database as never,
    executionRouteDatabase: database as never,
  });
  const authority = providerValue(root, EXECUTION_ROUTE_AUTHORITY_PORT);
  assert.ok(authority instanceof ExecutionRouteService);
  const context = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actorId: '00000000-0000-4000-8000-000000000505',
    correlationId: '00000000-0000-4000-8000-000000000506',
    idempotencyKey: 'local-cloud-denial',
    authorizationEpoch: 2,
  });
  assert.equal(context.accepted, true);
  if (!context.accepted) return;

  const denied = await authority.createDecision(context.value, {
    routeId: '00000000-0000-4000-8000-000000000507',
    decisionId: '00000000-0000-4000-8000-000000000508',
    revision: 1,
    subject: {
      tenantScope: context.value.tenantScope,
      input: {
        artifactVersionId: '00000000-0000-4000-8000-000000000509',
        artifactVersionHash: '1'.repeat(64),
        placementId: '00000000-0000-4000-8000-000000000510',
        placementHash: '2'.repeat(64),
        dataMode: 'Local',
        classification: 'INTERNAL',
        payloadClass: 'CONTROL_METADATA',
        placementKind: 'CLOUD',
        placementAvailable: true,
      },
      action: { type: 'spreadsheet.audit', version: 1, requiredCapabilities: ['audit'] },
      target: { target: 'CLOUD', executorClass: 'CLOUD', grantedCapabilities: ['audit'] },
      narrowingConstraints: [],
      authorizationEpoch: 2,
    },
    expiresAt: '2026-08-14T00:00:00.000Z',
  });
  assert.deepEqual(denied, { accepted: false, code: 'ROUTE_NOT_ALLOWED' });
});

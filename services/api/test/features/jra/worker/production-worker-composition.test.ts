/* eslint-disable @typescript-eslint/require-await -- deterministic production composition doubles. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { AppModule } from '../../../../src/app.module.js';
import { JraWorkerModule } from '../../../../src/features/jra/worker/worker.module.js';
import { WORKER_BOUNDARY } from '../../../../src/features/jra/worker/worker-ports.js';
import { UnavailableWorkerBoundary } from '../../../../src/features/jra/worker/worker-boundary.js';
import { IaeWorkerObjectGrantAuthorityAdapter } from '../../../../src/features/jra/worker/iae-worker-object-grant-authority.adapter.js';
import { WORKER_OBJECT_GRANT_AUTHORITY_PORT } from '../../../../src/features/jra/worker/worker-ports.js';
import type { IaeWorkerObjectCapabilityPortV1 } from '../../../../src/features/iae/application/worker-object-capability.service.js';
import type { WorkerCredentialLookupPortV1 } from '../../../../src/features/iam/application/worker-credential-lookup.port.js';
import type { JraWorkerDatabaseClientV1 } from '../../../../src/features/jra/worker/prisma-worker-adapter.js';
import type { JraApprovalDatabaseClientV1 } from '../../../../src/features/jra/adapter/prisma-approval-repository.adapter.js';
import type { DdaDatabaseClientV1 } from '../../../../src/features/dda/adapter/dda-database.client.js';

void test('production root composes durable worker ports from the shared Prisma client', () => {
  const module = AppModule.register({
    runtimeMode: 'production',
    allowInMemoryAdapters: false,
    approvalDatabase: {} as JraApprovalDatabaseClientV1,
    jraWorkerDatabase: {} as JraWorkerDatabaseClientV1,
    ddaDatabase: {} as DdaDatabaseClientV1,
    workerCredentialLookup: {} as WorkerCredentialLookupPortV1,
  });
  const workerModule = module.imports?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'module' in candidate &&
      candidate.module === JraWorkerModule,
  );
  assert.ok(workerModule && typeof workerModule === 'object' && 'providers' in workerModule);
  const provider = workerModule.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === WORKER_BOUNDARY,
  );
  assert.ok(provider && typeof provider === 'object' && 'useValue' in provider);
  assert.equal(provider.useValue instanceof UnavailableWorkerBoundary, false);
});

void test('production root uses the IAE capability bridge when its public service is provisioned', () => {
  const capability: IaeWorkerObjectCapabilityPortV1 = {
    issueInputGrant: async () => ({ accepted: false, code: 'INPUT_OBJECTS_UNAVAILABLE' }),
    acceptResultReferences: async () => ({ accepted: false, code: 'OUTPUT_OBJECT_REJECTED' }),
  };
  const module = AppModule.register({
    runtimeMode: 'production',
    allowInMemoryAdapters: false,
    approvalDatabase: {} as JraApprovalDatabaseClientV1,
    jraWorkerDatabase: {} as JraWorkerDatabaseClientV1,
    ddaDatabase: {} as DdaDatabaseClientV1,
    workerSecurityEpoch: { isCurrent: async () => true },
    iaeWorkerObjectCapability: capability,
  });
  const workerModule = module.imports?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'module' in candidate &&
      candidate.module === JraWorkerModule,
  );
  assert.ok(workerModule && typeof workerModule === 'object' && 'providers' in workerModule);
  const provider = workerModule.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === WORKER_OBJECT_GRANT_AUTHORITY_PORT,
  );
  assert.ok(provider && typeof provider === 'object' && 'useValue' in provider);
  assert.equal(provider.useValue instanceof IaeWorkerObjectGrantAuthorityAdapter, true);
});

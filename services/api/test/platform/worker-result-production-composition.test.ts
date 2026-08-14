/* eslint-disable @typescript-eslint/require-await -- composition doubles mirror async ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { DynamicModule } from '@nestjs/common';

import { AppModule } from '../../src/app.module.js';
import { HmacWorkerCapabilitySignerAdapter } from '../../src/features/iae/adapter/hmac-worker-capability-signer.adapter.js';
import { PrismaWorkerResultFinalizationAdapter } from '../../src/features/iae/adapter/prisma-worker-result-finalization.adapter.js';
import {
  IAE_WORKER_RESULT_ATTESTATION_RESOLVER_PORT,
  IAE_WORKER_RESULT_FINALIZATION_PORT,
} from '../../src/features/iae/application/worker-result-finalization.port.js';
import { IaeWorkerResultFinalizationService } from '../../src/features/iae/application/worker-result-finalization.service.js';
import { IaeModule } from '../../src/features/iae/iae.module.js';
import { PrismaJraWorkerAdapter } from '../../src/features/jra/worker/prisma-worker-adapter.js';
import {
  WORKER_RESULT_ATTESTATION_RESOLVER_PORT,
  WORKER_RESULT_FINALIZATION_PORT,
  WORKER_VERIFIED_RESULT_MANIFEST_PORT,
} from '../../src/features/jra/worker/worker-result-finalization.port.js';
import { WORKER_RESULT_PREPARATION_PORT } from '../../src/features/jra/worker/worker-result-preparation.port.js';
import { JraWorkerModule } from '../../src/features/jra/worker/worker.module.js';

function imported(root: DynamicModule, moduleType: unknown): DynamicModule {
  const match = (root.imports ?? []).find(
    (candidate): candidate is DynamicModule =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'module' in candidate &&
      candidate.module === moduleType,
  );
  if (match === undefined) throw new Error('expected module in root composition');
  return match;
}

function providerValue(module: DynamicModule, token: unknown): unknown {
  const provider = (module.providers ?? []).find(
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

void test('[IAE-024, JRA-023, JRA-031, BUA-023] root composes durable result authorities but leaves finalization closed without every same-database effect participant', () => {
  const workerSecurityEpoch = { isCurrent: async () => true };
  const workerAuthenticator = { authenticate: async () => undefined };
  const workerObjectGrantAuthority = {
    issueInputGrant: async () => {
      throw new Error('not exercised');
    },
    acceptResultReferences: async () => {
      throw new Error('not exercised');
    },
  };
  const signer = new HmacWorkerCapabilitySignerAdapter(Buffer.alloc(32, 11));
  const root = AppModule.register({
    runtimeMode: 'production',
    workerCapabilitySigner: signer,
    workerCapabilityVerifier: signer,
    workerCapabilityDatabase: {} as never,
    workerResultFinalizationDatabase: {} as never,
    jraWorkerDatabase: {} as never,
    ddaDatabase: {} as never,
    approvalDatabase: {} as never,
    workerSecurityEpoch,
    workerAuthenticator,
    workerObjectGrantAuthority,
  } as never);

  const iae = imported(root, IaeModule);
  const iaeFinalization = providerValue(iae, IAE_WORKER_RESULT_FINALIZATION_PORT);
  const iaeResolver = providerValue(iae, IAE_WORKER_RESULT_ATTESTATION_RESOLVER_PORT);
  assert.ok(iaeFinalization instanceof IaeWorkerResultFinalizationService);
  assert.ok(iaeResolver instanceof PrismaWorkerResultFinalizationAdapter);

  const jraWorker = imported(root, JraWorkerModule);
  assert.ok(
    providerValue(jraWorker, WORKER_RESULT_PREPARATION_PORT) instanceof PrismaJraWorkerAdapter,
  );
  assert.equal(providerValue(jraWorker, WORKER_RESULT_ATTESTATION_RESOLVER_PORT), iaeResolver);
  assert.ok(
    providerValue(jraWorker, WORKER_VERIFIED_RESULT_MANIFEST_PORT) instanceof
      PrismaJraWorkerAdapter,
  );
  assert.equal(providerValue(jraWorker, WORKER_RESULT_FINALIZATION_PORT), undefined);
});

void test('[AUD-001, BUA-023, JRA-032] root enables finalization only when JRA, AUD, BUA and settlement binding share one database', () => {
  const database = {} as never;
  const signer = new HmacWorkerCapabilitySignerAdapter(Buffer.alloc(32, 12));
  const root = AppModule.register({
    runtimeMode: 'production',
    workerCapabilitySigner: signer,
    workerCapabilityVerifier: signer,
    workerCapabilityDatabase: database,
    workerResultFinalizationDatabase: database,
    jraWorkerDatabase: database,
    auditDatabase: database,
    entitlementDatabase: database,
    resultUsageSettlementBindingDatabase: database,
    ddaDatabase: database,
    approvalDatabase: database,
    workerSecurityEpoch: { isCurrent: async () => true },
    workerAuthenticator: { authenticate: async () => undefined },
    workerObjectGrantAuthority: {
      issueInputGrant: async () => {
        throw new Error('not exercised');
      },
      acceptResultReferences: async () => {
        throw new Error('not exercised');
      },
    },
  } as never);

  const jraWorker = imported(root, JraWorkerModule);
  assert.ok(
    providerValue(jraWorker, WORKER_RESULT_FINALIZATION_PORT) instanceof PrismaJraWorkerAdapter,
  );
});

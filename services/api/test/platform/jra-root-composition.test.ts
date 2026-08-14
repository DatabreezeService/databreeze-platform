import assert from 'node:assert/strict';
import test from 'node:test';

import type { DynamicModule } from '@nestjs/common';

import { AppModule } from '../../src/app.module.js';
import type { ApiApplicationOptions } from '../../src/bootstrap.js';
import { PrismaApprovalRepositoryAdapter } from '../../src/features/jra/adapter/prisma-approval-repository.adapter.js';
import { JraModule } from '../../src/features/jra/jra.module.js';
import { JRA_APPROVAL_AUTHORITY_PORT } from '../../src/features/jra/application/approval-authority.port.js';
import { APPROVAL_REPOSITORY_PORT } from '../../src/features/jra/application/approval-repository.port.js';

function imported(root: DynamicModule, moduleType: unknown): DynamicModule {
  const match = (root.imports ?? []).find(
    (candidate): candidate is DynamicModule =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'module' in candidate &&
      candidate.module === moduleType,
  );
  if (match === undefined) throw new Error('expected JRA module in root composition');
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

void test('[JRA-028] root exposes JRA options and registers the durable approval authority', () => {
  const approvalDatabase = {} as never;
  const options = {
    runtimeMode: 'test' as const,
    allowInMemoryAdapters: true,
    approvalDatabase,
  } satisfies ApiApplicationOptions;

  const jra = imported(AppModule.register(options), JraModule);
  assert.ok(providerValue(jra, JRA_APPROVAL_AUTHORITY_PORT));
  assert.ok(
    providerValue(jra, APPROVAL_REPOSITORY_PORT) instanceof PrismaApprovalRepositoryAdapter,
  );
});

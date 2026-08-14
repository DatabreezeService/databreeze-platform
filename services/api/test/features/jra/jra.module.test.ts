import assert from 'node:assert/strict';
import test from 'node:test';

import { JraModule } from '../../../src/features/jra/jra.module.js';
import { InMemoryApprovalRepositoryAdapter } from '../../../src/features/jra/adapter/in-memory-approval-repository.adapter.js';
import { PrismaApprovalRepositoryAdapter } from '../../../src/features/jra/adapter/prisma-approval-repository.adapter.js';
import { APPROVAL_REPOSITORY_PORT } from '../../../src/features/jra/application/approval-repository.port.js';

void test('[JRA-028] JRA production composition fails closed without an approval database', () => {
  assert.throws(
    () => JraModule.register({ runtimeMode: 'production' }),
    /JRA_APPROVAL_DATABASE_REQUIRED/u,
  );
});

void test('[JRA-028] JRA test/dev composition requires an explicit in-memory opt-in', () => {
  assert.throws(
    () => JraModule.register({ runtimeMode: 'test' }),
    /JRA_APPROVAL_DATABASE_REQUIRED/u,
  );
  const dynamic = JraModule.register({ runtimeMode: 'test', allowInMemoryAdapters: true });
  const provider = dynamic.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === APPROVAL_REPOSITORY_PORT,
  );
  assert.ok(provider && 'useValue' in provider);
  if (provider && 'useValue' in provider)
    assert.ok(provider.useValue instanceof InMemoryApprovalRepositoryAdapter);
});

void test('[JRA-028] configured JRA database composes Prisma approvals without touching worker composition', () => {
  const dynamic = JraModule.register({ runtimeMode: 'production', approvalDatabase: {} as never });
  const provider = dynamic.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === APPROVAL_REPOSITORY_PORT,
  );
  assert.ok(provider && 'useValue' in provider);
  if (provider && 'useValue' in provider)
    assert.ok(provider.useValue instanceof PrismaApprovalRepositoryAdapter);
});

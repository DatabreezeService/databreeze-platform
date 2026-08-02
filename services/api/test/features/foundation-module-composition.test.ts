import assert from 'node:assert/strict';
import test from 'node:test';

import { AppModule } from '../../src/app.module.js';
import { IamModule } from '../../src/features/iam/iam.module.js';
import {
  AUTHENTICATION_USE_CASE,
  CREDENTIAL_LOOKUP_PORT,
} from '../../src/features/iam/application/authentication.port.js';
import { PrismaCredentialLookupAdapter } from '../../src/features/iam/adapter/prisma-credential-lookup.adapter.js';
import { PrismaSessionLifecycleAdapter } from '../../src/features/iam/adapter/prisma-session-lifecycle.adapter.js';
import { SESSION_LIFECYCLE_PORT } from '../../src/features/iam/application/session-lifecycle.port.js';
import { AudModule } from '../../src/features/aud/aud.module.js';
import { AUDIT_REPOSITORY_PORT } from '../../src/features/aud/application/audit-repository.port.js';
import { PrismaAuditRepositoryAdapter } from '../../src/features/aud/adapter/prisma-audit-repository.adapter.js';
import { BuaModule } from '../../src/features/bua/bua.module.js';
import { ENTITLEMENT_REPOSITORY_PORT } from '../../src/features/bua/application/entitlement-repository.port.js';
import { PrismaEntitlementRepositoryAdapter } from '../../src/features/bua/adapter/prisma-entitlement-repository.adapter.js';

function moduleTypes(): readonly unknown[] {
  const registered = AppModule.register();
  return (registered.imports ?? []).map((entry) =>
    typeof entry === 'object' && entry !== null && 'module' in entry
      ? (entry as { readonly module: unknown }).module
      : entry,
  );
}

void test('[IAM-001, AUD-001, BUA-001] application composition includes identity, audit, and entitlements modules', () => {
  const types = moduleTypes();
  assert.ok(types.includes(AudModule));
  assert.ok(types.includes(BuaModule));
});

void test('[AUD-001] configured audit persistence uses the Prisma adapter instead of the local fallback', () => {
  const database = {} as never;
  const registered = AudModule.register({ auditDatabase: database });
  const provider = registered.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === AUDIT_REPOSITORY_PORT,
  );
  assert.ok(provider && 'useValue' in provider);
  if (!provider || !('useValue' in provider)) return;
  assert.ok(provider.useValue instanceof PrismaAuditRepositoryAdapter);
});

void test('[IAM-001] configured credential persistence uses the Prisma adapter boundary', () => {
  const database = {} as never;
  const registered = IamModule.register({ credentialDatabase: database });
  const provider = registered.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === CREDENTIAL_LOOKUP_PORT,
  );
  assert.ok(provider && 'useValue' in provider);
  if (!provider || !('useValue' in provider)) return;
  assert.ok(provider.useValue instanceof PrismaCredentialLookupAdapter);
  const authentication = registered.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === AUTHENTICATION_USE_CASE,
  );
  assert.ok(authentication && 'useValue' in authentication);
});

void test('[IAM-005] configured session persistence uses the Prisma lifecycle adapter', () => {
  const database = {} as never;
  const registered = IamModule.register({ sessionDatabase: database });
  const provider = registered.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === SESSION_LIFECYCLE_PORT,
  );
  assert.ok(provider && 'useValue' in provider);
  if (!provider || !('useValue' in provider)) return;
  assert.ok(provider.useValue instanceof PrismaSessionLifecycleAdapter);
});

void test('[BUA-001] configured entitlement persistence uses the Prisma adapter instead of the local fallback', () => {
  const database = {} as never;
  const registered = BuaModule.register({ entitlementDatabase: database });
  const provider = registered.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === ENTITLEMENT_REPOSITORY_PORT,
  );
  assert.ok(provider && 'useValue' in provider);
  if (!provider || !('useValue' in provider)) return;
  assert.ok(provider.useValue instanceof PrismaEntitlementRepositoryAdapter);
});

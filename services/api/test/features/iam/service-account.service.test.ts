import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import { InMemoryServiceAccountRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-service-account-repository.adapter.js';
import {
  AesGcmServiceAccountSecretEnvelopeAdapter,
  randomServiceAccountSecretEnvelopeAdapter,
} from '../../../src/features/iam/adapter/service-account-secret-envelope.adapter.js';
import { ServiceAccountService } from '../../../src/features/iam/application/service-account.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

const organizationId = '00000000-0000-4000-8000-000000000711';
const workspaceId = '00000000-0000-4000-8000-000000000712';
const actorId = '00000000-0000-4000-8000-000000000713';
const correlationId = '00000000-0000-4000-8000-000000000714';
const accountId = '00000000-0000-4000-8000-000000000715';

function digestSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

function scopeValue(value: unknown): TenantScopeV1 {
  const parsed = parseTenantScopeV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid scope');
  return parsed.value;
}

function context(scope: unknown, key = 'service-account-service') {
  const result = createIamTenantContextV1({
    actorId,
    correlationId,
    tenantScope: scope,
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function membership(
  roleId = 'owner',
  scope: unknown = { scopeType: 'organization', organizationId },
) {
  return {
    id: stable('00000000-0000-4000-8000-000000000717'),
    principalId: stable(actorId),
    scope: scopeValue(scope),
    roleId,
    status: 'ACTIVE' as const,
    revision: 1,
  };
}

function service(secretIssuerInput?: {
  issue: () => { readonly secret: string; readonly digest: string };
}) {
  const iam = new InMemoryIamRepositoryAdapter();
  iam.seed([membership()]);
  const secrets = [
    { secret: 'dbsa_first', digest: digestSecret('dbsa_first') },
    { secret: 'dbsa_second', digest: digestSecret('dbsa_second') },
  ];
  const secretIssuer =
    secretIssuerInput ??
    ({
      issue: () => secrets.shift() ?? { secret: 'dbsa_fallback', digest: 'c'.repeat(64) },
    } as const);
  const service = new ServiceAccountService(
    new InMemoryServiceAccountRepositoryAdapter(),
    iam,
    secretIssuer,
    () => new Date('2026-01-01T00:00:00.000Z'),
    () => accountId,
    randomServiceAccountSecretEnvelopeAdapter(),
  );
  return service;
}

void test('[IAM-013] authorized creation returns a one-time secret but never the persisted digest', async () => {
  const accountService = service();
  const result = await accountService.create(
    context({ scopeType: 'organization', organizationId }),
    {
      name: 'Import worker',
      permissions: ['artifact.record.read'],
    },
  );
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.secret, 'dbsa_first');
  assert.equal('secretDigest' in result.value.account, false);
  assert.equal(result.value.account.status, 'ACTIVE');
});

void test('[IAM-013] service-account creation replays the same idempotent result without reissuing a secret', async () => {
  const iam = new InMemoryIamRepositoryAdapter();
  iam.seed([membership()]);
  const repository = new InMemoryServiceAccountRepositoryAdapter();
  let issued = 0;
  const accountService = new ServiceAccountService(
    repository,
    iam,
    {
      issue: () => {
        issued += 1;
        const secret = issued === 1 ? 'dbsa_idempotent_first' : 'dbsa_idempotent_second';
        return { secret, digest: createHash('sha256').update(secret, 'utf8').digest('hex') };
      },
    },
    () => new Date('2026-01-01T00:00:00.000Z'),
    () => accountId,
    randomServiceAccountSecretEnvelopeAdapter(),
  );
  const request = {
    name: 'Idempotent worker',
    permissions: ['artifact.record.read'],
  };
  const first = await accountService.create(
    context({ scopeType: 'organization', organizationId }, 'create-idempotency'),
    request,
  );
  const replay = await accountService.create(
    context({ scopeType: 'organization', organizationId }, 'create-idempotency'),
    request,
  );
  assert.deepEqual(replay, first);
  assert.equal(issued, 1);
  assert.deepEqual(
    await accountService.create(
      context({ scopeType: 'organization', organizationId }, 'create-idempotency'),
      { ...request, name: 'Changed request' },
    ),
    { accepted: false, code: 'CONFLICT' },
  );
  assert.equal(issued, 1);
});

void test('[IAM-013] a replay envelope that cannot be opened fails closed without issuing again', async () => {
  const iam = new InMemoryIamRepositoryAdapter();
  iam.seed([membership()]);
  const repository = new InMemoryServiceAccountRepositoryAdapter();
  const request = {
    name: 'Tamper-resistant worker',
    permissions: ['artifact.record.read'],
  };
  const first = new ServiceAccountService(
    repository,
    iam,
    { issue: () => ({ secret: 'dbsa_tamper', digest: digestSecret('dbsa_tamper') }) },
    () => new Date('2026-01-01T00:00:00.000Z'),
    () => accountId,
    new AesGcmServiceAccountSecretEnvelopeAdapter('a'.repeat(43)),
  );
  const created = await first.create(
    context({ scopeType: 'organization', organizationId }, 'tampered-replay'),
    request,
  );
  assert.equal(created.accepted, true);

  let issued = 0;
  const replay = new ServiceAccountService(
    repository,
    iam,
    {
      issue: () => {
        issued += 1;
        return { secret: 'dbsa_should-not-issue', digest: digestSecret('dbsa_should-not-issue') };
      },
    },
    () => new Date('2026-01-01T00:00:00.000Z'),
    () => accountId,
    new AesGcmServiceAccountSecretEnvelopeAdapter('b'.repeat(43)),
  );
  assert.deepEqual(
    await replay.create(
      context({ scopeType: 'organization', organizationId }, 'tampered-replay'),
      request,
    ),
    { accepted: false, code: 'UNAVAILABLE' },
  );
  assert.equal(issued, 0);
});

void test('[IAM-013] invalid service-account permissions fail before secret issuance', async () => {
  let issued = 0;
  const accountService = service({
    issue: () => {
      issued += 1;
      return { secret: 'dbsa_invalid', digest: 'e'.repeat(64) };
    },
  });
  assert.deepEqual(
    await accountService.create(context({ scopeType: 'organization', organizationId }), {
      name: 'Invalid worker',
      permissions: [],
    }),
    { accepted: false, code: 'INVALID_INPUT' },
  );
  assert.equal(issued, 0);
});

void test('[IAM-013] service account management requires the delegated IAM permission and target scope', async () => {
  const iam = new InMemoryIamRepositoryAdapter();
  iam.seed([membership('viewer')]);
  const accountService = new ServiceAccountService(
    new InMemoryServiceAccountRepositoryAdapter(),
    iam,
    { issue: () => ({ secret: 'dbsa', digest: 'd'.repeat(64) }) },
    () => new Date('2026-01-01T00:00:00.000Z'),
    () => accountId,
  );
  assert.deepEqual(
    await accountService.create(context({ scopeType: 'organization', organizationId }), {
      name: 'Denied',
      permissions: ['artifact.record.read'],
    }),
    { accepted: false, code: 'SCOPE_DENIED' },
  );
  iam.seed([membership('owner')]);
  assert.deepEqual(
    await accountService.create(context({ scopeType: 'workspace', organizationId, workspaceId }), {
      name: 'Workspace worker',
      workspaceId: '00000000-0000-4000-8000-000000000799',
      permissions: ['artifact.record.read'],
    }),
    { accepted: false, code: 'SCOPE_DENIED' },
  );
});

void test('[IAM-013] rotation is revision guarded and revocation is permanent', async () => {
  const accountService = service();
  const organizationContext = context({ scopeType: 'organization', organizationId }, 'lifecycle');
  const created = await accountService.create(organizationContext, {
    name: 'Lifecycle worker',
    permissions: ['artifact.record.read'],
  });
  assert.equal(created.accepted, true);
  const rotated = await accountService.rotate(organizationContext, accountId, 1);
  assert.equal(rotated.accepted, true);
  if (!rotated.accepted) return;
  assert.equal(rotated.value.secret, 'dbsa_second');
  assert.deepEqual(await accountService.rotate(organizationContext, accountId, 1), {
    accepted: false,
    code: 'CONFLICT',
  });
  const revoked = await accountService.revoke(organizationContext, accountId, 2);
  assert.equal(revoked.accepted, true);
  assert.deepEqual(await accountService.revoke(organizationContext, accountId, 3), {
    accepted: false,
    code: 'REVOKED',
  });
  assert.equal((await accountService.list(organizationContext)).accepted, true);
});

void test('[IAM-013] credential authentication is digest-bound, updates last use, and fails closed', async () => {
  const accountService = service();
  const organizationContext = context(
    { scopeType: 'organization', organizationId },
    'authenticate',
  );
  const created = await accountService.create(organizationContext, {
    name: 'Auth worker',
    permissions: ['artifact.record.read'],
  });
  assert.equal(created.accepted, true);
  const authenticated = await accountService.authenticate(
    organizationContext,
    'dbsa_first',
    '2026-01-01T00:01:00.000Z',
  );
  assert.equal(authenticated.accepted, true);
  if (!authenticated.accepted) return;
  assert.equal(authenticated.value.id, accountId);
  assert.equal(authenticated.value.lastUsedAt, '2026-01-01T00:01:00.000Z');
  assert.deepEqual(
    await accountService.authenticate(
      organizationContext,
      'wrong-secret',
      '2026-01-01T00:02:00.000Z',
    ),
    { accepted: false, code: 'INVALID_CREDENTIALS' },
  );
  assert.deepEqual(
    await accountService.authenticate(
      organizationContext,
      'dbsa_first',
      '2026-01-01T00:00:30.000Z',
    ),
    { accepted: false, code: 'INVALID_CREDENTIALS' },
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDeviceEnrollmentChallengeV1,
  createDeviceIdentityV1,
  type DeviceEnrollmentChallengeV1,
  type DeviceIdentityV1,
} from '@databreeze/domain/identity/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaDeviceIdentityRepositoryAdapter,
  type DeviceIdentityDatabaseClientV1,
} from '../../../src/features/iam/adapter/prisma-device-identity-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000611';
const siblingOrganizationId = '00000000-0000-4000-8000-000000000612';
const userId = '00000000-0000-4000-8000-000000000613';
const challengeId = '00000000-0000-4000-8000-000000000614';
const deviceId = '00000000-0000-4000-8000-000000000615';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

function timestamp(value: string) {
  const parsed = parseStrictUtcTimestampV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid timestamp');
  return parsed.value;
}

function context(candidateOrganizationId = organizationId, key = 'repository') {
  const result = createIamTenantContextV1({
    actorId: userId,
    correlationId: '00000000-0000-4000-8000-000000000616',
    tenantScope: { scopeType: 'organization', organizationId: candidateOrganizationId },
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function challenge(): DeviceEnrollmentChallengeV1 {
  const result = createDeviceEnrollmentChallengeV1({
    challengeId,
    userId,
    organizationId,
    platform: 'WINDOWS',
    installationIdHash: 'a'.repeat(64),
    challengeDigest: 'b'.repeat(64),
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T00:05:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid challenge');
  return result.value;
}

function device(): DeviceIdentityV1 {
  const result = createDeviceIdentityV1({
    id: deviceId,
    userId,
    organizationId,
    platform: 'WINDOWS',
    publicKey: 'ed25519-device-key',
    installationIdHash: 'a'.repeat(64),
    enrolledAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid device');
  return result.value;
}

function delegate(
  rows: Record<string, unknown>[],
  forceRevisionConflict = false,
  firstQueries?: Array<Readonly<Record<string, unknown>>>,
) {
  return {
    create({ data }: { readonly data: Record<string, unknown> }) {
      const persisted = { ...data };
      rows.push(persisted);
      return Promise.resolve(persisted);
    },
    findFirst({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
      firstQueries?.push(where);
      return Promise.resolve(
        rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ??
          null,
      );
    },
    findMany({ where }: { readonly where: Readonly<Record<string, unknown>> }) {
      return Promise.resolve(
        rows.filter((row) => Object.entries(where).every(([key, value]) => row[key] === value)),
      );
    },
    update({
      where,
      data,
    }: {
      readonly where: { readonly id: string };
      readonly data: Record<string, unknown>;
    }) {
      const index = rows.findIndex((row) => row['id'] === where.id);
      if (index < 0) throw new Error('row not found');
      rows[index] = { ...rows[index], ...data };
      return Promise.resolve(rows[index]);
    },
    updateMany({
      where,
      data,
    }: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Record<string, unknown>;
    }) {
      if (forceRevisionConflict) return Promise.resolve({ count: 0 });
      const index = rows.findIndex((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      );
      if (index < 0) return Promise.resolve({ count: 0 });
      rows[index] = { ...rows[index], ...data };
      return Promise.resolve({ count: 1 });
    },
  };
}

function client(
  options: {
    readonly forceRevisionConflict?: boolean;
    readonly firstQueries?: Array<Readonly<Record<string, unknown>>>;
  } = {},
): DeviceIdentityDatabaseClientV1 {
  const challengeRows: Record<string, unknown>[] = [];
  const deviceRows: Record<string, unknown>[] = [];
  const database = {
    deviceEnrollmentChallenge: delegate(
      challengeRows,
      options.forceRevisionConflict,
      options.firstQueries,
    ),
    deviceIdentity: delegate(deviceRows, options.forceRevisionConflict, options.firstQueries),
    async $transaction<TValue>(
      work: (transaction: DeviceIdentityDatabaseClientV1) => Promise<TValue>,
    ) {
      return work(database as unknown as DeviceIdentityDatabaseClientV1);
    },
  };
  return database as unknown as DeviceIdentityDatabaseClientV1;
}

void test('[IAM-007, IAM-009, IAM-021] Prisma device identity adapter persists challenge/device state and hides sibling organizations', async () => {
  const repository = new PrismaDeviceIdentityRepositoryAdapter(client());
  await repository.saveChallenge(context(), challenge());
  await repository.saveDevice(context(), device());
  assert.equal(
    (await repository.findChallenge(context(organizationId, 'find-challenge'), stable(challengeId)))
      ?.id,
    stable(challengeId),
  );
  assert.equal(
    (await repository.findDevice(context(organizationId, 'find-device'), stable(deviceId)))?.id,
    stable(deviceId),
  );
  assert.equal(
    await repository.findDevice(context(siblingOrganizationId, 'sibling'), stable(deviceId)),
    undefined,
  );
  const active = {
    ...device(),
    status: 'ACTIVE' as const,
    securityEpoch: 2,
    revision: 2,
    activatedAt: timestamp('2026-01-01T00:01:00.000Z'),
  };
  await repository.replaceDevice(context(), active, 1);
  assert.equal(
    (await repository.findDevice(context(organizationId, 'after'), stable(deviceId)))?.status,
    'ACTIVE',
  );
});

void test('[IAM-007, IAM-021] Prisma device identity transitions reject database revision races', async () => {
  const repository = new PrismaDeviceIdentityRepositoryAdapter(
    client({ forceRevisionConflict: true }),
  );
  await repository.saveChallenge(context(), challenge());
  const used = {
    ...challenge(),
    status: 'USED' as const,
    revision: 2,
  };
  await assert.rejects(repository.saveChallenge(context(), used), /REVISION_CONFLICT/u);

  await repository.saveDevice(context(), device());
  const active = {
    ...device(),
    status: 'ACTIVE' as const,
    securityEpoch: 2,
    revision: 2,
    activatedAt: timestamp('2026-01-01T00:01:00.000Z'),
  };
  await assert.rejects(repository.replaceDevice(context(), active, 1), /REVISION_CONFLICT/u);
});

void test('[IAM-009, IAM-019] Prisma device lookups bind identifiers to organization scope', async () => {
  const firstQueries: Array<Readonly<Record<string, unknown>>> = [];
  const repository = new PrismaDeviceIdentityRepositoryAdapter(client({ firstQueries }));
  await repository.saveChallenge(context(), challenge());
  await repository.saveDevice(context(), device());
  await repository.findChallenge(context(), stable(challengeId));
  await repository.findDevice(context(), stable(deviceId));

  assert.equal(firstQueries.length, 4);
  for (const query of firstQueries) assert.equal(query['organizationId'], organizationId);
});

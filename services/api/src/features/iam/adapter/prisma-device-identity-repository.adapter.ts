import {
  createDeviceEnrollmentChallengeV1,
  createDeviceIdentityV1,
  type DeviceEnrollmentChallengeV1,
  type DeviceIdentityV1,
} from '@databreeze/domain/identity/v1';
import {
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../application/tenant-context.js';
import type {
  DeviceIdentityRepositoryPortV1,
  DeviceIdentityTransactionPortV1,
} from '../application/device-identity-repository.port.js';

export interface DeviceIdentityDatabaseRowV1 {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly platform: string;
  readonly publicKey: string;
  readonly keyAlgorithm: string;
  readonly installationIdHash: string | null;
  readonly status: string;
  readonly securityEpoch: number;
  readonly revision: number;
  readonly enrolledAt: Date;
  readonly activatedAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface DeviceEnrollmentChallengeDatabaseRowV1 {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly platform: string;
  readonly installationIdHash: string;
  readonly challengeDigest: string;
  readonly status: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly revision: number;
}

interface DelegateV1<TRow, TCreate, TUpdate = never> {
  create(input: { readonly data: TCreate }): Promise<TRow>;
  findUnique(input: { readonly where: { readonly id: string } }): Promise<TRow | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<readonly TRow[]>;
  update?(input: {
    readonly where: { readonly id: string };
    readonly data: TUpdate;
  }): Promise<TRow>;
  updateMany?(input: {
    readonly where: { readonly id: string; readonly revision: number };
    readonly data: TUpdate;
  }): Promise<{ readonly count: number }>;
}

export interface DeviceIdentityDatabaseClientV1 {
  readonly deviceIdentity: DelegateV1<
    DeviceIdentityDatabaseRowV1,
    DeviceIdentityDatabaseCreateDataV1,
    DeviceIdentityDatabaseUpdateDataV1
  >;
  readonly deviceEnrollmentChallenge: DelegateV1<
    DeviceEnrollmentChallengeDatabaseRowV1,
    DeviceEnrollmentChallengeDatabaseCreateDataV1,
    DeviceEnrollmentChallengeDatabaseUpdateDataV1
  >;
  $transaction<TValue>(
    work: (transaction: DeviceIdentityDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

export interface DeviceIdentityDatabaseCreateDataV1 {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly platform: DeviceIdentityV1['platform'];
  readonly publicKey: string;
  readonly keyAlgorithm: DeviceIdentityV1['keyAlgorithm'];
  readonly installationIdHash: string | null;
  readonly status: DeviceIdentityV1['status'];
  readonly securityEpoch: number;
  readonly revision: number;
  readonly enrolledAt: Date;
  readonly activatedAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface DeviceIdentityDatabaseUpdateDataV1 {
  readonly publicKey: string;
  readonly status: DeviceIdentityV1['status'];
  readonly securityEpoch: number;
  readonly revision: number;
  readonly activatedAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface DeviceEnrollmentChallengeDatabaseCreateDataV1 {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly platform: DeviceEnrollmentChallengeV1['platform'];
  readonly installationIdHash: string;
  readonly challengeDigest: string;
  readonly status: DeviceEnrollmentChallengeV1['status'];
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly revision: number;
}

export interface DeviceEnrollmentChallengeDatabaseUpdateDataV1 {
  readonly status: DeviceEnrollmentChallengeV1['status'];
  readonly revision: number;
}

function timestamp(value: Date | null): StrictUtcTimestampV1 | undefined {
  if (!value) return undefined;
  const parsed = parseStrictUtcTimestampV1(value.toISOString());
  return parsed.accepted ? parsed.value : undefined;
}

function organizationScope(context: IamTenantContextV1, organizationId: string): boolean {
  return (
    context.tenantScope.scopeType === 'organization' &&
    context.tenantScope.organizationId === organizationId
  );
}

function challengeFromRow(
  row: DeviceEnrollmentChallengeDatabaseRowV1,
): DeviceEnrollmentChallengeV1 {
  const created = createDeviceEnrollmentChallengeV1({
    challengeId: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    platform: row.platform,
    installationIdHash: row.installationIdHash,
    challengeDigest: row.challengeDigest,
    issuedAt: timestamp(row.issuedAt),
    expiresAt: timestamp(row.expiresAt),
  });
  if (!created.accepted) throw new Error('IAM_PERSISTED_CHALLENGE_INVALID');
  if (
    (row.status !== 'PENDING' && row.status !== 'USED' && row.status !== 'EXPIRED') ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  )
    throw new Error('IAM_PERSISTED_CHALLENGE_INVALID');
  return Object.freeze({ ...created.value, status: row.status, revision: row.revision });
}

function deviceFromRow(row: DeviceIdentityDatabaseRowV1): DeviceIdentityV1 {
  const created = createDeviceIdentityV1({
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    platform: row.platform,
    publicKey: row.publicKey,
    installationIdHash: row.installationIdHash ?? undefined,
    enrolledAt: timestamp(row.enrolledAt),
  });
  if (!created.accepted) throw new Error('IAM_PERSISTED_DEVICE_INVALID');
  if (
    (row.status !== 'PENDING' && row.status !== 'ACTIVE' && row.status !== 'REVOKED') ||
    row.keyAlgorithm !== 'ED25519' ||
    !Number.isSafeInteger(row.securityEpoch) ||
    row.securityEpoch < 1 ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  )
    throw new Error('IAM_PERSISTED_DEVICE_INVALID');
  const activatedAt = timestamp(row.activatedAt);
  const revokedAt = timestamp(row.revokedAt);
  if ((row.activatedAt && !activatedAt) || (row.revokedAt && !revokedAt))
    throw new Error('IAM_PERSISTED_DEVICE_INVALID');
  return Object.freeze({
    ...created.value,
    status: row.status,
    securityEpoch: row.securityEpoch,
    revision: row.revision,
    ...(activatedAt ? { activatedAt } : {}),
    ...(revokedAt ? { revokedAt } : {}),
  });
}

function challengeData(
  challenge: DeviceEnrollmentChallengeV1,
): DeviceEnrollmentChallengeDatabaseCreateDataV1 {
  return {
    id: challenge.id,
    userId: challenge.userId,
    organizationId: challenge.organizationId,
    platform: challenge.platform,
    installationIdHash: challenge.installationIdHash,
    challengeDigest: challenge.challengeDigest,
    status: challenge.status,
    issuedAt: new Date(challenge.issuedAt),
    expiresAt: new Date(challenge.expiresAt),
    revision: challenge.revision,
  };
}

function deviceData(device: DeviceIdentityV1): DeviceIdentityDatabaseCreateDataV1 {
  return {
    id: device.id,
    userId: device.userId,
    organizationId: device.organizationId,
    platform: device.platform,
    publicKey: device.publicKey,
    keyAlgorithm: device.keyAlgorithm,
    installationIdHash: device.installationIdHash ?? null,
    status: device.status,
    securityEpoch: device.securityEpoch,
    revision: device.revision,
    enrolledAt: new Date(device.enrolledAt),
    activatedAt: device.activatedAt ? new Date(device.activatedAt) : null,
    revokedAt: device.revokedAt ? new Date(device.revokedAt) : null,
  };
}

class PrismaDeviceIdentityTransactionAdapter implements DeviceIdentityTransactionPortV1 {
  public constructor(private readonly client: DeviceIdentityDatabaseClientV1) {}

  public async saveChallenge(
    context: IamTenantContextV1,
    challenge: DeviceEnrollmentChallengeV1,
  ): Promise<void> {
    if (!organizationScope(context, challenge.organizationId)) throw new Error('SCOPE_DENIED');
    const existing = await this.client.deviceEnrollmentChallenge.findUnique({
      where: { id: challenge.id },
    });
    if (!existing) {
      await this.client.deviceEnrollmentChallenge.create({ data: challengeData(challenge) });
      return;
    }
    const current = challengeFromRow(existing);
    if (JSON.stringify(current) === JSON.stringify(challenge)) return;
    if (
      current.status !== 'PENDING' ||
      challenge.status !== 'USED' ||
      challenge.revision !== current.revision + 1
    )
      throw new Error('IMMUTABLE_CHALLENGE');
    if (!this.client.deviceEnrollmentChallenge.updateMany) throw new Error('UPDATE_UNAVAILABLE');
    const result = await this.client.deviceEnrollmentChallenge.updateMany({
      where: { id: challenge.id, revision: current.revision },
      data: { status: challenge.status, revision: challenge.revision },
    });
    if (result.count !== 1) throw new Error('REVISION_CONFLICT');
  }

  public async findChallenge(
    context: IamTenantContextV1,
    challengeId: StableIdentifierV1,
  ): Promise<DeviceEnrollmentChallengeV1 | undefined> {
    const row = await this.client.deviceEnrollmentChallenge.findUnique({
      where: { id: challengeId },
    });
    if (!row || !organizationScope(context, row.organizationId)) return undefined;
    return challengeFromRow(row);
  }

  public async saveDevice(context: IamTenantContextV1, device: DeviceIdentityV1): Promise<void> {
    if (!organizationScope(context, device.organizationId)) throw new Error('SCOPE_DENIED');
    const existing = await this.client.deviceIdentity.findUnique({ where: { id: device.id } });
    if (existing) {
      if (JSON.stringify(deviceFromRow(existing)) !== JSON.stringify(device))
        throw new Error('IMMUTABLE_DEVICE');
      return;
    }
    await this.client.deviceIdentity.create({ data: deviceData(device) });
  }

  public async findDevice(
    context: IamTenantContextV1,
    deviceId: StableIdentifierV1,
  ): Promise<DeviceIdentityV1 | undefined> {
    const row = await this.client.deviceIdentity.findUnique({ where: { id: deviceId } });
    if (!row || !organizationScope(context, row.organizationId)) return undefined;
    return deviceFromRow(row);
  }

  public async listDevices(context: IamTenantContextV1): Promise<readonly DeviceIdentityV1[]> {
    if (context.tenantScope.scopeType !== 'organization') return [];
    const rows = await this.client.deviceIdentity.findMany({
      where: { organizationId: context.tenantScope.organizationId },
      orderBy: { enrolledAt: 'desc' },
    });
    return rows.map(deviceFromRow);
  }

  public async replaceDevice(
    context: IamTenantContextV1,
    device: DeviceIdentityV1,
    expectedRevision: number,
  ): Promise<void> {
    const current = await this.findDevice(context, device.id);
    if (!current) throw new Error('DEVICE_NOT_FOUND');
    if (current.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
    if (device.revision !== expectedRevision + 1) throw new Error('INVALID_REVISION');
    if (!this.client.deviceIdentity.updateMany) throw new Error('UPDATE_UNAVAILABLE');
    const result = await this.client.deviceIdentity.updateMany({
      where: { id: device.id, revision: expectedRevision },
      data: {
        publicKey: device.publicKey,
        status: device.status,
        securityEpoch: device.securityEpoch,
        revision: device.revision,
        activatedAt: device.activatedAt ? new Date(device.activatedAt) : null,
        revokedAt: device.revokedAt ? new Date(device.revokedAt) : null,
      },
    });
    if (result.count !== 1) throw new Error('REVISION_CONFLICT');
  }
}

export class PrismaDeviceIdentityRepositoryAdapter implements DeviceIdentityRepositoryPortV1 {
  public constructor(private readonly client: DeviceIdentityDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DeviceIdentityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaDeviceIdentityTransactionAdapter(transaction)),
    );
  }

  public saveChallenge(context: IamTenantContextV1, challenge: DeviceEnrollmentChallengeV1) {
    return new PrismaDeviceIdentityTransactionAdapter(this.client).saveChallenge(
      context,
      challenge,
    );
  }

  public findChallenge(context: IamTenantContextV1, challengeId: StableIdentifierV1) {
    return new PrismaDeviceIdentityTransactionAdapter(this.client).findChallenge(
      context,
      challengeId,
    );
  }

  public saveDevice(context: IamTenantContextV1, device: DeviceIdentityV1) {
    return new PrismaDeviceIdentityTransactionAdapter(this.client).saveDevice(context, device);
  }

  public findDevice(context: IamTenantContextV1, deviceId: StableIdentifierV1) {
    return new PrismaDeviceIdentityTransactionAdapter(this.client).findDevice(context, deviceId);
  }

  public listDevices(context: IamTenantContextV1) {
    return new PrismaDeviceIdentityTransactionAdapter(this.client).listDevices(context);
  }

  public replaceDevice(
    context: IamTenantContextV1,
    device: DeviceIdentityV1,
    expectedRevision: number,
  ) {
    return new PrismaDeviceIdentityTransactionAdapter(this.client).replaceDevice(
      context,
      device,
      expectedRevision,
    );
  }
}

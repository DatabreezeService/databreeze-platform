import {
  consumeDeviceEnrollmentChallengeV1,
  createDeviceEnrollmentChallengeV1,
  createDeviceIdentityV1,
  rotateDeviceIdentityKeyV1,
  transitionDeviceIdentityV1,
  type DeviceEnrollmentChallengeV1,
  type DeviceIdentityV1,
  type IdentityErrorCodeV1,
} from '@databreeze/domain/identity/v1';
import { parseStableIdentifierV1, type StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from './tenant-context.js';
import type { DeviceIdentityRepositoryPortV1 } from './device-identity-repository.port.js';

export const DEVICE_IDENTITY_SERVICE = Symbol('DEVICE_IDENTITY_SERVICE');

export interface DeviceEnrollmentProofVerifierV1 {
  verify(input: {
    readonly challenge: DeviceEnrollmentChallengeV1;
    readonly publicKey: string;
    readonly proof: unknown;
    readonly now: unknown;
  }): boolean | Promise<boolean>;
}

/** Safe default: enrollment never succeeds until the host supplies a crypto verifier. */
export class UnavailableDeviceEnrollmentProofVerifier implements DeviceEnrollmentProofVerifierV1 {
  public verify(_input: Parameters<DeviceEnrollmentProofVerifierV1['verify']>[0]): boolean {
    return false;
  }
}

export type DeviceIdentityApplicationErrorCodeV1 =
  | IdentityErrorCodeV1
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_REPLAYED'
  | 'PROOF_INVALID'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_REVOKED'
  | 'SCOPE_DENIED'
  | 'REVISION_CONFLICT';

export type DeviceIdentityApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DeviceIdentityApplicationErrorCodeV1 };

function rejected<TValue>(
  code: DeviceIdentityApplicationErrorCodeV1,
): DeviceIdentityApplicationResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function domainResult<TValue>(
  result:
    | { readonly accepted: true; readonly value: TValue }
    | { readonly accepted: false; readonly code: IdentityErrorCodeV1 },
): DeviceIdentityApplicationResultV1<TValue> {
  return result.accepted ? result : rejected(result.code);
}

/** IAM-owned device enrollment and permanent revocation lifecycle. */
export class DeviceIdentityService {
  public constructor(
    private readonly repository: DeviceIdentityRepositoryPortV1,
    private readonly proofVerifier: DeviceEnrollmentProofVerifierV1,
  ) {}

  public async issueEnrollmentChallenge(
    context: IamTenantContextV1,
    input: {
      readonly challengeId: unknown;
      readonly platform: unknown;
      readonly installationIdHash: unknown;
      readonly challengeDigest: unknown;
      readonly issuedAt: unknown;
      readonly expiresAt: unknown;
    },
  ): Promise<DeviceIdentityApplicationResultV1<DeviceEnrollmentChallengeV1>> {
    if (context.tenantScope.scopeType !== 'organization') return rejected('SCOPE_DENIED');
    const created = createDeviceEnrollmentChallengeV1({
      ...input,
      userId: context.actorId,
      organizationId: context.tenantScope.organizationId,
    });
    if (!created.accepted) return domainResult(created);
    return this.repository.withTransaction(context, async (transaction) => {
      await transaction.saveChallenge(context, created.value);
      return created;
    });
  }

  public async enroll(
    context: IamTenantContextV1,
    input: {
      readonly challengeId: unknown;
      readonly deviceId: unknown;
      readonly publicKey: unknown;
      readonly now: unknown;
      readonly proof: unknown;
    },
  ): Promise<DeviceIdentityApplicationResultV1<DeviceIdentityV1>> {
    const challengeId = stable(input.challengeId);
    const deviceId = stable(input.deviceId);
    if (!challengeId || !deviceId) return rejected('INVALID_IDENTIFIER');
    if (context.tenantScope.scopeType !== 'organization') return rejected('SCOPE_DENIED');
    return this.repository.withTransaction(context, async (transaction) => {
      const challenge = await transaction.findChallenge(context, challengeId);
      if (!challenge) return rejected('CHALLENGE_NOT_FOUND');
      if (
        challenge.userId !== context.actorId ||
        challenge.organizationId !== context.tenantScope.organizationId
      )
        return rejected('SCOPE_DENIED');
      const proofAccepted = await this.proofVerifier.verify({
        challenge,
        publicKey: typeof input.publicKey === 'string' ? input.publicKey : '',
        proof: input.proof,
        now: input.now,
      });
      if (!proofAccepted) return rejected('PROOF_INVALID');
      const consumed = consumeDeviceEnrollmentChallengeV1(challenge, input.now);
      if (!consumed.accepted) return rejected('CHALLENGE_REPLAYED');
      const created = createDeviceIdentityV1({
        id: deviceId,
        userId: context.actorId,
        organizationId: context.tenantScope.organizationId,
        platform: challenge.platform,
        publicKey: input.publicKey,
        installationIdHash: challenge.installationIdHash,
        enrolledAt: input.now,
      });
      if (!created.accepted) return domainResult(created);
      await transaction.saveChallenge(context, consumed.value);
      await transaction.saveDevice(context, created.value);
      return created;
    });
  }

  public async get(
    context: IamTenantContextV1,
    deviceIdInput: unknown,
  ): Promise<DeviceIdentityApplicationResultV1<DeviceIdentityV1>> {
    const deviceId = stable(deviceIdInput);
    if (!deviceId) return rejected('INVALID_IDENTIFIER');
    const device = await this.repository.findDevice(context, deviceId);
    return device ? { accepted: true, value: device } : rejected('DEVICE_NOT_FOUND');
  }

  public async list(
    context: IamTenantContextV1,
  ): Promise<DeviceIdentityApplicationResultV1<readonly DeviceIdentityV1[]>> {
    return { accepted: true, value: await this.repository.listDevices(context) };
  }

  public activate(
    context: IamTenantContextV1,
    deviceIdInput: unknown,
    expectedRevision: number,
    at: unknown,
  ): Promise<DeviceIdentityApplicationResultV1<DeviceIdentityV1>> {
    return this.transition(context, deviceIdInput, expectedRevision, 'ACTIVATE', at);
  }

  public revoke(
    context: IamTenantContextV1,
    deviceIdInput: unknown,
    expectedRevision: number,
    at: unknown,
  ): Promise<DeviceIdentityApplicationResultV1<DeviceIdentityV1>> {
    return this.transition(context, deviceIdInput, expectedRevision, 'REVOKE', at);
  }

  public async rotateKey(
    context: IamTenantContextV1,
    deviceIdInput: unknown,
    expectedRevision: number,
    nextPublicKey: unknown,
    at: unknown,
  ): Promise<DeviceIdentityApplicationResultV1<DeviceIdentityV1>> {
    const deviceId = stable(deviceIdInput);
    if (!deviceId) return rejected('INVALID_IDENTIFIER');
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.findDevice(context, deviceId);
      if (!current) return rejected('DEVICE_NOT_FOUND');
      if (current.status === 'REVOKED') return rejected('DEVICE_REVOKED');
      if (current.revision !== expectedRevision) return rejected('REVISION_CONFLICT');
      const rotated = rotateDeviceIdentityKeyV1(current, nextPublicKey, at);
      if (!rotated.accepted) return domainResult(rotated);
      await transaction.replaceDevice(context, rotated.value, expectedRevision);
      return rotated;
    });
  }

  private async transition(
    context: IamTenantContextV1,
    deviceIdInput: unknown,
    expectedRevision: number,
    transition: 'ACTIVATE' | 'REVOKE',
    at: unknown,
  ): Promise<DeviceIdentityApplicationResultV1<DeviceIdentityV1>> {
    const deviceId = stable(deviceIdInput);
    if (!deviceId) return rejected('INVALID_IDENTIFIER');
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.findDevice(context, deviceId);
      if (!current) return rejected('DEVICE_NOT_FOUND');
      if (current.userId !== context.actorId) return rejected('SCOPE_DENIED');
      if (current.revision !== expectedRevision) return rejected('REVISION_CONFLICT');
      if (current.status === 'REVOKED') return rejected('DEVICE_REVOKED');
      const next = transitionDeviceIdentityV1(current, transition, at);
      if (!next.accepted) return domainResult(next);
      await transaction.replaceDevice(context, next.value, expectedRevision);
      return next;
    });
  }
}

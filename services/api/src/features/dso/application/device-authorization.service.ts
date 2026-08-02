import {
  checkOpaqueDeviceGrantV1,
  createAuthorizationSnapshotV1,
  createOpaqueDeviceGrantV1,
  verifyAuthorizationSnapshotV1,
  type AuthorizationSnapshotV1,
  type DeviceAuthorizationResultV1,
  type OpaqueDeviceGrantV1,
  type SnapshotSignerV1,
} from '@databreeze/domain/device-authorization/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { DeviceAuthorizationRepositoryPortV1 } from './device-authorization-repository.port.js';

function rejected<TValue>(
  code: 'INVALID_IDENTIFIER' | 'GRANT_EXPIRED',
): DeviceAuthorizationResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

/** Coordinates signed device snapshots and opaque grants with revocation-aware repository writes. */
export class DeviceAuthorizationService {
  public constructor(private readonly repository: DeviceAuthorizationRepositoryPortV1) {}

  public async issueSnapshot(
    context: IamTenantContextV1,
    input: Parameters<typeof createAuthorizationSnapshotV1>[0],
    signer: SnapshotSignerV1,
  ): Promise<DeviceAuthorizationResultV1<AuthorizationSnapshotV1>> {
    const created = createAuthorizationSnapshotV1(input, signer);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      await transaction.saveSnapshot(context, created.value);
      return created;
    });
  }

  public verifySnapshot(
    snapshot: AuthorizationSnapshotV1,
    input: Parameters<typeof verifyAuthorizationSnapshotV1>[1],
    signer: SnapshotSignerV1,
  ): DeviceAuthorizationResultV1<true> {
    return verifyAuthorizationSnapshotV1(snapshot, input, signer);
  }

  public async issueGrant(
    context: IamTenantContextV1,
    input: Parameters<typeof createOpaqueDeviceGrantV1>[0],
  ): Promise<DeviceAuthorizationResultV1<OpaqueDeviceGrantV1>> {
    const created = createOpaqueDeviceGrantV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      await transaction.saveGrant(context, created.value);
      return created;
    });
  }

  public async checkGrant(
    context: IamTenantContextV1,
    grantIdInput: unknown,
    input: Parameters<typeof checkOpaqueDeviceGrantV1>[1],
  ): Promise<DeviceAuthorizationResultV1<true>> {
    const grantId = stable(grantIdInput);
    if (!grantId) return rejected('INVALID_IDENTIFIER');
    return this.repository.withTransaction(context, async (transaction) => {
      const grant = await transaction.findGrant(context, grantId);
      if (!grant) return rejected('GRANT_EXPIRED');
      return checkOpaqueDeviceGrantV1(grant, input);
    });
  }

  public async revokeGrant(
    context: IamTenantContextV1,
    grantIdInput: unknown,
    expectedRevision: number,
  ): Promise<DeviceAuthorizationResultV1<OpaqueDeviceGrantV1>> {
    const grantId = stable(grantIdInput);
    if (!grantId) return rejected('INVALID_IDENTIFIER');
    return this.repository.withTransaction(context, async (transaction) => {
      const revoked = await transaction.revokeGrant(context, grantId, expectedRevision);
      return revoked
        ? Object.freeze({ accepted: true, value: revoked })
        : rejected('GRANT_EXPIRED');
    });
  }
}

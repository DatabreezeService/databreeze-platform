import { randomUUID } from 'node:crypto';

import {
  acceptEntitlementLeaseV1,
  createEntitlementLeaseV1,
  type EntitlementErrorCodeV1,
  type EntitlementLeaseV1,
  type EntitlementResultV1,
  type LeaseSignatureIssuerV1,
  type LeaseSignatureVerifierV1,
} from '@databreeze/domain/entitlements/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { EntitlementLeaseRepositoryPortV1 } from './entitlement-lease-repository.port.js';
import type { EntitlementRepositoryPortV1 } from './entitlement-repository.port.js';

export const ENTITLEMENT_LEASE_SERVICE = Symbol('ENTITLEMENT_LEASE_SERVICE');

export type EntitlementLeaseClockV1 = () => Date;
export type EntitlementLeaseIdGeneratorV1 = () => string;

export interface EntitlementLeaseSignerV1
  extends LeaseSignatureIssuerV1,
    LeaseSignatureVerifierV1 {}

export type EntitlementLeaseApplicationCodeV1 = EntitlementErrorCodeV1 | 'UNAVAILABLE';

export type EntitlementLeaseApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: EntitlementLeaseApplicationCodeV1 };

export interface IssueEntitlementLeaseInputV1 {
  readonly snapshotId: unknown;
  readonly expiresAt: unknown;
}

export interface VerifyEntitlementLeaseInputV1 {
  readonly leaseId: unknown;
  readonly snapshotRevision: unknown;
  readonly securityEpoch: unknown;
}

function rejected(
  code: EntitlementLeaseApplicationCodeV1,
): EntitlementLeaseApplicationResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stableId(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function clockTimestamp(clock: EntitlementLeaseClockV1): StrictUtcTimestampV1 | undefined {
  try {
    return timestamp(clock().toISOString());
  } catch {
    return undefined;
  }
}

function applicationResult<TValue>(
  result: EntitlementResultV1<TValue>,
): EntitlementLeaseApplicationResultV1<TValue> {
  return result.accepted ? result : rejected(result.code);
}

/** Coordinates immutable entitlement snapshots and signed offline lease persistence. */
export class EntitlementLeaseService {
  public constructor(
    private readonly leaseRepository: EntitlementLeaseRepositoryPortV1,
    private readonly entitlementRepository: EntitlementRepositoryPortV1,
    private readonly signer: EntitlementLeaseSignerV1,
    private readonly clock: EntitlementLeaseClockV1 = () => new Date(),
    private readonly idGenerator: EntitlementLeaseIdGeneratorV1 = () => randomUUID(),
  ) {}

  public async issue(
    context: IamTenantContextV1,
    input: IssueEntitlementLeaseInputV1,
  ): Promise<EntitlementLeaseApplicationResultV1<EntitlementLeaseV1>> {
    const snapshotId = stableId(input.snapshotId);
    const leaseId = stableId(this.idGenerator());
    const issuedAt = clockTimestamp(this.clock);
    if (!snapshotId || !leaseId) return rejected('INVALID_IDENTIFIER');
    if (!issuedAt) return rejected('INVALID_TIMESTAMP');

    const snapshot = await this.entitlementRepository.findSnapshot(context, snapshotId);
    if (!snapshot) return rejected('ENTITLEMENT_NOT_FOUND');
    const issued = createEntitlementLeaseV1(
      snapshot,
      { leaseId, issuedAt, expiresAt: input.expiresAt },
      this.signer,
    );
    if (!issued.accepted) return applicationResult(issued);
    await this.leaseRepository.withTransaction(context, async (transaction) => {
      await transaction.saveLease(context, issued.value);
    });
    return issued;
  }

  public async verify(
    context: IamTenantContextV1,
    input: VerifyEntitlementLeaseInputV1,
  ): Promise<EntitlementLeaseApplicationResultV1<true>> {
    const leaseId = stableId(input.leaseId);
    if (!leaseId) return rejected('INVALID_IDENTIFIER');
    // Verification time is authoritative server state.  Accepting a caller-supplied
    // timestamp would let an otherwise expired lease be replayed by choosing an
    // earlier value, so the application clock is always used here.
    const now = clockTimestamp(this.clock);
    if (!now) return rejected('INVALID_TIMESTAMP');
    const lease = await this.leaseRepository.findLease(context, leaseId);
    if (!lease) return rejected('ENTITLEMENT_NOT_FOUND');
    return applicationResult(
      acceptEntitlementLeaseV1(
        lease,
        {
          now,
          tenantScope: context.tenantScope,
          snapshotRevision: input.snapshotRevision,
          securityEpoch: input.securityEpoch,
        },
        this.signer,
      ),
    );
  }
}

/** Safe composition default when key material or persistence is not configured. */
export class UnavailableEntitlementLeaseService {
  public issue(
    context: IamTenantContextV1,
    input: IssueEntitlementLeaseInputV1,
  ): Promise<EntitlementLeaseApplicationResultV1<EntitlementLeaseV1>> {
    void context;
    void input;
    return Promise.resolve(rejected('UNAVAILABLE'));
  }

  public verify(
    context: IamTenantContextV1,
    input: VerifyEntitlementLeaseInputV1,
  ): Promise<EntitlementLeaseApplicationResultV1<true>> {
    void context;
    void input;
    return Promise.resolve(rejected('UNAVAILABLE'));
  }
}

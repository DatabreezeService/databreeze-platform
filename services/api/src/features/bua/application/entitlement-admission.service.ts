import {
  evaluateEntitlementV1,
  finalizeUsageV1,
  releaseUsageV1,
  reserveUsageV1,
  type EntitlementErrorCodeV1,
  type EntitlementResultV1,
  type EntitlementSnapshotV1,
  type UsageLedgerStateV1,
  type UsageReservationV1,
} from '@databreeze/domain/entitlements/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { EntitlementRepositoryPortV1 } from './entitlement-repository.port.js';

export interface EntitlementAdmissionInputV1 {
  readonly snapshotId: unknown;
  readonly feature: unknown;
  readonly reservationId: unknown;
  readonly entryId: unknown;
  readonly tenantScope: unknown;
  readonly metric: unknown;
  readonly requestedUnits: unknown;
  readonly idempotencyKey: unknown;
  readonly now: unknown;
}

interface EntitlementSettlementCommonInputV1 {
  readonly reservationId: unknown;
  readonly releaseEntryId: unknown;
  readonly now: unknown;
  readonly idempotencyKey: unknown;
}

export interface EntitlementFinalizeInputV1 extends EntitlementSettlementCommonInputV1 {
  readonly commitEntryId: unknown;
  readonly committedUnits: unknown;
}

export interface EntitlementReleaseInputV1 extends EntitlementSettlementCommonInputV1 {}

export interface EntitlementAdmissionValueV1 {
  readonly snapshot: EntitlementSnapshotV1;
  readonly state: UsageLedgerStateV1;
  readonly reservation: UsageReservationV1;
}

function rejected(code: EntitlementErrorCodeV1): EntitlementResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function snapshotId(input: unknown) {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

/** Coordinates BUA policy evaluation and append-only usage mutations in one transaction. */
export class EntitlementAdmissionService {
  public constructor(private readonly repository: EntitlementRepositoryPortV1) {}

  public async admit(
    context: IamTenantContextV1,
    input: EntitlementAdmissionInputV1,
  ): Promise<EntitlementResultV1<EntitlementAdmissionValueV1>> {
    const parsedSnapshotId = snapshotId(input.snapshotId);
    if (!parsedSnapshotId) return rejected('INVALID_IDENTIFIER');
    return this.repository.withTransaction(context, async (transaction) => {
      const snapshot = await transaction.findSnapshot(context, parsedSnapshotId);
      if (!snapshot) return rejected('ENTITLEMENT_NOT_FOUND');
      const granted = evaluateEntitlementV1(snapshot, input.now, input.feature);
      if (!granted.accepted) return granted;
      const current = await transaction.listUsageState(context);
      const reserved = reserveUsageV1(snapshot, current, input);
      if (!reserved.accepted) return reserved;
      await transaction.persistUsageState(context, reserved.value.state);
      return Object.freeze({
        accepted: true,
        value: Object.freeze({
          snapshot,
          state: reserved.value.state,
          reservation: reserved.value.reservation,
        }),
      });
    });
  }

  public async finalize(
    context: IamTenantContextV1,
    input: EntitlementFinalizeInputV1,
  ): Promise<EntitlementResultV1<UsageLedgerStateV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const state = await transaction.listUsageState(context);
      const result = finalizeUsageV1(state, input);
      if (!result.accepted) return result;
      await transaction.persistUsageState(context, result.value);
      return result;
    });
  }

  public async release(
    context: IamTenantContextV1,
    input: EntitlementReleaseInputV1,
  ): Promise<EntitlementResultV1<UsageLedgerStateV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const state = await transaction.listUsageState(context);
      const result = releaseUsageV1(state, input);
      if (!result.accepted) return result;
      await transaction.persistUsageState(context, result.value);
      return result;
    });
  }
}

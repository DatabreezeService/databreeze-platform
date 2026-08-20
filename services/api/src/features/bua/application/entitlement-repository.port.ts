import type {
  EntitlementPlanV1,
  EntitlementSnapshotV1,
  UsageLedgerStateV1,
} from '@databreeze/domain/entitlements/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const ENTITLEMENT_REPOSITORY_PORT = Symbol('ENTITLEMENT_REPOSITORY_PORT');

export interface EntitlementTransactionPortV1 {
  savePlan(plan: EntitlementPlanV1): Promise<void>;
  findPlan(planCode: EntitlementPlanV1['planCode']): Promise<EntitlementPlanV1 | undefined>;
  saveSnapshot(context: IamTenantContextV1, snapshot: EntitlementSnapshotV1): Promise<void>;
  findSnapshot(
    context: IamTenantContextV1,
    snapshotId: EntitlementSnapshotV1['snapshotId'],
  ): Promise<EntitlementSnapshotV1 | undefined>;
  findCurrentSnapshot(context: IamTenantContextV1): Promise<EntitlementSnapshotV1 | undefined>;
  listUsageState(context: IamTenantContextV1): Promise<UsageLedgerStateV1>;
  persistUsageState(context: IamTenantContextV1, state: UsageLedgerStateV1): Promise<void>;
}

export interface EntitlementRepositoryPortV1 extends EntitlementTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: EntitlementTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

import type { UsageMetricV1 } from '@databreeze/domain/entitlements/v1';
import type {
  StableIdentifierV1,
  StrictUtcTimestampV1,
  TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export type ResultUsageSettlementFormulaV1 = 'COMMITTED_OUTPUT_BYTES' | 'SUCCESSFUL_JOB_UNIT';
export type ResultUsageSettlementStateV1 = 'PREPARED' | 'SETTLED' | 'RELEASED';

/** BUA-023: immutable authority created by server-owned admission, never by completion. */
export interface ResultUsageSettlementBindingV1 {
  readonly schemaVersion: 1;
  readonly bindingId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly jobId: StableIdentifierV1;
  readonly reservationId: StableIdentifierV1;
  readonly meter: UsageMetricV1;
  readonly settlementFormula: ResultUsageSettlementFormulaV1;
  readonly maximumAdmittedUnits: number;
  readonly entitlementDecisionSubjectHash: string;
  readonly admissionIdempotencyKey: string;
  readonly state: ResultUsageSettlementStateV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly revision: number;
}

export interface ResultUsageSettlementBindingTransactionPortV1 {
  save(context: IamTenantContextV1, binding: ResultUsageSettlementBindingV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    bindingId: StableIdentifierV1,
  ): Promise<ResultUsageSettlementBindingV1 | undefined>;
  markSettled(
    context: IamTenantContextV1,
    bindingId: StableIdentifierV1,
    expectedRevision: number,
  ): Promise<ResultUsageSettlementBindingV1>;
}

export interface ResultUsageSettlementBindingRepositoryPortV1
  extends ResultUsageSettlementBindingTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ResultUsageSettlementBindingTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

export const RESULT_USAGE_SETTLEMENT_BINDING_REPOSITORY_PORT = Symbol(
  'RESULT_USAGE_SETTLEMENT_BINDING_REPOSITORY_PORT',
);

/** Admission coordinators receive this narrow persistence participant; it creates no reservation. */
export interface ResultUsageSettlementAdmissionParticipantV1 {
  persist(
    transaction: unknown,
    context: IamTenantContextV1,
    binding: ResultUsageSettlementBindingV1,
  ): Promise<void>;
}

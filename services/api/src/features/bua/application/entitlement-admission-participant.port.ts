import type { EntitlementResultV1 } from '@databreeze/domain/entitlements/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  EntitlementAdmissionInputV1,
  EntitlementAdmissionValueV1,
} from './entitlement-admission.service.js';
import type { ResultUsageSettlementBindingV1 } from './result-usage-settlement-binding.port.js';

export interface EntitlementAdmissionParticipantInputV1 {
  readonly entitlement: EntitlementAdmissionInputV1;
  /** Server-authored binding; callers must not derive these values from browser input. */
  readonly binding: ResultUsageSettlementBindingV1;
}

export type EntitlementAdmissionParticipantResultV1 = EntitlementResultV1<
  EntitlementAdmissionValueV1 & { readonly binding: ResultUsageSettlementBindingV1 }
>;

/**
 * BUA-023/JRA-032: reserve usage and persist its settlement binding on an owner transaction.
 * The raw transaction is deliberately opaque to callers; only root-composed adapters may
 * translate it into feature transaction ports.
 */
export interface EntitlementAdmissionParticipantV1 {
  admit(
    transaction: unknown,
    context: IamTenantContextV1,
    input: EntitlementAdmissionParticipantInputV1,
  ): Promise<EntitlementAdmissionParticipantResultV1>;
}

export const ENTITLEMENT_ADMISSION_PARTICIPANT = Symbol('ENTITLEMENT_ADMISSION_PARTICIPANT');

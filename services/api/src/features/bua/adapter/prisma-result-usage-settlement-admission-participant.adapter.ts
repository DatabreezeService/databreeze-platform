import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import {
  resultUsageSettlementBindingTransactionForDatabase,
  type ResultUsageSettlementBindingDatabaseClientV1,
} from './prisma-result-usage-settlement-binding-repository.adapter.js';
import type {
  ResultUsageSettlementAdmissionParticipantV1,
  ResultUsageSettlementBindingV1,
} from '../application/result-usage-settlement-binding.port.js';

function settlementDatabase(transaction: unknown): ResultUsageSettlementBindingDatabaseClientV1 {
  if (
    typeof transaction !== 'object' ||
    transaction === null ||
    !('resultUsageSettlementBindingRecord' in transaction)
  )
    throw new Error('BUA_RESULT_USAGE_SETTLEMENT_TRANSACTION_UNAVAILABLE');
  return transaction as ResultUsageSettlementBindingDatabaseClientV1;
}

/** BUA-023 admission seam. It persists authority supplied by the coordinator and creates nothing. */
export class PrismaResultUsageSettlementAdmissionParticipant
  implements ResultUsageSettlementAdmissionParticipantV1
{
  public persist(
    transaction: unknown,
    context: IamTenantContextV1,
    binding: ResultUsageSettlementBindingV1,
  ): Promise<void> {
    return resultUsageSettlementBindingTransactionForDatabase(settlementDatabase(transaction)).save(
      context,
      binding,
    );
  }
}

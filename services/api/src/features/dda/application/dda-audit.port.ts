import type { DdaAuditSummaryV1 } from '@databreeze/domain/data-to-dashboard/policy-v1';

/** DDA-045: DDA emits content-safe summaries to AUD; it is not a second ledger. */
export const DDA_AUDIT_PORT = Symbol('DDA_AUDIT_PORT');

export interface DdaAuditPortV1 {
  emitContentSafeSummary(summary: DdaAuditSummaryV1): Promise<void>;
}

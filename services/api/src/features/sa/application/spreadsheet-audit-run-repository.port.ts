import type { SpreadsheetAuditRunV1 } from '@databreeze/domain/spreadsheet-audit-run/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const SPREADSHEET_AUDIT_RUN_REPOSITORY_PORT = Symbol(
  'SPREADSHEET_AUDIT_RUN_REPOSITORY_PORT',
);

export interface SpreadsheetAuditRunTransactionPortV1 {
  save(context: IamTenantContextV1, run: SpreadsheetAuditRunV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    runId: SpreadsheetAuditRunV1['runId'],
  ): Promise<SpreadsheetAuditRunV1 | undefined>;
  findByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<SpreadsheetAuditRunV1 | undefined>;
}

export interface SpreadsheetAuditRunRepositoryPortV1 extends SpreadsheetAuditRunTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: SpreadsheetAuditRunTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

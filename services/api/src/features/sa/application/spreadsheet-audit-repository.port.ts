import type { SpreadsheetAuditResultV1 } from '@databreeze/domain/spreadsheet-audit/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const SPREADSHEET_AUDIT_REPOSITORY_PORT = Symbol('SPREADSHEET_AUDIT_REPOSITORY_PORT');

export interface SpreadsheetAuditTransactionPortV1 {
  save(context: IamTenantContextV1, result: SpreadsheetAuditResultV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    auditId: SpreadsheetAuditResultV1['auditId'],
  ): Promise<SpreadsheetAuditResultV1 | undefined>;
  list(
    context: IamTenantContextV1,
    artifactVersionId: SpreadsheetAuditResultV1['artifactVersionId'],
  ): Promise<readonly SpreadsheetAuditResultV1[]>;
}

export interface SpreadsheetAuditRepositoryPortV1 extends SpreadsheetAuditTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: SpreadsheetAuditTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

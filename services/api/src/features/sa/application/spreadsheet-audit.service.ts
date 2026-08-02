import {
  createSpreadsheetAuditResultV1,
  type SpreadsheetAuditResultValidationV1,
  type SpreadsheetAuditResultV1,
} from '@databreeze/domain/spreadsheet-audit/v1';
import { parseStableIdentifierV1, tenantScopeContainsV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { SpreadsheetAuditRepositoryPortV1 } from './spreadsheet-audit-repository.port.js';

export type SpreadsheetAuditServiceErrorV1 =
  | 'AUDIT_NOT_FOUND'
  | 'AUDIT_SCOPE_NARROWING_REQUIRED'
  | 'INVALID_IDENTIFIER';

export type SpreadsheetAuditServiceResultV1<TValue> =
  | SpreadsheetAuditResultValidationV1<TValue>
  | { readonly accepted: false; readonly code: SpreadsheetAuditServiceErrorV1 };

/** Coordinates immutable, value-free spreadsheet audit results. */
export class SpreadsheetAuditService {
  public constructor(private readonly repository: SpreadsheetAuditRepositoryPortV1) {}

  public async register(
    context: IamTenantContextV1,
    input: Parameters<typeof createSpreadsheetAuditResultV1>[0],
  ): Promise<SpreadsheetAuditServiceResultV1<SpreadsheetAuditResultV1>> {
    const created = createSpreadsheetAuditResultV1(input);
    if (!created.accepted) return created;
    if (!tenantScopeContainsV1(context.tenantScope, created.value.tenantScope))
      return Object.freeze({ accepted: false, code: 'AUDIT_SCOPE_NARROWING_REQUIRED' as const });
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, created.value.auditId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value))
          return Object.freeze({ accepted: true, value: existing });
        throw new Error('SA_IMMUTABLE_AUDIT_RESULT');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async find(
    context: IamTenantContextV1,
    auditIdInput: unknown,
  ): Promise<SpreadsheetAuditServiceResultV1<SpreadsheetAuditResultV1>> {
    const auditId = parseStableIdentifierV1(auditIdInput);
    if (!auditId.accepted)
      return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
    const found = await this.repository.find(context, auditId.value);
    return found
      ? Object.freeze({ accepted: true, value: found })
      : Object.freeze({ accepted: false, code: 'AUDIT_NOT_FOUND' as const });
  }

  public async list(
    context: IamTenantContextV1,
    artifactVersionIdInput: unknown,
  ): Promise<SpreadsheetAuditServiceResultV1<readonly SpreadsheetAuditResultV1[]>> {
    const artifactVersionId = parseStableIdentifierV1(artifactVersionIdInput);
    if (!artifactVersionId.accepted)
      return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
    return Object.freeze({
      accepted: true,
      value: await this.repository.list(context, artifactVersionId.value),
    });
  }
}

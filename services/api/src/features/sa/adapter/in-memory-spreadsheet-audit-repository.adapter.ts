import { tenantScopeContainsV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type { SpreadsheetAuditResultV1 } from '@databreeze/domain/spreadsheet-audit/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  SpreadsheetAuditRepositoryPortV1,
  SpreadsheetAuditTransactionPortV1,
} from '../application/spreadsheet-audit-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function clone(result: SpreadsheetAuditResultV1): SpreadsheetAuditResultV1 {
  return Object.freeze({
    ...result,
    tenantScope: Object.freeze({ ...result.tenantScope }),
    sheets: Object.freeze(result.sheets.map((sheet) => Object.freeze({ ...sheet }))),
    findings: Object.freeze(result.findings.map((finding) => Object.freeze({ ...finding }))),
    blockedReasons: Object.freeze([...result.blockedReasons]),
  });
}

export class InMemorySpreadsheetAuditRepositoryAdapter implements SpreadsheetAuditRepositoryPortV1 {
  private results = new Map<string, SpreadsheetAuditResultV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, result: SpreadsheetAuditResultV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, result.tenantScope))
      throw new Error('SA_SCOPE_NARROWING_REQUIRED');
    const existing = this.results.get(result.auditId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(result))
      throw new Error('SA_IMMUTABLE_AUDIT_RESULT');
    this.results.set(result.auditId, clone(result));
  }

  public async find(
    context: IamTenantContextV1,
    auditId: SpreadsheetAuditResultV1['auditId'],
  ): Promise<SpreadsheetAuditResultV1 | undefined> {
    await Promise.resolve();
    const result = this.results.get(auditId);
    return result && visible(context.tenantScope, result.tenantScope) ? clone(result) : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    artifactVersionId: SpreadsheetAuditResultV1['artifactVersionId'],
  ): Promise<readonly SpreadsheetAuditResultV1[]> {
    await Promise.resolve();
    return [...this.results.values()]
      .filter(
        (result) =>
          result.artifactVersionId === artifactVersionId &&
          visible(context.tenantScope, result.tenantScope),
      )
      .sort((left, right) => left.auditId.localeCompare(right.auditId))
      .map(clone);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: SpreadsheetAuditTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.results);
    try {
      return await work({
        save: this.save.bind(this),
        find: this.find.bind(this),
        list: this.list.bind(this),
      });
    } catch (error) {
      this.results = before;
      throw error;
    } finally {
      release();
    }
  }
}

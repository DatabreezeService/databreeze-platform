import {
  tenantScopeContainsV1,
  tenantScopeKeyV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { SpreadsheetAuditRunV1 } from '@databreeze/domain/spreadsheet-audit-run/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  SpreadsheetAuditRunRepositoryPortV1,
  SpreadsheetAuditRunTransactionPortV1,
} from '../application/spreadsheet-audit-run-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate);
}

function clone(run: SpreadsheetAuditRunV1): SpreadsheetAuditRunV1 {
  return Object.freeze({
    ...run,
    tenantScope: Object.freeze({ ...run.tenantScope }),
  });
}

/** In-memory adapter for tests and local composition; production uses the JRA-owned store. */
export class InMemorySpreadsheetAuditRunRepositoryAdapter
  implements SpreadsheetAuditRunRepositoryPortV1
{
  private runs = new Map<string, SpreadsheetAuditRunV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  private saveUnlocked(context: IamTenantContextV1, run: SpreadsheetAuditRunV1): Promise<void> {
    if (tenantScopeKeyV1(context.tenantScope) !== tenantScopeKeyV1(run.tenantScope))
      throw new Error('SA_RUN_SCOPE_REQUIRED');
    const existing = this.runs.get(run.runId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(run))
      throw new Error('SA_RUN_IMMUTABLE');
    this.runs.set(run.runId, clone(run));
    return Promise.resolve();
  }

  public save(context: IamTenantContextV1, run: SpreadsheetAuditRunV1): Promise<void> {
    return this.withTransaction(context, (transaction) => transaction.save(context, run));
  }

  private findUnlocked(
    context: IamTenantContextV1,
    runId: SpreadsheetAuditRunV1['runId'],
  ): Promise<SpreadsheetAuditRunV1 | undefined> {
    const run = this.runs.get(runId);
    return Promise.resolve(
      run && visible(context.tenantScope, run.tenantScope) ? clone(run) : undefined,
    );
  }

  public find(
    context: IamTenantContextV1,
    runId: SpreadsheetAuditRunV1['runId'],
  ): Promise<SpreadsheetAuditRunV1 | undefined> {
    return this.findUnlocked(context, runId);
  }

  private findByIdempotencyUnlocked(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<SpreadsheetAuditRunV1 | undefined> {
    for (const run of this.runs.values()) {
      if (
        run.idempotencyKey === idempotencyKey &&
        tenantScopeKeyV1(run.tenantScope) === tenantScopeKeyV1(context.tenantScope)
      )
        return Promise.resolve(clone(run));
    }
    return Promise.resolve(undefined);
  }

  public findByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<SpreadsheetAuditRunV1 | undefined> {
    return this.findByIdempotencyUnlocked(context, idempotencyKey);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: SpreadsheetAuditRunTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.runs);
    try {
      return await work({
        save: this.saveUnlocked.bind(this),
        find: this.findUnlocked.bind(this),
        findByIdempotency: this.findByIdempotencyUnlocked.bind(this),
      });
    } catch (error) {
      this.runs = before;
      throw error;
    } finally {
      release();
    }
  }
}

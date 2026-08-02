import {
  tenantScopeContainsV1,
  type FindingV1,
  type ReviewTaskV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  FindingRepositoryPortV1,
  FindingTransactionPortV1,
} from '../application/finding-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function mutable(context: IamTenantContextV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, candidate);
}

function cloneFinding(finding: FindingV1): FindingV1 {
  return Object.freeze({
    ...finding,
    tenantScope: Object.freeze({ ...finding.tenantScope }),
    evidenceReferences: Object.freeze([...finding.evidenceReferences]),
  });
}

function cloneTask(task: ReviewTaskV1): ReviewTaskV1 {
  return Object.freeze({ ...task, tenantScope: Object.freeze({ ...task.tenantScope }) });
}

/** In-memory JRA finding/review adapter with tenant isolation and optimistic revisions. */
export class InMemoryFindingRepositoryAdapter implements FindingRepositoryPortV1 {
  private findings = new Map<string, FindingV1>();
  private tasks = new Map<string, ReviewTaskV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  private async saveFinding(context: IamTenantContextV1, finding: FindingV1): Promise<void> {
    await Promise.resolve();
    if (!mutable(context, finding.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.findings.get(finding.findingId);
    if (existing && JSON.stringify(existing) === JSON.stringify(finding)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_FINDING');
    this.findings.set(finding.findingId, cloneFinding(finding));
  }

  private async findFinding(
    context: IamTenantContextV1,
    findingId: StableIdentifierV1,
  ): Promise<FindingV1 | undefined> {
    await Promise.resolve();
    const finding = this.findings.get(findingId);
    return finding && visible(context.tenantScope, finding.tenantScope)
      ? cloneFinding(finding)
      : undefined;
  }

  private async updateFinding(
    context: IamTenantContextV1,
    finding: FindingV1,
    expectedRevision: number,
  ): Promise<FindingV1 | undefined> {
    await Promise.resolve();
    if (!mutable(context, finding.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.findings.get(finding.findingId);
    if (!existing || existing.revision !== expectedRevision) return undefined;
    if (
      existing.fingerprint !== finding.fingerprint ||
      existing.diagnosticDetailRef !== finding.diagnosticDetailRef ||
      JSON.stringify(existing.tenantScope) !== JSON.stringify(finding.tenantScope)
    )
      throw new Error('JRA_IMMUTABLE_FINDING');
    this.findings.set(finding.findingId, cloneFinding(finding));
    return cloneFinding(finding);
  }

  private async saveReviewTask(context: IamTenantContextV1, task: ReviewTaskV1): Promise<void> {
    await Promise.resolve();
    if (!mutable(context, task.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.tasks.get(task.reviewTaskId);
    if (existing && JSON.stringify(existing) === JSON.stringify(task)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_REVIEW_TASK');
    this.tasks.set(task.reviewTaskId, cloneTask(task));
  }

  private async findReviewTask(
    context: IamTenantContextV1,
    reviewTaskId: StableIdentifierV1,
  ): Promise<ReviewTaskV1 | undefined> {
    await Promise.resolve();
    const task = this.tasks.get(reviewTaskId);
    return task && visible(context.tenantScope, task.tenantScope) ? cloneTask(task) : undefined;
  }

  private async updateReviewTask(
    context: IamTenantContextV1,
    task: ReviewTaskV1,
    expectedRevision: number,
  ): Promise<ReviewTaskV1 | undefined> {
    await Promise.resolve();
    if (!mutable(context, task.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.tasks.get(task.reviewTaskId);
    if (!existing || existing.revision !== expectedRevision) return undefined;
    if (
      existing.findingId !== task.findingId ||
      JSON.stringify(existing.tenantScope) !== JSON.stringify(task.tenantScope)
    )
      throw new Error('JRA_IMMUTABLE_REVIEW_TASK');
    this.tasks.set(task.reviewTaskId, cloneTask(task));
    return cloneTask(task);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: FindingTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = { findings: new Map(this.findings), tasks: new Map(this.tasks) };
    try {
      return await work({
        saveFinding: this.saveFinding.bind(this),
        findFinding: this.findFinding.bind(this),
        updateFinding: this.updateFinding.bind(this),
        saveReviewTask: this.saveReviewTask.bind(this),
        findReviewTask: this.findReviewTask.bind(this),
        updateReviewTask: this.updateReviewTask.bind(this),
      });
    } catch (error) {
      this.findings = before.findings;
      this.tasks = before.tasks;
      throw error;
    } finally {
      release();
    }
  }
}

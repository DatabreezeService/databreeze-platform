import {
  tenantScopesEqualV1,
  type ApprovalDecisionRecordV1,
  type ApprovalPolicyV1,
  type ApprovalRequestV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ApprovalRequestSearchV1,
  ApprovalRepositoryPortV1,
  ApprovalTransactionPortV1,
} from '../application/approval-repository.port.js';

function scopeForRequest(request: ApprovalRequestV1): TenantScopeV1 {
  return request.tenantScope;
}

function mutable(context: IamTenantContextV1, candidate: TenantScopeV1): boolean {
  return tenantScopesEqualV1(context.tenantScope, candidate);
}

function clonePolicy(policy: ApprovalPolicyV1): ApprovalPolicyV1 {
  return Object.freeze({
    ...policy,
    actionMatcher: Object.freeze({ ...policy.actionMatcher }),
    eligibleRoles: Object.freeze([...policy.eligibleRoles]),
  });
}

function cloneRequest(request: ApprovalRequestV1): ApprovalRequestV1 {
  return Object.freeze({ ...request, tenantScope: Object.freeze({ ...request.tenantScope }) });
}

function cloneDecision(decision: ApprovalDecisionRecordV1): ApprovalDecisionRecordV1 {
  return Object.freeze({ ...decision });
}

/** In-memory approval adapter with tenant visibility and optimistic request revisions. */
export class InMemoryApprovalRepositoryAdapter implements ApprovalRepositoryPortV1 {
  private policies = new Map<string, ApprovalPolicyV1>();
  private requests = new Map<string, ApprovalRequestV1>();
  private decisions = new Map<string, ApprovalDecisionRecordV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async savePolicy(context: IamTenantContextV1, policy: ApprovalPolicyV1): Promise<void> {
    await Promise.resolve();
    if (
      context.tenantScope.scopeType !== 'workspace' ||
      context.tenantScope.workspaceId !== policy.workspaceId
    )
      throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const key = `${context.tenantScope.organizationId}:${policy.workspaceId}:${policy.policyId}:${policy.version}`;
    const existing = this.policies.get(key);
    if (existing && JSON.stringify(existing) === JSON.stringify(policy)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_POLICY');
    this.policies.set(key, clonePolicy(policy));
  }

  public async findPolicy(
    context: IamTenantContextV1,
    policyId: StableIdentifierV1,
    version: number,
  ): Promise<ApprovalPolicyV1 | undefined> {
    await Promise.resolve();
    if (context.tenantScope.scopeType === 'organization') return undefined;
    const policy = this.policies.get(
      `${context.tenantScope.organizationId}:${context.tenantScope.workspaceId}:${policyId}:${version}`,
    );
    return policy &&
      (context.tenantScope.scopeType === 'workspace' ||
        context.tenantScope.scopeType === 'project') &&
      context.tenantScope.workspaceId === policy.workspaceId
      ? clonePolicy(policy)
      : undefined;
  }

  public async saveRequest(context: IamTenantContextV1, request: ApprovalRequestV1): Promise<void> {
    await Promise.resolve();
    if (!mutable(context, request.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.requests.get(request.requestId);
    if (existing && JSON.stringify(existing) === JSON.stringify(request)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_REQUEST');
    this.requests.set(request.requestId, cloneRequest(request));
  }

  public async findRequest(
    context: IamTenantContextV1,
    requestId: StableIdentifierV1,
  ): Promise<ApprovalRequestV1 | undefined> {
    await Promise.resolve();
    const request = this.requests.get(requestId);
    return request && tenantScopesEqualV1(context.tenantScope, scopeForRequest(request))
      ? cloneRequest(request)
      : undefined;
  }

  public async findRequests(
    context: IamTenantContextV1,
    search: ApprovalRequestSearchV1 = {},
  ): Promise<readonly ApprovalRequestV1[]> {
    await Promise.resolve();
    return [...this.requests.values()]
      .filter(
        (request) =>
          tenantScopesEqualV1(context.tenantScope, request.tenantScope) &&
          (search.subjectType === undefined || request.subjectType === search.subjectType) &&
          (search.subjectId === undefined || request.subjectId === search.subjectId) &&
          (search.subjectHash === undefined || request.subjectHash === search.subjectHash) &&
          (search.requestedAction === undefined ||
            request.requestedAction === search.requestedAction) &&
          (search.statuses === undefined || search.statuses.includes(request.status)),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(cloneRequest);
  }

  public async updateRequest(
    context: IamTenantContextV1,
    request: ApprovalRequestV1,
    expectedRevision: number,
  ): Promise<ApprovalRequestV1 | undefined> {
    await Promise.resolve();
    if (!mutable(context, request.tenantScope)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    if (request.revision !== expectedRevision + 1) throw new Error('JRA_REVISION_INVALID');
    const existing = this.requests.get(request.requestId);
    if (!existing || existing.revision !== expectedRevision) return undefined;
    if (
      JSON.stringify(existing.tenantScope) !== JSON.stringify(request.tenantScope) ||
      existing.subjectType !== request.subjectType ||
      existing.subjectId !== request.subjectId ||
      existing.subjectVersion !== request.subjectVersion ||
      existing.subjectHash !== request.subjectHash ||
      existing.requestedAction !== request.requestedAction ||
      existing.policyId !== request.policyId ||
      existing.policyVersion !== request.policyVersion ||
      existing.requestedBy !== request.requestedBy ||
      existing.createdAt !== request.createdAt ||
      existing.dueAt !== request.dueAt
    )
      throw new Error('JRA_IMMUTABLE_REQUEST');
    this.requests.set(request.requestId, cloneRequest(request));
    return cloneRequest(request);
  }

  public async saveDecision(
    context: IamTenantContextV1,
    decision: ApprovalDecisionRecordV1,
  ): Promise<void> {
    await Promise.resolve();
    const request = this.requests.get(decision.requestId);
    if (!request || !mutable(context, request.tenantScope))
      throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.decisions.get(decision.decisionId);
    if (existing && JSON.stringify(existing) === JSON.stringify(decision)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_DECISION');
    const actorDuplicate = [...this.decisions.values()].find(
      (candidate) =>
        candidate.requestId === decision.requestId && candidate.actorId === decision.actorId,
    );
    if (actorDuplicate) throw new Error('JRA_DUPLICATE_DECISION');
    this.decisions.set(decision.decisionId, cloneDecision(decision));
  }

  public async listDecisions(
    context: IamTenantContextV1,
    requestId: StableIdentifierV1,
  ): Promise<readonly ApprovalDecisionRecordV1[]> {
    await Promise.resolve();
    const request = this.requests.get(requestId);
    if (!request || !tenantScopesEqualV1(context.tenantScope, request.tenantScope)) return [];
    return [...this.decisions.values()]
      .filter((decision) => decision.requestId === requestId)
      .map(cloneDecision);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ApprovalTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = {
      policies: new Map(this.policies),
      requests: new Map(this.requests),
      decisions: new Map(this.decisions),
    };
    try {
      return await work({
        savePolicy: this.savePolicy.bind(this),
        findPolicy: this.findPolicy.bind(this),
        saveRequest: this.saveRequest.bind(this),
        findRequest: this.findRequest.bind(this),
        findRequests: this.findRequests.bind(this),
        updateRequest: this.updateRequest.bind(this),
        saveDecision: this.saveDecision.bind(this),
        listDecisions: this.listDecisions.bind(this),
      });
    } catch (error) {
      this.policies = before.policies;
      this.requests = before.requests;
      this.decisions = before.decisions;
      throw error;
    } finally {
      release();
    }
  }
}

import {
  applyApprovalDecisionV1,
  createApprovalDecisionV1,
  createApprovalPolicyV1,
  createApprovalRequestV1,
  type ApprovalPolicyV1,
  type ApprovalRequestV1,
  type ApprovalResultV1,
  type ApprovalDecisionRecordV1,
} from '@databreeze/domain/approval/v1';
import type { StableIdentifierV1, TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import { createIamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ApprovalRepositoryPortV1 } from './approval-repository.port.js';
import type {
  JraApprovalAuthorityLookupV1,
  JraApprovalAuthorityPortV1,
} from './approval-authority.port.js';

function rejected<TValue>(
  code:
    | 'INVALID_IDENTIFIER'
    | 'INVALID_ROLE'
    | 'REQUEST_NOT_OPEN'
    | 'SUBJECT_HASH_MISMATCH'
    | 'MFA_REENROLLMENT_REQUIRED',
): ApprovalResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

/** Coordinates canonical JRA approval policy, request, and decision records. */
export class ApprovalService implements JraApprovalAuthorityPortV1 {
  public constructor(
    private readonly repository: ApprovalRepositoryPortV1,
    private readonly options: { readonly clock?: () => Date } = {},
  ) {}

  public async publishPolicy(
    context: IamTenantContextV1,
    input: Parameters<typeof createApprovalPolicyV1>[0],
  ): Promise<ApprovalResultV1<ApprovalPolicyV1>> {
    const created = createApprovalPolicyV1(input);
    if (!created.accepted) return created;
    if (
      context.tenantScope.scopeType !== 'workspace' ||
      created.value.workspaceId !== context.tenantScope.workspaceId
    )
      return rejected('INVALID_IDENTIFIER');
    return this.repository.withTransaction(context, async (transaction) => {
      await transaction.savePolicy(context, created.value);
      return created;
    });
  }

  public async openRequest(
    context: IamTenantContextV1,
    input: Parameters<typeof createApprovalRequestV1>[0],
  ): Promise<ApprovalResultV1<ApprovalRequestV1>> {
    const created = createApprovalRequestV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const policy = await transaction.findPolicy(
        context,
        created.value.policyId,
        created.value.policyVersion,
      );
      if (!policy || policy.status !== 'ACTIVE') return rejected('INVALID_IDENTIFIER');
      const policyDueAt = policyExpiry(created.value.createdAt, policy);
      const dueAt =
        created.value.dueAt === undefined ||
        Date.parse(created.value.dueAt) > Date.parse(policyDueAt)
          ? policyDueAt
          : created.value.dueAt;
      const withExpiry = createApprovalRequestV1({ ...input, dueAt });
      if (!withExpiry.accepted) return withExpiry;
      await transaction.saveRequest(context, withExpiry.value);
      return withExpiry;
    });
  }

  public async decide(
    context: IamTenantContextV1,
    input: Omit<
      Parameters<typeof createApprovalDecisionV1>[0],
      'request' | 'selfApprovalAllowed' | 'requireMfa'
    > & {
      readonly requestId: StableIdentifierV1;
    },
  ): Promise<
    ApprovalResultV1<{
      readonly request: ApprovalRequestV1;
      readonly decision: ApprovalDecisionRecordV1;
    }>
  > {
    if (context.mfaReenrollmentRequired === true) return rejected('MFA_REENROLLMENT_REQUIRED');
    return this.repository.withTransaction(context, async (transaction) => {
      const request = await transaction.findRequest(context, input.requestId);
      if (!request) return rejected('INVALID_IDENTIFIER');
      const policy = await transaction.findPolicy(context, request.policyId, request.policyVersion);
      if (!policy) return rejected('INVALID_IDENTIFIER');
      const decidedAt = typeof input.decidedAt === 'string' ? input.decidedAt : '';
      const dueAt = effectiveDueAt(request, policy);
      if (Date.parse(dueAt) <= Date.parse(decidedAt)) {
        const expired = await transaction.updateRequest(
          context,
          { ...request, status: 'EXPIRED', revision: request.revision + 1 },
          request.revision,
        );
        return expired === undefined ? rejected('REQUEST_NOT_OPEN') : rejected('REQUEST_NOT_OPEN');
      }
      if (!policy.eligibleRoles.includes(String(input.actorRole))) return rejected('INVALID_ROLE');
      const decision = createApprovalDecisionV1({
        ...input,
        request,
        selfApprovalAllowed: policy.selfApprovalAllowed,
        requireMfa: policy.requireMfa,
      });
      if (!decision.accepted) return decision;
      const existing = await transaction.listDecisions(context, request.requestId);
      const approvedCount =
        existing.filter((item) => item.decision === 'APPROVE').length +
        (decision.value.decision === 'APPROVE' ? 1 : 0);
      const updated = applyApprovalDecisionV1(
        request,
        decision.value,
        approvedCount,
        policy.minimumApprovals,
      );
      if (!updated.accepted) return updated;
      await transaction.saveDecision(context, decision.value);
      const stored = await transaction.updateRequest(context, updated.value, request.revision);
      if (!stored) return rejected('REQUEST_NOT_OPEN');
      return Object.freeze({
        accepted: true,
        value: Object.freeze({ request: stored, decision: decision.value }),
      });
    });
  }

  public async findCurrentApproved(input: {
    readonly tenantScope: TenantScopeV1;
    readonly subjectType: string;
    readonly subjectId: StableIdentifierV1;
    readonly subjectHash: string;
    readonly requestedAction: string;
    readonly binding: Readonly<Record<string, string>>;
  }): Promise<JraApprovalAuthorityLookupV1> {
    try {
      const context = authorityContext(input.tenantScope, 'jra-authority-read');
      const candidates = await this.repository.withTransaction(context, (transaction) =>
        transaction.findRequests(context, {
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          subjectHash: input.subjectHash,
          requestedAction: input.requestedAction,
          statuses: ['APPROVED'],
        }),
      );
      for (const request of candidates) {
        const policy = await this.repository.withTransaction(context, (transaction) =>
          transaction.findPolicy(context, request.policyId, request.policyVersion),
        );
        if (
          policy === undefined ||
          policy.status !== 'ACTIVE' ||
          !policyMatchesBinding(policy.actionMatcher, {
            actionType: input.requestedAction,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            ...input.binding,
          })
        ) {
          continue;
        }
        const validUntil = effectiveDueAt(request, policy);
        if (Date.parse(validUntil) <= (this.options.clock?.() ?? new Date()).getTime()) {
          return { accepted: false, code: 'NOT_FOUND' };
        }
        return Object.freeze({ accepted: true, request, policy, validUntil });
      }
      return { accepted: false, code: 'NOT_FOUND' };
    } catch (error) {
      return {
        accepted: false,
        code:
          error instanceof Error && error.message.includes('PERSISTED') ? 'INVALID' : 'UNAVAILABLE',
      };
    }
  }

  public async invalidateMaterialChange(input: {
    readonly tenantScope: TenantScopeV1;
    readonly subjectType: string;
    readonly subjectId: StableIdentifierV1;
    readonly requestedAction: string;
    readonly subjectHash: string;
    readonly binding: Readonly<Record<string, string>>;
  }): Promise<
    { readonly accepted: true } | { readonly accepted: false; readonly code: 'UNAVAILABLE' }
  > {
    try {
      const context = authorityContext(input.tenantScope, 'jra-authority-invalidate');
      await this.repository.withTransaction(context, async (transaction) => {
        const candidates = await transaction.findRequests(context, {
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          requestedAction: input.requestedAction,
          statuses: ['OPEN', 'APPROVED'],
        });
        const baseBinding = {
          actionType: input.requestedAction,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
        };
        for (const request of candidates) {
          const policy = await transaction.findPolicy(
            context,
            request.policyId,
            request.policyVersion,
          );
          if (policy === undefined || !policyMatchesBinding(policy.actionMatcher, baseBinding)) {
            continue;
          }
          const sameVersion =
            input.binding['versionId'] !== undefined &&
            policy.actionMatcher['versionId'] === input.binding['versionId'];
          if (sameVersion && request.subjectHash === input.subjectHash) continue;
          const invalidated = await transaction.updateRequest(
            context,
            { ...request, status: 'CANCELLED', revision: request.revision + 1 },
            request.revision,
          );
          if (invalidated === undefined) throw new Error('JRA_APPROVAL_REVISION_CONFLICT');
        }
      });
      return { accepted: true };
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
  }

  public async invalidatePriorVersion(input: {
    readonly tenantScope: TenantScopeV1;
    readonly subjectType: string;
    readonly subjectId: StableIdentifierV1;
    readonly requestedAction: string;
    readonly priorVersionId: StableIdentifierV1;
  }): Promise<
    { readonly accepted: true } | { readonly accepted: false; readonly code: 'UNAVAILABLE' }
  > {
    try {
      const context = authorityContext(input.tenantScope, 'jra-authority-prior-version');
      await this.repository.withTransaction(context, async (transaction) => {
        const candidates = await transaction.findRequests(context, {
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          requestedAction: input.requestedAction,
          statuses: ['OPEN', 'APPROVED'],
        });
        const binding = {
          actionType: input.requestedAction,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          versionId: input.priorVersionId,
        };
        for (const request of candidates) {
          const policy = await transaction.findPolicy(
            context,
            request.policyId,
            request.policyVersion,
          );
          if (policy === undefined || !policyMatchesBinding(policy.actionMatcher, binding)) {
            continue;
          }
          const invalidated = await transaction.updateRequest(
            context,
            { ...request, status: 'CANCELLED', revision: request.revision + 1 },
            request.revision,
          );
          if (invalidated === undefined) throw new Error('JRA_APPROVAL_REVISION_CONFLICT');
        }
      });
      return { accepted: true };
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
  }
}

function policyMatchesBinding(
  matcher: Readonly<Record<string, string>>,
  binding: Readonly<Record<string, string | StableIdentifierV1>>,
): boolean {
  return Object.entries(binding).every(([key, value]) => matcher[key] === value);
}

function policyExpiry(createdAt: string, policy: ApprovalPolicyV1): string {
  return new Date(Date.parse(createdAt) + policy.expiresAfterMinutes * 60_000).toISOString();
}

function effectiveDueAt(request: ApprovalRequestV1, policy: ApprovalPolicyV1): string {
  const policyDueAt = policyExpiry(request.createdAt, policy);
  if (request.dueAt === undefined || Date.parse(request.dueAt) > Date.parse(policyDueAt)) {
    return policyDueAt;
  }
  return request.dueAt;
}

function authorityContext(tenantScope: TenantScopeV1, idempotencyKey: string): IamTenantContextV1 {
  const result = createIamTenantContextV1({
    tenantScope,
    actorId: '00000000-0000-4000-8000-000000000001',
    correlationId: '00000000-0000-4000-8000-000000000002',
    idempotencyKey,
    authorizationEpoch: 1,
  });
  if (!result.accepted) throw new Error('JRA_AUTHORITY_CONTEXT_INVALID');
  return result.value;
}

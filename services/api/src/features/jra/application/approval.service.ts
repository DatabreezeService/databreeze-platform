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
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ApprovalRepositoryPortV1 } from './approval-repository.port.js';

function rejected<TValue>(
  code: 'INVALID_IDENTIFIER' | 'INVALID_ROLE' | 'REQUEST_NOT_OPEN' | 'SUBJECT_HASH_MISMATCH',
): ApprovalResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

/** Coordinates canonical JRA approval policy, request, and decision records. */
export class ApprovalService {
  public constructor(private readonly repository: ApprovalRepositoryPortV1) {}

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
      await transaction.saveRequest(context, created.value);
      return created;
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
    return this.repository.withTransaction(context, async (transaction) => {
      const request = await transaction.findRequest(context, input.requestId);
      if (!request) return rejected('INVALID_IDENTIFIER');
      const policy = await transaction.findPolicy(context, request.policyId, request.policyVersion);
      if (!policy) return rejected('INVALID_IDENTIFIER');
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
}

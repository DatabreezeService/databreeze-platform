import type {
  ApprovalDecisionRecordV1,
  ApprovalPolicyV1,
  ApprovalRequestV1,
} from '@databreeze/domain/approval/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const APPROVAL_REPOSITORY_PORT = Symbol('APPROVAL_REPOSITORY_PORT');

export interface ApprovalRequestSearchV1 {
  readonly subjectType?: string;
  readonly subjectId?: StableIdentifierV1;
  readonly subjectHash?: string;
  readonly requestedAction?: string;
  readonly statuses?: readonly ApprovalRequestV1['status'][];
}

export interface ApprovalTransactionPortV1 {
  savePolicy(context: IamTenantContextV1, policy: ApprovalPolicyV1): Promise<void>;
  findPolicy(
    context: IamTenantContextV1,
    policyId: StableIdentifierV1,
    version: number,
  ): Promise<ApprovalPolicyV1 | undefined>;
  saveRequest(context: IamTenantContextV1, request: ApprovalRequestV1): Promise<void>;
  findRequest(
    context: IamTenantContextV1,
    requestId: StableIdentifierV1,
  ): Promise<ApprovalRequestV1 | undefined>;
  findRequests(
    context: IamTenantContextV1,
    search?: ApprovalRequestSearchV1,
  ): Promise<readonly ApprovalRequestV1[]>;
  updateRequest(
    context: IamTenantContextV1,
    request: ApprovalRequestV1,
    expectedRevision: number,
  ): Promise<ApprovalRequestV1 | undefined>;
  saveDecision(context: IamTenantContextV1, decision: ApprovalDecisionRecordV1): Promise<void>;
  listDecisions(
    context: IamTenantContextV1,
    requestId: StableIdentifierV1,
  ): Promise<readonly ApprovalDecisionRecordV1[]>;
}

export interface ApprovalRepositoryPortV1 extends ApprovalTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ApprovalTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

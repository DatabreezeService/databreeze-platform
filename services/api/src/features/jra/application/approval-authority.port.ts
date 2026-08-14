import type { ApprovalPolicyV1, ApprovalRequestV1 } from '@databreeze/domain/approval/v1';
import type { StableIdentifierV1, TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export const JRA_APPROVAL_AUTHORITY_PORT = Symbol('JRA_APPROVAL_AUTHORITY_PORT');

export type JraApprovalAuthorityLookupV1 =
  | {
      readonly accepted: true;
      readonly request: ApprovalRequestV1;
      readonly policy: ApprovalPolicyV1;
      readonly validUntil: string;
    }
  | { readonly accepted: false; readonly code: 'NOT_FOUND' | 'UNAVAILABLE' | 'INVALID' };

export interface JraApprovalAuthorityPortV1 {
  findCurrentApproved(input: {
    readonly tenantScope: TenantScopeV1;
    readonly subjectType: string;
    readonly subjectId: StableIdentifierV1;
    readonly subjectHash: string;
    readonly requestedAction: string;
    readonly binding: Readonly<Record<string, string>>;
  }): Promise<JraApprovalAuthorityLookupV1>;
  invalidateMaterialChange(input: {
    readonly tenantScope: TenantScopeV1;
    readonly subjectType: string;
    readonly subjectId: StableIdentifierV1;
    readonly requestedAction: string;
    readonly subjectHash: string;
    readonly binding: Readonly<Record<string, string>>;
  }): Promise<
    { readonly accepted: true } | { readonly accepted: false; readonly code: 'UNAVAILABLE' }
  >;
  invalidatePriorVersion(input: {
    readonly tenantScope: TenantScopeV1;
    readonly subjectType: string;
    readonly subjectId: StableIdentifierV1;
    readonly requestedAction: string;
    readonly priorVersionId: StableIdentifierV1;
  }): Promise<
    { readonly accepted: true } | { readonly accepted: false; readonly code: 'UNAVAILABLE' }
  >;
}

export function sameApprovalScopeV1(left: TenantScopeV1, right: TenantScopeV1): boolean {
  if (left.scopeType !== right.scopeType || left.organizationId !== right.organizationId) {
    return false;
  }
  if (left.scopeType === 'organization' || right.scopeType === 'organization') {
    return left.scopeType === right.scopeType;
  }
  if (left.workspaceId !== right.workspaceId) return false;
  if (left.scopeType === 'workspace' || right.scopeType === 'workspace') {
    return left.scopeType === right.scopeType;
  }
  return left.projectId === right.projectId;
}

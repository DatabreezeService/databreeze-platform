import {
  roleHasPermissionV1,
  PERMISSIONS_V1,
  type PermissionV1,
} from '@databreeze/domain/permissions/v1';
import {
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  IamMembershipRecordV1,
  IamRepositoryPortV1,
} from '../../../platform/iam-membership.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

/** IAE-008/IAE-016: public authorization actions owned by the evidence authority. */
export type IaeAuthorizationActionV1 =
  | 'ARTIFACT_RECORD_READ'
  | 'ARTIFACT_ORIGINAL_DOWNLOAD'
  | 'ARTIFACT_UPLOAD_CREATE'
  | 'RETENTION_MANAGE';

export type IaeAuthorizationFailureCodeV1 =
  | 'AUTHENTICATION_REQUIRED'
  | 'TENANT_SCOPE_MISMATCH'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'MEMBERSHIP_REVOKED'
  | 'MEMBERSHIP_INACTIVE'
  | 'PERMISSION_DENIED';

export interface IaeAuthorizationRequestV1 {
  readonly tenantScope: TenantScopeV1;
  readonly action: IaeAuthorizationActionV1;
  readonly now?: string;
}

export type IaeAuthorizationResultV1 =
  | { readonly accepted: true; readonly value: true }
  | { readonly accepted: false; readonly code: IaeAuthorizationFailureCodeV1 };

/**
 * IAE's feature-facing authorization seam. Callers provide an authenticated actor context;
 * implementations must still re-check membership, permission, and exact resource scope.
 */
export const IAE_AUTHORIZATION_PORT = Symbol('IAE_AUTHORIZATION_PORT');
export interface IaeAuthorizationPortV1 {
  authorize(
    context: IamTenantContextV1,
    input: IaeAuthorizationRequestV1,
  ): Promise<IaeAuthorizationResultV1>;
}

export class UnavailableIaeAuthorizationAdapter implements IaeAuthorizationPortV1 {
  public authorize(
    _context: IamTenantContextV1,
    _input: IaeAuthorizationRequestV1,
  ): Promise<IaeAuthorizationResultV1> {
    void _context;
    void _input;
    return Promise.resolve({ accepted: false, code: 'AUTHENTICATION_REQUIRED' });
  }
}

function permissionFor(action: IaeAuthorizationActionV1): PermissionV1 {
  if (action === 'ARTIFACT_ORIGINAL_DOWNLOAD') return PERMISSIONS_V1.ARTIFACT_ORIGINAL_DOWNLOAD;
  if (action === 'ARTIFACT_UPLOAD_CREATE') return PERMISSIONS_V1.ARTIFACT_DERIVED_CREATE;
  if (action === 'RETENTION_MANAGE') return PERMISSIONS_V1.PROJECT_RECORD_MANAGE;
  return PERMISSIONS_V1.ARTIFACT_RECORD_READ;
}

function membershipIsActive(
  membership: IamMembershipRecordV1,
  now: string,
): IaeAuthorizationFailureCodeV1 | undefined {
  if (membership.status === 'REMOVED' || membership.status === 'SUSPENDED')
    return 'MEMBERSHIP_REVOKED';
  if (membership.status !== 'ACTIVE') return 'MEMBERSHIP_INACTIVE';
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return 'AUTHENTICATION_REQUIRED';
  if (membership.startsAt && Date.parse(membership.startsAt) > nowMs) return 'MEMBERSHIP_INACTIVE';
  if (membership.expiresAt && Date.parse(membership.expiresAt) <= nowMs)
    return 'MEMBERSHIP_REVOKED';
  return undefined;
}

/** Production IAE adapter over IAM's public membership port; it never reads IAM persistence. */
export class IamBackedIaeAuthorizationAdapter implements IaeAuthorizationPortV1 {
  public constructor(private readonly memberships: IamRepositoryPortV1) {}

  public async authorize(
    context: IamTenantContextV1,
    input: IaeAuthorizationRequestV1,
  ): Promise<IaeAuthorizationResultV1> {
    if (!context.actorId || !context.tenantScope)
      return Object.freeze({ accepted: false, code: 'AUTHENTICATION_REQUIRED' as const });
    if (!tenantScopesEqualV1(context.tenantScope, input.tenantScope))
      return Object.freeze({ accepted: false, code: 'TENANT_SCOPE_MISMATCH' as const });

    const membership = await this.memberships.findMembership(context, context.actorId);
    if (!membership)
      return Object.freeze({ accepted: false, code: 'MEMBERSHIP_NOT_FOUND' as const });
    if (!tenantScopeContainsV1(membership.scope, input.tenantScope))
      return Object.freeze({ accepted: false, code: 'TENANT_SCOPE_MISMATCH' as const });

    const membershipFailure = membershipIsActive(membership, input.now ?? new Date().toISOString());
    if (membershipFailure) return Object.freeze({ accepted: false, code: membershipFailure });
    if (!roleHasPermissionV1(membership.roleId, permissionFor(input.action)))
      return Object.freeze({ accepted: false, code: 'PERMISSION_DENIED' as const });
    return Object.freeze({ accepted: true, value: true as const });
  }
}

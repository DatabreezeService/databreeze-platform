import { randomUUID } from 'node:crypto';

import {
  checkOwnerRemovalV1,
  INVITATION_MAX_SECONDS_V1,
  validateMembershipV1,
  type MembershipIdentityV1,
} from '@databreeze/domain/identity/v1';
import {
  PERMISSIONS_V1,
  roleHasPermissionV1,
  type PermissionV1,
} from '@databreeze/domain/permissions/v1';
import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  IamMembershipRecordV1,
  IamRepositoryPortV1,
  IamTransactionPortV1,
} from './iam-repository.port.js';
import type { IamTenantContextV1 } from './tenant-context.js';

export const IAM_MEMBERSHIP_SERVICE = Symbol('IAM_MEMBERSHIP_SERVICE');

export type IamMembershipApplicationCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_ROLE'
  | 'INVALID_STATE'
  | 'SCOPE_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EXPIRED'
  | 'LAST_OWNER'
  | 'UNAVAILABLE';

export type IamMembershipApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: IamMembershipApplicationCodeV1 };

export interface IamMembershipInviteInputV1 {
  readonly principalId: unknown;
  readonly scope: unknown;
  readonly roleId: unknown;
}

export type IamMembershipIdGeneratorV1 = () => string;
export type IamMembershipClockV1 = () => Date;

function accepted<TValue>(value: TValue): IamMembershipApplicationResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(
  code: IamMembershipApplicationCodeV1,
): IamMembershipApplicationResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function parseId(input: unknown):
  | { readonly accepted: true; readonly value: StableIdentifierV1 }
  | { readonly accepted: false; readonly code: 'INVALID_IDENTIFIER' } {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed : { accepted: false, code: 'INVALID_IDENTIFIER' };
}

function parseScope(input: unknown):
  | { readonly accepted: true; readonly value: TenantScopeV1 }
  | { readonly accepted: false; readonly code: 'INVALID_SCOPE' } {
  const parsed = parseTenantScopeV1(input);
  return parsed.accepted ? parsed : { accepted: false, code: 'INVALID_SCOPE' };
}

function isoNow(clock: IamMembershipClockV1): string | undefined {
  try {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return undefined;
    return value.toISOString();
  } catch {
    return undefined;
  }
}

function applicationError(error: unknown): IamMembershipApplicationCodeV1 {
  const message = error instanceof Error ? error.message : '';
  if (message === 'IAM_SCOPE_DENIED' || message === 'IAM_SCOPE_NARROWING_REQUIRED')
    return 'SCOPE_DENIED';
  if (message === 'IAM_REVISION_CONFLICT') return 'CONFLICT';
  if (message.endsWith('_NOT_FOUND')) return 'NOT_FOUND';
  return 'UNAVAILABLE';
}

function permissionFor(scope: TenantScopeV1) {
  return scope.scopeType === 'organization'
    ? PERMISSIONS_V1.ORGANIZATION_SETTINGS_MANAGE
    : PERMISSIONS_V1.WORKSPACE_SETTINGS_MANAGE;
}

function identityFromRecord(record: IamMembershipRecordV1): MembershipIdentityV1 {
  return {
    schemaVersion: 1,
    id: record.id,
    principalType: 'USER',
    principalId: record.principalId,
    scope: record.scope,
    roleId: record.roleId as MembershipIdentityV1['roleId'],
    status: record.status,
    ...(record.startsAt === undefined ? {} : { startsAt: record.startsAt }),
    ...(record.expiresAt === undefined ? {} : { expiresAt: record.expiresAt }),
    revision: record.revision,
  };
}

/** IAM-004: scoped invitations and optimistic membership status transitions. */
export class IamMembershipService {
  public constructor(
    private readonly repository: IamRepositoryPortV1,
    private readonly idGenerator: IamMembershipIdGeneratorV1 = () => randomUUID(),
    private readonly clock: IamMembershipClockV1 = () => new Date(),
  ) {}

  private async authorize(
    context: IamTenantContextV1,
    scope: TenantScopeV1,
    permission: PermissionV1 = permissionFor(scope),
    repository: IamTransactionPortV1 = this.repository,
  ): Promise<'ALLOWED' | 'DENIED' | 'UNAVAILABLE'> {
    if (!tenantScopeContainsV1(context.tenantScope, scope)) return 'DENIED';
    try {
      const membership = await repository.findMembership(context, context.actorId);
      return membership && roleHasPermissionV1(membership.roleId, permission)
        ? 'ALLOWED'
        : 'DENIED';
    } catch {
      return 'UNAVAILABLE';
    }
  }

  public async list(
    context: IamTenantContextV1,
  ): Promise<IamMembershipApplicationResultV1<readonly IamMembershipRecordV1[]>> {
    try {
      return accepted(await this.repository.listMemberships(context));
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  public async invite(
    context: IamTenantContextV1,
    input: IamMembershipInviteInputV1,
  ): Promise<IamMembershipApplicationResultV1<IamMembershipRecordV1>> {
    const principalId = parseId(input.principalId);
    if (!principalId.accepted) return rejected(principalId.code);
    const scope = parseScope(input.scope);
    if (!scope.accepted) return rejected(scope.code);
    const authorization = await this.authorize(context, scope.value);
    if (authorization !== 'ALLOWED')
      return rejected(authorization === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'SCOPE_DENIED');
    const startedAt = isoNow(this.clock);
    if (!startedAt) return rejected('UNAVAILABLE');
    const expiresAt = new Date(
      Date.parse(startedAt) + INVITATION_MAX_SECONDS_V1 * 1_000,
    ).toISOString();
    let candidateId: string;
    try {
      candidateId = this.idGenerator();
    } catch {
      return rejected('UNAVAILABLE');
    }
    const candidate = validateMembershipV1({
      id: candidateId,
      principalType: 'USER',
      principalId: principalId.value,
      scope: scope.value,
      roleId: input.roleId,
      status: 'INVITED',
      startsAt: startedAt,
      expiresAt,
      revision: 1,
    });
    if (!candidate.accepted) {
      if (candidate.code === 'INVALID_IDENTIFIER') return rejected('INVALID_IDENTIFIER');
      if (candidate.code === 'INVALID_SCOPE') return rejected('INVALID_SCOPE');
      if (candidate.code === 'INVALID_ROLE') return rejected('INVALID_ROLE');
      return rejected('INVALID_STATE');
    }
    const record: IamMembershipRecordV1 = Object.freeze({
      id: candidate.value.id,
      principalId: candidate.value.principalId,
      scope: candidate.value.scope,
      roleId: candidate.value.roleId,
      status: candidate.value.status,
      ...(candidate.value.startsAt === undefined ? {} : { startsAt: candidate.value.startsAt }),
      ...(candidate.value.expiresAt === undefined ? {} : { expiresAt: candidate.value.expiresAt }),
      revision: candidate.value.revision,
    });
    try {
      await this.repository.saveMembership(context, record);
      return accepted(record);
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  public async transition(
    context: IamTenantContextV1,
    membershipIdInput: unknown,
    expectedRevisionInput: unknown,
    statusInput: unknown,
  ): Promise<IamMembershipApplicationResultV1<IamMembershipRecordV1>> {
    const membershipId = parseId(membershipIdInput);
    if (!membershipId.accepted) return rejected(membershipId.code);
    if (
      typeof expectedRevisionInput !== 'number' ||
      !Number.isSafeInteger(expectedRevisionInput) ||
      expectedRevisionInput < 1
    )
      return rejected('CONFLICT');
    if (statusInput !== 'ACTIVE' && statusInput !== 'SUSPENDED' && statusInput !== 'REMOVED')
      return rejected('INVALID_STATE');
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const memberships = await transaction.listMemberships(context);
        const current = memberships.find((membership) => membership.id === membershipId.value);
        if (!current) return rejected('NOT_FOUND');
        const authorization = await this.authorize(context, current.scope, undefined, transaction);
        if (authorization !== 'ALLOWED')
          return rejected(authorization === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'SCOPE_DENIED');
        if (current.revision !== expectedRevisionInput) return rejected('CONFLICT');
        if (statusInput !== 'ACTIVE' && current.status !== 'ACTIVE')
          return rejected('CONFLICT');
        if (statusInput !== 'ACTIVE' && current.roleId === 'owner') {
          const ownerDecision = checkOwnerRemovalV1(
            memberships.map(identityFromRecord),
            current.id,
          );
          if (ownerDecision === 'LAST_OWNER') return rejected('LAST_OWNER');
        }
        const next = Object.freeze({
          ...current,
          status: statusInput,
          revision: current.revision + 1,
        });
        const mutationContext = Object.freeze({ ...context, expectedRevision: current.revision });
        await transaction.saveMembership(mutationContext, next);
        return accepted(next);
      });
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  /** Transfer organization ownership in one optimistic transaction. */
  public async transferOwnership(
    context: IamTenantContextV1,
    targetMembershipIdInput: unknown,
    targetExpectedRevisionInput: unknown,
  ): Promise<IamMembershipApplicationResultV1<IamMembershipRecordV1>> {
    const targetMembershipId = parseId(targetMembershipIdInput);
    if (!targetMembershipId.accepted) return rejected(targetMembershipId.code);
    if (
      typeof targetExpectedRevisionInput !== 'number' ||
      !Number.isSafeInteger(targetExpectedRevisionInput) ||
      targetExpectedRevisionInput < 1
    )
      return rejected('CONFLICT');
    if (context.tenantScope.scopeType !== 'organization') return rejected('SCOPE_DENIED');
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const actor = await transaction.findMembership(context, context.actorId);
        if (
          !actor ||
          actor.scope.scopeType !== 'organization' ||
          actor.scope.organizationId !== context.tenantScope.organizationId
        )
          return rejected('SCOPE_DENIED');
        const authorization = await this.authorize(
          context,
          actor.scope,
          PERMISSIONS_V1.ORGANIZATION_OWNERSHIP_TRANSFER,
          transaction,
        );
        if (authorization !== 'ALLOWED')
          return rejected(authorization === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'SCOPE_DENIED');
        const memberships = await transaction.listMemberships(context);
        const target = memberships.find((membership) => membership.id === targetMembershipId.value);
        if (!target) return rejected('NOT_FOUND');
        if (
          target.id === actor.id ||
          target.scope.scopeType !== 'organization' ||
          target.scope.organizationId !== context.tenantScope.organizationId
        )
          return rejected('SCOPE_DENIED');
        if (target.status !== 'ACTIVE' || target.roleId === 'owner')
          return rejected('INVALID_STATE');
        if (target.revision !== targetExpectedRevisionInput) return rejected('CONFLICT');
        const nextActor: IamMembershipRecordV1 = Object.freeze({
          ...actor,
          roleId: 'admin',
          revision: actor.revision + 1,
        });
        const nextTarget: IamMembershipRecordV1 = Object.freeze({
          ...target,
          roleId: 'owner',
          revision: target.revision + 1,
        });
        await transaction.saveMembership(
          Object.freeze({ ...context, expectedRevision: actor.revision }),
          nextActor,
        );
        await transaction.saveMembership(
          Object.freeze({ ...context, expectedRevision: target.revision }),
          nextTarget,
        );
        return accepted(nextTarget);
      });
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  /** Accept an invitation only by the invited principal, clearing invitation-only expiry. */
  public async accept(
    context: IamTenantContextV1,
    membershipIdInput: unknown,
    expectedRevisionInput: unknown,
  ): Promise<IamMembershipApplicationResultV1<IamMembershipRecordV1>> {
    const membershipId = parseId(membershipIdInput);
    if (!membershipId.accepted) return rejected(membershipId.code);
    if (
      typeof expectedRevisionInput !== 'number' ||
      !Number.isSafeInteger(expectedRevisionInput) ||
      expectedRevisionInput < 1
    )
      return rejected('CONFLICT');
    const startedAt = isoNow(this.clock);
    if (!startedAt) return rejected('UNAVAILABLE');
    const nowMs = Date.parse(startedAt);
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const current = (await transaction.listMemberships(context)).find(
          (membership) => membership.id === membershipId.value,
        );
        if (!current) return rejected('NOT_FOUND');
        if (
          current.principalId !== context.actorId ||
          !tenantScopeContainsV1(context.tenantScope, current.scope)
        )
          return rejected('SCOPE_DENIED');
        if (current.revision !== expectedRevisionInput) return rejected('CONFLICT');
        if (current.status !== 'INVITED') return rejected('CONFLICT');
        if (current.expiresAt !== undefined && Date.parse(current.expiresAt) <= nowMs)
          return rejected('EXPIRED');
        if (current.startsAt !== undefined && Date.parse(current.startsAt) > nowMs)
          return rejected('CONFLICT');
        const { startsAt: _startsAt, expiresAt: _expiresAt, ...withoutInvitationLifetime } = current;
        const next: IamMembershipRecordV1 = Object.freeze({
          ...withoutInvitationLifetime,
          status: 'ACTIVE',
          revision: current.revision + 1,
        });
        const mutationContext = Object.freeze({ ...context, expectedRevision: current.revision });
        await transaction.saveMembership(mutationContext, next);
        return accepted(next);
      });
    } catch (error) {
      return rejected(applicationError(error));
    }
  }
}

import {
  createInvitationTokenV1,
  type InvitationTokenStatusV1,
  type InvitationTokenV1,
} from '@databreeze/domain/invitation/v1';
import {
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import { validateMembershipV1, type MembershipIdentityV1 } from '@databreeze/domain/identity/v1';

import type {
  IamInvitationRepositoryPortV1,
  IamInvitationTransactionPortV1,
} from '../application/invitation-repository.port.js';
import type { IamMembershipRecordV1 } from '../application/iam-repository.port.js';
import type { IamTenantContextV1 } from '../application/tenant-context.js';
import { selectAuthoritativeMembership } from '../application/membership-authority.js';

export interface IamInvitationMembershipDatabaseRowV1 {
  readonly id: string;
  readonly principalType: string;
  readonly principalId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly roleId: string;
  readonly status: string;
  readonly startsAt: Date | null;
  readonly expiresAt: Date | null;
  readonly revision: number;
}

export interface IamInvitationDatabaseRowV1 {
  readonly id: string;
  readonly membershipId: string;
  readonly principalId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly roleId: string;
  readonly tokenDigest: string;
  readonly emailDigest: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly status: InvitationTokenStatusV1;
  readonly consumedAt: Date | null;
  readonly revision: number;
}

interface IamInvitationMembershipDelegateV1 {
  findUnique(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<IamInvitationMembershipDatabaseRowV1 | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly IamInvitationMembershipDatabaseRowV1[]>;
  create(input: {
    readonly data: IamInvitationMembershipDatabaseRowV1;
  }): Promise<IamInvitationMembershipDatabaseRowV1>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Partial<IamInvitationMembershipDatabaseRowV1>;
  }): Promise<{ readonly count: number }>;
}

interface IamInvitationTokenDelegateV1 {
  findUnique(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<IamInvitationDatabaseRowV1 | null>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<IamInvitationDatabaseRowV1 | null>;
  create(input: { readonly data: IamInvitationDatabaseRowV1 }): Promise<IamInvitationDatabaseRowV1>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Partial<IamInvitationDatabaseRowV1>;
  }): Promise<{ readonly count: number }>;
}

interface IamInvitationDeliveryFailureDelegateV1 {
  findUnique(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<Readonly<Record<string, unknown>> | null>;
  create(input: {
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<Readonly<Record<string, unknown>>>;
}

interface IamInvitationTransactionDatabaseClientV1 {
  readonly membershipIdentity: IamInvitationMembershipDelegateV1;
  readonly invitationTokenRecord: IamInvitationTokenDelegateV1;
  readonly invitationDeliveryFailure?: IamInvitationDeliveryFailureDelegateV1;
}

export interface IamInvitationDatabaseClientV1 extends IamInvitationTransactionDatabaseClientV1 {
  $transaction<TValue>(
    work: (transaction: IamInvitationTransactionDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function parseScope(input: {
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
}): TenantScopeV1 | undefined {
  const organizationId = parseStableIdentifierV1(input.organizationId);
  if (!organizationId.accepted) return undefined;
  if (input.scopeType === 'ORGANIZATION') {
    return input.workspaceId === null && input.projectId === null
      ? { scopeType: 'organization', organizationId: organizationId.value }
      : undefined;
  }
  const workspaceId = parseStableIdentifierV1(input.workspaceId);
  if (!workspaceId.accepted) return undefined;
  if (input.scopeType === 'WORKSPACE') {
    return input.projectId === null
      ? {
          scopeType: 'workspace',
          organizationId: organizationId.value,
          workspaceId: workspaceId.value,
        }
      : undefined;
  }
  const projectId = parseStableIdentifierV1(input.projectId);
  if (!projectId.accepted || input.scopeType !== 'PROJECT') return undefined;
  return {
    scopeType: 'project',
    organizationId: organizationId.value,
    workspaceId: workspaceId.value,
    projectId: projectId.value,
  };
}

function membershipFromRow(row: IamInvitationMembershipDatabaseRowV1): IamMembershipRecordV1 {
  const scope = parseScope(row);
  const validated = validateMembershipV1({
    id: row.id,
    principalType: row.principalType,
    principalId: row.principalId,
    scope,
    roleId: row.roleId,
    status: row.status,
    ...(row.startsAt === null ? {} : { startsAt: row.startsAt.toISOString() }),
    ...(row.expiresAt === null ? {} : { expiresAt: row.expiresAt.toISOString() }),
    revision: row.revision,
  });
  if (!validated.accepted) throw new Error('IAM_PERSISTED_MEMBERSHIP_INVALID');
  return validated.value;
}

function invitationFromRow(row: IamInvitationDatabaseRowV1): InvitationTokenV1 {
  const scope = parseScope(row);
  const issuedAt = row.issuedAt.toISOString();
  const expiresAt = row.expiresAt.toISOString();
  const base = createInvitationTokenV1({
    id: row.id,
    membershipId: row.membershipId,
    principalId: row.principalId,
    scope,
    roleId: row.roleId,
    tokenDigest: row.tokenDigest,
    emailDigest: row.emailDigest,
    issuedAt,
    expiresAt,
    revision: row.revision,
  });
  if (!base.accepted) throw new Error('IAM_PERSISTED_INVITATION_INVALID');
  if (row.status !== 'ACTIVE' && row.status !== 'REDEEMED' && row.status !== 'REVOKED')
    throw new Error('IAM_PERSISTED_INVITATION_INVALID');
  const consumedAtCandidate = row.consumedAt === null ? undefined : row.consumedAt.toISOString();
  const consumedAtParsed =
    consumedAtCandidate === undefined ? undefined : parseStrictUtcTimestampV1(consumedAtCandidate);
  const consumedAt = consumedAtParsed?.accepted ? consumedAtParsed.value : undefined;
  if ((row.status === 'REDEEMED') !== (consumedAt !== undefined))
    throw new Error('IAM_PERSISTED_INVITATION_INVALID');
  if (consumedAtCandidate !== undefined && !consumedAtParsed?.accepted)
    throw new Error('IAM_PERSISTED_INVITATION_INVALID');
  return Object.freeze({
    ...base.value,
    status: row.status,
    ...(consumedAt === undefined ? {} : { consumedAt }),
  });
}

function invitationRow(invitation: InvitationTokenV1): IamInvitationDatabaseRowV1 {
  return {
    id: invitation.id,
    membershipId: invitation.membershipId,
    principalId: invitation.principalId,
    scopeType: invitation.scope.scopeType.toUpperCase(),
    organizationId: invitation.scope.organizationId,
    workspaceId:
      invitation.scope.scopeType === 'organization' ? null : invitation.scope.workspaceId,
    projectId: invitation.scope.scopeType === 'project' ? invitation.scope.projectId : null,
    roleId: invitation.roleId,
    tokenDigest: invitation.tokenDigest,
    emailDigest: invitation.emailDigest,
    issuedAt: new Date(invitation.issuedAt),
    expiresAt: new Date(invitation.expiresAt),
    status: invitation.status,
    consumedAt: invitation.consumedAt ? new Date(invitation.consumedAt) : null,
    revision: invitation.revision,
  };
}

function membershipRow(membership: MembershipIdentityV1): IamInvitationMembershipDatabaseRowV1 {
  return {
    id: membership.id,
    principalType: membership.principalType,
    principalId: membership.principalId,
    scopeType: membership.scope.scopeType.toUpperCase(),
    organizationId: membership.scope.organizationId,
    workspaceId:
      membership.scope.scopeType === 'organization' ? null : membership.scope.workspaceId,
    projectId: membership.scope.scopeType === 'project' ? membership.scope.projectId : null,
    roleId: membership.roleId,
    status: membership.status,
    startsAt: membership.startsAt ? new Date(membership.startsAt) : null,
    expiresAt: membership.expiresAt ? new Date(membership.expiresAt) : null,
    revision: membership.revision,
  };
}

function visibleInScope(context: TenantScopeV1, target: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, target) || tenantScopeContainsV1(target, context);
}

function uniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}

class PrismaIamInvitationTransactionAdapter implements IamInvitationTransactionPortV1 {
  public constructor(private readonly client: IamInvitationTransactionDatabaseClientV1) {}

  public async findMembershipForPrincipal(
    context: IamTenantContextV1,
    principalId: StableIdentifierV1,
  ): Promise<IamMembershipRecordV1 | undefined> {
    const rows = await this.client.membershipIdentity.findMany({
      where: { organizationId: context.tenantScope.organizationId, principalId, status: 'ACTIVE' },
    });
    const memberships = rows
      .map((row) => {
        try {
          return membershipFromRow(row);
        } catch {
          return undefined;
        }
      })
      .filter((membership): membership is IamMembershipRecordV1 => membership !== undefined)
      .filter((membership) => visibleInScope(context.tenantScope, membership.scope));
    return selectAuthoritativeMembership(memberships, context, principalId);
  }

  public async findInvitedMembershipForPrincipal(
    context: IamTenantContextV1,
    principalId: StableIdentifierV1,
  ): Promise<IamMembershipRecordV1 | undefined> {
    const rows = await this.client.membershipIdentity.findMany({
      where: { organizationId: context.tenantScope.organizationId, principalId, status: 'INVITED' },
    });
    return rows
      .map((row) => {
        try {
          return membershipFromRow(row);
        } catch {
          return undefined;
        }
      })
      .filter((membership): membership is IamMembershipRecordV1 => membership !== undefined)
      .filter((membership) => visibleInScope(context.tenantScope, membership.scope))
      .sort((left, right) => left.id.localeCompare(right.id))[0];
  }

  public async findMembershipById(
    context: IamTenantContextV1,
    membershipId: StableIdentifierV1,
  ): Promise<IamMembershipRecordV1 | undefined> {
    const row = await this.client.membershipIdentity.findUnique({ where: { id: membershipId } });
    if (!row) return undefined;
    const membership = membershipFromRow(row);
    return visibleInScope(context.tenantScope, membership.scope) ? membership : undefined;
  }

  public async findInvitationByDigest(
    context: IamTenantContextV1,
    tokenDigest: string,
  ): Promise<InvitationTokenV1 | undefined> {
    const row = await this.client.invitationTokenRecord.findUnique({ where: { tokenDigest } });
    if (!row) return undefined;
    const invitation = invitationFromRow(row);
    return tenantScopeContainsV1(context.tenantScope, invitation.scope) ? invitation : undefined;
  }

  public async findActiveInvitationForMembership(
    context: IamTenantContextV1,
    membershipId: StableIdentifierV1,
  ): Promise<InvitationTokenV1 | undefined> {
    const row = await this.client.invitationTokenRecord.findFirst({
      where: { membershipId, status: 'ACTIVE' },
    });
    if (!row) return undefined;
    const invitation = invitationFromRow(row);
    return tenantScopeContainsV1(context.tenantScope, invitation.scope) ? invitation : undefined;
  }

  public async isDeliveryBlocked(
    _context: IamTenantContextV1,
    tokenDigest: string,
  ): Promise<boolean> {
    const delegate = this.client.invitationDeliveryFailure;
    if (!delegate) throw new Error('IAM_INVITATION_DELIVERY_MARKER_UNAVAILABLE');
    return (await delegate.findUnique({ where: { tokenDigest } })) !== null;
  }

  public async recordDeliveryFailure(
    _context: IamTenantContextV1,
    tokenDigest: string,
    recordedAt: string,
  ): Promise<void> {
    const delegate = this.client.invitationDeliveryFailure;
    if (!delegate) throw new Error('IAM_INVITATION_DELIVERY_MARKER_UNAVAILABLE');
    try {
      await delegate.create({
        data: { tokenDigest, recordedAt: new Date(recordedAt) },
      });
    } catch (error) {
      if (uniqueConstraint(error)) return;
      throw error;
    }
  }

  public async saveInvitation(
    context: IamTenantContextV1,
    invitation: InvitationTokenV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, invitation.scope))
      throw new Error('IAM_SCOPE_NARROWING_REQUIRED');
    const row = invitationRow(invitation);
    const existingRow = await this.client.invitationTokenRecord.findUnique({
      where: { id: invitation.id },
    });
    if (!existingRow) {
      const active = await this.client.invitationTokenRecord.findFirst({
        where: { membershipId: invitation.membershipId, status: 'ACTIVE' },
      });
      if (active) throw new Error('IAM_INVITATION_CONFLICT');
      try {
        await this.client.invitationTokenRecord.create({ data: row });
      } catch (error) {
        if (uniqueConstraint(error)) throw new Error('IAM_INVITATION_CONFLICT');
        throw error;
      }
      return;
    }
    const existing = invitationFromRow(existingRow);
    if (
      existing.membershipId !== invitation.membershipId ||
      existing.principalId !== invitation.principalId ||
      !tenantScopesEqualV1(existing.scope, invitation.scope) ||
      existing.roleId !== invitation.roleId ||
      existing.tokenDigest !== invitation.tokenDigest ||
      existing.emailDigest !== invitation.emailDigest ||
      existing.issuedAt !== invitation.issuedAt ||
      existing.expiresAt !== invitation.expiresAt
    )
      throw new Error('IAM_INVITATION_SCOPE_IMMUTABLE');
    if (existing.status !== 'ACTIVE' || invitation.status === 'ACTIVE')
      throw new Error('IAM_INVITATION_REVISION_CONFLICT');
    if (invitation.revision !== existing.revision + 1)
      throw new Error('IAM_INVITATION_REVISION_CONFLICT');
    const updated = await this.client.invitationTokenRecord.updateMany({
      where: { id: invitation.id, revision: existing.revision, status: 'ACTIVE' },
      data: {
        status: invitation.status,
        consumedAt: invitation.consumedAt ? new Date(invitation.consumedAt) : null,
        revision: invitation.revision,
      },
    });
    if (updated.count !== 1) throw new Error('IAM_INVITATION_REVISION_CONFLICT');
  }

  public async saveMembership(
    context: IamTenantContextV1,
    membership: IamMembershipRecordV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, membership.scope))
      throw new Error('IAM_SCOPE_NARROWING_REQUIRED');
    const validated = validateMembershipV1({ ...membership, principalType: 'USER' });
    if (!validated.accepted) throw new Error(`IAM_${validated.code}`);
    const existingRow = await this.client.membershipIdentity.findUnique({
      where: { id: membership.id },
    });
    if (!existingRow) {
      if (context.expectedRevision !== undefined) throw new Error('IAM_REVISION_CONFLICT');
      try {
        await this.client.membershipIdentity.create({ data: membershipRow(validated.value) });
      } catch (error) {
        if (uniqueConstraint(error)) throw new Error('IAM_MEMBERSHIP_CONFLICT');
        throw error;
      }
      return;
    }
    const existing = membershipFromRow(existingRow);
    if (!visibleInScope(context.tenantScope, existing.scope))
      throw new Error('IAM_REVISION_CONFLICT');
    if (
      existing.principalId !== membership.principalId ||
      !tenantScopesEqualV1(existing.scope, membership.scope) ||
      existing.roleId !== membership.roleId
    )
      throw new Error('IAM_MEMBERSHIP_SCOPE_IMMUTABLE');
    if (membership.revision !== existing.revision + 1) throw new Error('IAM_REVISION_CONFLICT');
    const updated = await this.client.membershipIdentity.updateMany({
      where: { id: membership.id, revision: existing.revision },
      data: {
        status: membership.status,
        startsAt: membership.startsAt ? new Date(membership.startsAt) : null,
        expiresAt: membership.expiresAt ? new Date(membership.expiresAt) : null,
        revision: membership.revision,
      },
    });
    if (updated.count !== 1) throw new Error('IAM_REVISION_CONFLICT');
  }
}

export class PrismaIamInvitationRepositoryAdapter implements IamInvitationRepositoryPortV1 {
  public constructor(private readonly client: IamInvitationDatabaseClientV1) {}

  public withTransaction<TValue>(
    _context: IamTenantContextV1,
    work: (transaction: IamInvitationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaIamInvitationTransactionAdapter(transaction)),
    );
  }
}

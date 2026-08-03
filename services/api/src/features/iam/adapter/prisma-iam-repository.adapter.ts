import {
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  parseStableIdentifierV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import { validateMembershipV1, type MembershipIdentityV1 } from '@databreeze/domain/identity/v1';

import type {
  IamMembershipRecordV1,
  IamRepositoryPortV1,
  IamTransactionPortV1,
} from '../application/iam-repository.port.js';
import type { IamTenantContextV1 } from '../application/tenant-context.js';

export interface IamMembershipDatabaseRowV1 {
  readonly id: string;
  readonly principalType: string;
  readonly principalId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly roleId: string;
  readonly status: string;
  readonly startsAt?: Date | null;
  readonly expiresAt?: Date | null;
  readonly revision: number;
}

interface IamMembershipDelegateV1 {
  findUnique(input: {
    readonly where: { readonly id: string };
  }): Promise<IamMembershipDatabaseRowV1 | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<readonly IamMembershipDatabaseRowV1[]>;
  create(input: { readonly data: IamMembershipDatabaseRowV1 }): Promise<IamMembershipDatabaseRowV1>;
  updateMany(input: {
    readonly where: { readonly id: string; readonly revision: number };
    readonly data: Partial<IamMembershipDatabaseRowV1>;
  }): Promise<{ readonly count: number }>;
}

export interface IamDatabaseClientV1 {
  readonly membershipIdentity: IamMembershipDelegateV1;
  $transaction<TValue>(
    work: (transaction: IamDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function timestamp(input: Date | null | undefined): string | undefined {
  return input?.toISOString();
}

function scopeFromRow(row: IamMembershipDatabaseRowV1): TenantScopeV1 | undefined {
  const organizationId = parseStableIdentifierV1(row.organizationId);
  if (!organizationId.accepted) return undefined;
  if (row.scopeType === 'ORGANIZATION' && row.workspaceId === null && row.projectId === null)
    return { scopeType: 'organization', organizationId: organizationId.value };
  const workspaceId = parseStableIdentifierV1(row.workspaceId);
  if (!workspaceId.accepted) return undefined;
  if (row.scopeType === 'WORKSPACE' && row.projectId === null)
    return {
      scopeType: 'workspace',
      organizationId: organizationId.value,
      workspaceId: workspaceId.value,
    };
  const projectId = parseStableIdentifierV1(row.projectId);
  if (!projectId.accepted || row.scopeType !== 'PROJECT') return undefined;
  return {
    scopeType: 'project',
    organizationId: organizationId.value,
    workspaceId: workspaceId.value,
    projectId: projectId.value,
  };
}

function membershipFromRow(row: IamMembershipDatabaseRowV1): IamMembershipRecordV1 {
  const scope = scopeFromRow(row);
  const validated = validateMembershipV1({
    id: row.id,
    principalType: row.principalType,
    principalId: row.principalId,
    scope,
    roleId: row.roleId,
    status: row.status,
    ...(row.startsAt ? { startsAt: timestamp(row.startsAt) } : {}),
    ...(row.expiresAt ? { expiresAt: timestamp(row.expiresAt) } : {}),
    revision: row.revision,
  });
  if (!validated.accepted) throw new Error('IAM_PERSISTED_MEMBERSHIP_INVALID');
  return validated.value;
}

function membershipRow(membership: MembershipIdentityV1): IamMembershipDatabaseRowV1 {
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

function visibleInScope(context: TenantScopeV1, membership: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, membership) || tenantScopeContainsV1(membership, context);
}

function scopeSpecificity(scope: TenantScopeV1): number {
  if (scope.scopeType === 'project') return 3;
  if (scope.scopeType === 'workspace') return 2;
  return 1;
}

class PrismaIamTransactionAdapter implements IamTransactionPortV1 {
  public constructor(private readonly client: IamDatabaseClientV1) {}

  public async findMembership(
    context: IamTenantContextV1,
    principalId: StableIdentifierV1,
  ): Promise<IamMembershipRecordV1 | undefined> {
    const rows = await this.client.membershipIdentity.findMany({
      where: {
        organizationId: context.tenantScope.organizationId,
        principalId,
        status: 'ACTIVE',
      },
      orderBy: { id: 'asc' },
    });
    return rows
      .map(membershipFromRow)
      .filter(
        (membership) =>
          membership.principalId === principalId &&
          membership.status === 'ACTIVE' &&
          tenantScopeContainsV1(membership.scope, context.tenantScope),
      )
      .sort(
        (left, right) =>
          scopeSpecificity(right.scope) - scopeSpecificity(left.scope) ||
          left.id.localeCompare(right.id),
      )[0];
  }

  public async listMemberships(
    context: IamTenantContextV1,
  ): Promise<readonly IamMembershipRecordV1[]> {
    const rows = await this.client.membershipIdentity.findMany({
      where: { organizationId: context.tenantScope.organizationId },
      orderBy: { id: 'asc' },
    });
    return rows
      .map(membershipFromRow)
      .filter((membership) => visibleInScope(context.tenantScope, membership.scope));
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
      await this.client.membershipIdentity.create({ data: membershipRow(validated.value) });
      return;
    }
    const existing = membershipFromRow(existingRow);
    if (context.expectedRevision !== existing.revision) throw new Error('IAM_REVISION_CONFLICT');
    if (membership.revision !== existing.revision + 1) throw new Error('IAM_REVISION_CONFLICT');
    if (
      existing.principalId !== membership.principalId ||
      !tenantScopesEqualV1(existing.scope, membership.scope)
    )
      throw new Error('IAM_MEMBERSHIP_SCOPE_IMMUTABLE');
    const updated = await this.client.membershipIdentity.updateMany({
      where: { id: membership.id, revision: existing.revision },
      data: {
        roleId: membership.roleId,
        status: membership.status,
        revision: membership.revision,
      },
    });
    if (updated.count !== 1) throw new Error('IAM_REVISION_CONFLICT');
  }
}

export class PrismaIamRepositoryAdapter implements IamRepositoryPortV1 {
  public constructor(private readonly client: IamDatabaseClientV1) {}

  public findMembership(context: IamTenantContextV1, principalId: StableIdentifierV1) {
    return new PrismaIamTransactionAdapter(this.client).findMembership(context, principalId);
  }

  public listMemberships(context: IamTenantContextV1) {
    return new PrismaIamTransactionAdapter(this.client).listMemberships(context);
  }

  public saveMembership(context: IamTenantContextV1, membership: IamMembershipRecordV1) {
    return this.client.$transaction((transaction) =>
      new PrismaIamTransactionAdapter(transaction).saveMembership(context, membership),
    );
  }

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: IamTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaIamTransactionAdapter(transaction)),
    );
  }
}

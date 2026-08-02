import {
  bootstrapPersonalOrganizationV1,
  createUserIdentityV1,
  type MembershipIdentityV1,
  type PersonalOrganizationBootstrapV1,
  type UserIdentityV1,
} from '@databreeze/domain/identity/v1';
import { parseStableIdentifierV1, parseStrictUtcTimestampV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  IdentityBootstrapRepositoryPortV1,
  IdentityBootstrapTransactionPortV1,
} from '../application/identity-bootstrap-repository.port.js';

export interface UserIdentityDatabaseRowV1 {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly locale: string;
  readonly status: string;
  readonly securityEpoch: number;
  readonly createdAt: Date;
}

export interface OrganizationIdentityDatabaseRowV1 {
  readonly id: string;
  readonly name: string;
  readonly personal: boolean;
  readonly status: string;
  readonly createdAt: Date;
}

export interface WorkspaceIdentityDatabaseRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly status: string;
  readonly authorizationEpoch: number;
  readonly createdAt: Date;
}

export interface ProjectIdentityDatabaseRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly kind: string;
  readonly name: string;
  readonly status: string;
  readonly createdAt: Date;
}

export interface MembershipIdentityDatabaseRowV1 {
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

interface IdentityDelegateV1<TRow> {
  findUnique(input: { readonly where: { readonly id: string } }): Promise<TRow | null>;
  create(input: { readonly data: TRow }): Promise<TRow>;
}

interface ListDelegateV1<TRow> {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly TRow[]>;
}

interface UserDelegateV1 {
  findUnique(input: { readonly where: { readonly id: string } }): Promise<UserIdentityDatabaseRowV1 | null>;
}

interface MembershipDelegateV1 extends IdentityDelegateV1<MembershipIdentityDatabaseRowV1> {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly MembershipIdentityDatabaseRowV1[]>;
}

export interface IdentityBootstrapDatabaseClientV1 {
  readonly userIdentity: UserDelegateV1;
  readonly organizationIdentity: IdentityDelegateV1<OrganizationIdentityDatabaseRowV1>;
  readonly workspaceIdentity: IdentityDelegateV1<WorkspaceIdentityDatabaseRowV1> &
    ListDelegateV1<WorkspaceIdentityDatabaseRowV1>;
  readonly projectIdentity: IdentityDelegateV1<ProjectIdentityDatabaseRowV1> &
    ListDelegateV1<ProjectIdentityDatabaseRowV1>;
  readonly membershipIdentity: MembershipDelegateV1;
  $transaction<TValue>(
    work: (transaction: IdentityBootstrapDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function stableId(input: unknown): string | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: Date | null | undefined): string | undefined {
  if (!input) return undefined;
  const parsed = parseStrictUtcTimestampV1(input.toISOString());
  return parsed.accepted ? parsed.value : undefined;
}

function userFromRow(row: UserIdentityDatabaseRowV1): UserIdentityV1 {
  const created = createUserIdentityV1({
    id: row.id,
    displayName: row.displayName,
    locale: row.locale,
    securityEpoch: row.securityEpoch,
    status: row.status,
    createdAt: timestamp(row.createdAt),
  });
  if (!created.accepted) throw new Error('IAM_PERSISTED_USER_INVALID');
  return created.value;
}

function membershipMatches(row: MembershipIdentityDatabaseRowV1, expected: MembershipIdentityV1): boolean {
  return (
    row.id === expected.id &&
    row.principalType === expected.principalType &&
    row.principalId === expected.principalId &&
    row.scopeType === 'ORGANIZATION' &&
    row.organizationId === expected.scope.organizationId &&
    row.workspaceId === null &&
    row.projectId === null &&
    row.roleId === expected.roleId &&
    row.status === expected.status &&
    row.revision === expected.revision &&
    row.startsAt === null &&
    row.expiresAt === null
  );
}

function bootstrapRowsMatch(
  bootstrap: PersonalOrganizationBootstrapV1,
  organization: OrganizationIdentityDatabaseRowV1,
  workspace: WorkspaceIdentityDatabaseRowV1,
  project: ProjectIdentityDatabaseRowV1,
  membership: MembershipIdentityDatabaseRowV1,
): boolean {
  return (
    organization.id === bootstrap.organization.id &&
    organization.name === bootstrap.organization.name &&
    organization.personal === bootstrap.organization.personal &&
    organization.status === bootstrap.organization.status &&
    timestamp(organization.createdAt) === bootstrap.organization.createdAt &&
    workspace.id === bootstrap.workspace.id &&
    workspace.organizationId === bootstrap.workspace.organizationId &&
    workspace.name === bootstrap.workspace.name &&
    workspace.status === bootstrap.workspace.status &&
    workspace.authorizationEpoch === bootstrap.workspace.authorizationEpoch &&
    timestamp(workspace.createdAt) === bootstrap.workspace.createdAt &&
    project.id === bootstrap.project.id &&
    project.organizationId === bootstrap.project.organizationId &&
    project.workspaceId === bootstrap.project.workspaceId &&
    project.kind === bootstrap.project.kind &&
    project.name === bootstrap.project.name &&
    project.status === bootstrap.project.status &&
    timestamp(project.createdAt) === bootstrap.project.createdAt &&
    membershipMatches(membership, bootstrap.membership)
  );
}

class PrismaIdentityBootstrapTransactionAdapter implements IdentityBootstrapTransactionPortV1 {
  public constructor(private readonly client: IdentityBootstrapDatabaseClientV1) {}

  public async findByUserId(userId: PersonalOrganizationBootstrapV1['user']['id']): Promise<PersonalOrganizationBootstrapV1 | undefined> {
    const userRow = await this.client.userIdentity.findUnique({ where: { id: userId } });
    if (!userRow) return undefined;
    const user = userFromRow(userRow);
    const memberships = await this.client.membershipIdentity.findMany({
      where: { principalId: user.id, status: 'ACTIVE', scopeType: 'ORGANIZATION' },
    });
    const membershipRow = memberships.find(
      (candidate) =>
        candidate.principalId === user.id &&
        candidate.scopeType === 'ORGANIZATION' &&
        candidate.workspaceId === null &&
        candidate.projectId === null &&
        candidate.roleId === 'owner',
    );
    if (!membershipRow) return undefined;
    const organizationId = stableId(membershipRow.organizationId);
    if (!organizationId) throw new Error('IAM_PERSISTED_MEMBERSHIP_INVALID');
    const organization = await this.client.organizationIdentity.findUnique({ where: { id: organizationId } });
    if (!organization || !organization.personal) throw new Error('IAM_PERSISTED_ORGANIZATION_INVALID');
    const workspaceRows = await this.client.workspaceIdentity.findMany({
      where: { organizationId, status: 'ACTIVE' },
    });
    const workspace = workspaceRows.find((candidate) => candidate.name === 'Personal workspace');
    if (!workspace) throw new Error('IAM_PERSISTED_WORKSPACE_INVALID');
    const projectRows = await this.client.projectIdentity.findMany({
      where: { organizationId, workspaceId: workspace.id, status: 'ACTIVE' },
    });
    const project = projectRows.find((candidate) => candidate.kind === 'INTERNAL');
    if (!project) throw new Error('IAM_PERSISTED_PROJECT_INVALID');
    const canonical = bootstrapPersonalOrganizationV1({
      user: {
        id: user.id,
        displayName: user.displayName,
        locale: user.locale,
        securityEpoch: user.securityEpoch,
        status: user.status,
        createdAt: user.createdAt,
      },
      organizationId,
      workspaceId: workspace.id,
      projectId: project.id,
      membershipId: membershipRow.id,
      createdAt: organization.createdAt.toISOString(),
    });
    if (!canonical.accepted) throw new Error('IAM_PERSISTED_BOOTSTRAP_INVALID');
    if (!bootstrapRowsMatch(canonical.value, organization, workspace, project, membershipRow))
      throw new Error('IAM_PERSISTED_BOOTSTRAP_INVALID');
    return canonical.value;
  }

  public async save(bootstrap: PersonalOrganizationBootstrapV1): Promise<void> {
    const userRow = await this.client.userIdentity.findUnique({ where: { id: bootstrap.user.id } });
    if (!userRow) throw new Error('IAM_USER_NOT_FOUND');
    if (JSON.stringify(userFromRow(userRow)) !== JSON.stringify(bootstrap.user))
      throw new Error('IAM_BOOTSTRAP_CONFLICT');
    const organizationData: OrganizationIdentityDatabaseRowV1 = {
      id: bootstrap.organization.id,
      name: bootstrap.organization.name,
      personal: bootstrap.organization.personal,
      status: bootstrap.organization.status,
      createdAt: new Date(bootstrap.organization.createdAt),
    };
    const workspaceData: WorkspaceIdentityDatabaseRowV1 = {
      id: bootstrap.workspace.id,
      organizationId: bootstrap.workspace.organizationId,
      name: bootstrap.workspace.name,
      status: bootstrap.workspace.status,
      authorizationEpoch: bootstrap.workspace.authorizationEpoch,
      createdAt: new Date(bootstrap.workspace.createdAt),
    };
    const projectData: ProjectIdentityDatabaseRowV1 = {
      id: bootstrap.project.id,
      organizationId: bootstrap.project.organizationId,
      workspaceId: bootstrap.project.workspaceId,
      kind: bootstrap.project.kind,
      name: bootstrap.project.name,
      status: bootstrap.project.status,
      createdAt: new Date(bootstrap.project.createdAt),
    };
    const membershipData: MembershipIdentityDatabaseRowV1 = {
      id: bootstrap.membership.id,
      principalType: bootstrap.membership.principalType,
      principalId: bootstrap.membership.principalId,
      scopeType: 'ORGANIZATION',
      organizationId: bootstrap.membership.scope.organizationId,
      workspaceId: null,
      projectId: null,
      roleId: bootstrap.membership.roleId,
      status: bootstrap.membership.status,
      startsAt: null,
      expiresAt: null,
      revision: bootstrap.membership.revision,
    };
    await this.saveImmutable(this.client.organizationIdentity, organizationData);
    await this.saveImmutable(this.client.workspaceIdentity, workspaceData);
    await this.saveImmutable(this.client.projectIdentity, projectData);
    await this.saveImmutable(this.client.membershipIdentity, membershipData);
  }

  private async saveImmutable<TRow extends { readonly id: string }>(
    delegate: IdentityDelegateV1<TRow>,
    expected: TRow,
  ): Promise<void> {
    const existing = await delegate.findUnique({ where: { id: expected.id } });
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(expected)) throw new Error('IAM_BOOTSTRAP_CONFLICT');
      return;
    }
    await delegate.create({ data: expected });
  }
}

export class PrismaIdentityBootstrapRepositoryAdapter implements IdentityBootstrapRepositoryPortV1 {
  public constructor(private readonly client: IdentityBootstrapDatabaseClientV1) {}

  public findByUserId(userId: PersonalOrganizationBootstrapV1['user']['id']) {
    return new PrismaIdentityBootstrapTransactionAdapter(this.client).findByUserId(userId);
  }

  public save(bootstrap: PersonalOrganizationBootstrapV1) {
    return new PrismaIdentityBootstrapTransactionAdapter(this.client).save(bootstrap);
  }

  public withTransaction<TValue>(
    work: (transaction: IdentityBootstrapTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaIdentityBootstrapTransactionAdapter(transaction)),
    );
  }
}

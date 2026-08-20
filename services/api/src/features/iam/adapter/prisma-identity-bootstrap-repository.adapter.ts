import {
  createOrganizationIdentityV1,
  createProjectIdentityV1,
  createUserIdentityV1,
  createWorkspaceIdentityV1,
  validateMembershipV1,
  type OrganizationIdentityV1,
  type PersonalOrganizationBootstrapV1,
  type ProjectIdentityV1,
  type UserIdentityV1,
  type WorkspaceIdentityV1,
} from '@databreeze/domain/identity/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  IdentityBootstrapRepositoryPortV1,
  IdentityBootstrapTransactionPortV1,
  IdentityBootstrapVisibleTreeV1,
} from '../application/identity-bootstrap-repository.port.js';
import type { InitialWorkspacePolicyProvisionerPortV1 } from '../application/initial-workspace-policy-provisioner.port.js';

export interface UserIdentityDatabaseRowV1 {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly locale: string;
  readonly status: string;
  readonly securityEpoch: number;
  readonly profileRevision?: number;
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
  readonly dataModePolicyId: string;
  readonly currentDataModePolicyVersionId: string;
  readonly dataModeProjection: string;
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
  findMany(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<readonly TRow[]>;
}

interface UserDelegateV1 {
  findUnique(input: {
    readonly where: { readonly id: string };
  }): Promise<UserIdentityDatabaseRowV1 | null>;
}

interface MembershipDelegateV1 extends IdentityDelegateV1<MembershipIdentityDatabaseRowV1> {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly MembershipIdentityDatabaseRowV1[]>;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

function ownedFieldsMatch<TRow extends object>(existing: TRow, expected: TRow): boolean {
  const existingRecord = existing as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  return Object.keys(expectedRecord).every((key) =>
    valuesEqual(existingRecord[key], expectedRecord[key]),
  );
}

export interface IdentityBootstrapDatabaseClientV1 {
  readonly userIdentity: UserDelegateV1;
  readonly organizationIdentity: IdentityDelegateV1<OrganizationIdentityDatabaseRowV1> &
    ListDelegateV1<OrganizationIdentityDatabaseRowV1>;
  readonly workspaceIdentity: IdentityDelegateV1<WorkspaceIdentityDatabaseRowV1> &
    ListDelegateV1<WorkspaceIdentityDatabaseRowV1>;
  readonly projectIdentity: IdentityDelegateV1<ProjectIdentityDatabaseRowV1> &
    ListDelegateV1<ProjectIdentityDatabaseRowV1>;
  readonly membershipIdentity: MembershipDelegateV1;
  $transaction<TValue>(
    work: (transaction: IdentityBootstrapDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

export type IdentityBootstrapPolicyProvisionerFactoryV1 = (
  transaction: IdentityBootstrapDatabaseClientV1,
) => InitialWorkspacePolicyProvisionerPortV1;

function stableId(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: Date | null | undefined): StrictUtcTimestampV1 | undefined {
  if (!input) return undefined;
  try {
    const parsed = parseStrictUtcTimestampV1(input.toISOString());
    return parsed.accepted ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

function safeText(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function compareCreatedIdentity(
  left: { readonly id: string; readonly createdAt: Date },
  right: { readonly id: string; readonly createdAt: Date },
): number {
  const time = left.createdAt.getTime() - right.createdAt.getTime();
  return time === 0 ? left.id.localeCompare(right.id) : time;
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

function organizationFromRow(row: OrganizationIdentityDatabaseRowV1): OrganizationIdentityV1 {
  const created = createOrganizationIdentityV1({
    id: row.id,
    name: row.name,
    personal: row.personal,
    status: row.status,
    createdAt: timestamp(row.createdAt),
  });
  if (!created.accepted) throw new Error('IAM_PERSISTED_ORGANIZATION_INVALID');
  return created.value;
}

function workspaceFromRow(row: WorkspaceIdentityDatabaseRowV1): WorkspaceIdentityV1 {
  const created = createWorkspaceIdentityV1({
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status,
    authorizationEpoch: row.authorizationEpoch,
    createdAt: timestamp(row.createdAt),
  });
  if (!created.accepted) throw new Error('IAM_PERSISTED_WORKSPACE_INVALID');
  return created.value;
}

function projectFromRow(row: ProjectIdentityDatabaseRowV1): ProjectIdentityV1 {
  const created = createProjectIdentityV1({
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    kind: row.kind,
    name: row.name,
    status: row.status,
    createdAt: timestamp(row.createdAt),
  });
  if (!created.accepted) throw new Error('IAM_PERSISTED_PROJECT_INVALID');
  return created.value;
}

function bootstrapFromRows(
  user: UserIdentityV1,
  organization: OrganizationIdentityDatabaseRowV1,
  workspace: WorkspaceIdentityDatabaseRowV1,
  project: ProjectIdentityDatabaseRowV1,
  membership: MembershipIdentityDatabaseRowV1,
): PersonalOrganizationBootstrapV1 {
  const organizationId = stableId(organization.id);
  const workspaceId = stableId(workspace.id);
  const projectId = stableId(project.id);
  const organizationName = safeText(organization.name, 200);
  const workspaceName = safeText(workspace.name, 200);
  const projectName = safeText(project.name, 200);
  const organizationCreatedAt = timestamp(organization.createdAt);
  const workspaceCreatedAt = timestamp(workspace.createdAt);
  const projectCreatedAt = timestamp(project.createdAt);
  if (
    !organizationId ||
    !organizationName ||
    !organizationCreatedAt ||
    !organization.personal ||
    organization.status !== 'ACTIVE'
  )
    throw new Error('IAM_PERSISTED_ORGANIZATION_INVALID');
  if (
    !workspaceId ||
    !workspaceName ||
    !workspaceCreatedAt ||
    workspace.organizationId !== organizationId ||
    workspace.status !== 'ACTIVE' ||
    !stableId(workspace.dataModePolicyId) ||
    !stableId(workspace.currentDataModePolicyVersionId) ||
    !['LOCAL', 'HYBRID', 'CLOUD'].includes(workspace.dataModeProjection) ||
    !Number.isSafeInteger(workspace.authorizationEpoch) ||
    workspace.authorizationEpoch < 1
  )
    throw new Error('IAM_PERSISTED_WORKSPACE_INVALID');
  if (
    !projectId ||
    !projectName ||
    !projectCreatedAt ||
    project.organizationId !== organizationId ||
    project.workspaceId !== workspaceId ||
    project.kind !== 'INTERNAL' ||
    project.status !== 'ACTIVE'
  )
    throw new Error('IAM_PERSISTED_PROJECT_INVALID');
  const startsAt = timestamp(membership.startsAt);
  const expiresAt = timestamp(membership.expiresAt);
  if (
    (membership.startsAt !== null && membership.startsAt !== undefined && !startsAt) ||
    (membership.expiresAt !== null && membership.expiresAt !== undefined && !expiresAt)
  )
    throw new Error('IAM_PERSISTED_MEMBERSHIP_INVALID');
  const parsedMembership = validateMembershipV1({
    id: membership.id,
    principalType: membership.principalType,
    principalId: membership.principalId,
    scope: { scopeType: 'organization', organizationId: membership.organizationId },
    roleId: membership.roleId,
    status: membership.status,
    ...(startsAt ? { startsAt } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    revision: membership.revision,
  });
  if (
    !parsedMembership.accepted ||
    membership.scopeType !== 'ORGANIZATION' ||
    membership.workspaceId !== null ||
    membership.projectId !== null ||
    parsedMembership.value.principalId !== user.id ||
    parsedMembership.value.scope.organizationId !== organizationId ||
    parsedMembership.value.roleId !== 'owner' ||
    parsedMembership.value.status !== 'ACTIVE'
  )
    throw new Error('IAM_PERSISTED_MEMBERSHIP_INVALID');
  return Object.freeze({
    user,
    organization: Object.freeze({
      schemaVersion: 1,
      id: organizationId,
      name: organizationName,
      personal: true,
      status: 'ACTIVE',
      createdAt: organizationCreatedAt,
    }),
    workspace: Object.freeze({
      schemaVersion: 1,
      id: workspaceId,
      organizationId,
      name: workspaceName,
      status: 'ACTIVE',
      authorizationEpoch: workspace.authorizationEpoch,
      createdAt: workspaceCreatedAt,
    }),
    project: Object.freeze({
      schemaVersion: 1,
      id: projectId,
      organizationId,
      workspaceId,
      kind: 'INTERNAL',
      name: projectName,
      status: 'ACTIVE',
      createdAt: projectCreatedAt,
    }),
    membership: parsedMembership.value,
  });
}

export class PrismaIdentityBootstrapTransactionAdapter
  implements IdentityBootstrapTransactionPortV1
{
  public constructor(
    private readonly client: IdentityBootstrapDatabaseClientV1,
    private readonly initialWorkspacePolicy?: InitialWorkspacePolicyProvisionerPortV1,
  ) {}

  public async findByUserId(
    userId: PersonalOrganizationBootstrapV1['user']['id'],
  ): Promise<PersonalOrganizationBootstrapV1 | undefined> {
    const userRow = await this.client.userIdentity.findUnique({ where: { id: userId } });
    if (!userRow) return undefined;
    const user = userFromRow(userRow);
    const memberships = await this.client.membershipIdentity.findMany({
      where: {
        principalId: user.id,
        status: 'ACTIVE',
        scopeType: 'ORGANIZATION',
        roleId: 'owner',
        workspaceId: null,
        projectId: null,
      },
    });
    const sortedMemberships = [...memberships].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const candidateOrganizationIds = sortedMemberships.map((membership) => {
      const candidateOrganizationId = stableId(membership.organizationId);
      if (!candidateOrganizationId) throw new Error('IAM_PERSISTED_MEMBERSHIP_INVALID');
      return candidateOrganizationId;
    });
    const organizations = await this.client.organizationIdentity.findMany({
      where: { id: { in: candidateOrganizationIds }, personal: true },
    });
    const organizationsById = new Map(
      organizations.map((organization) => [organization.id, organization]),
    );
    const personalCandidates: Array<{
      readonly membership: MembershipIdentityDatabaseRowV1;
      readonly organization: OrganizationIdentityDatabaseRowV1;
    }> = [];
    for (const membership of sortedMemberships) {
      const candidate = organizationsById.get(membership.organizationId);
      if (candidate?.personal) personalCandidates.push({ membership, organization: candidate });
    }
    if (personalCandidates.length === 0) return undefined;
    if (personalCandidates.length !== 1) throw new Error('IAM_PERSISTED_ORGANIZATION_INVALID');
    const selected = personalCandidates[0];
    if (!selected) throw new Error('IAM_PERSISTED_ORGANIZATION_INVALID');
    const { membership: membershipRow, organization } = selected;
    const organizationId = organization.id;
    const workspaceRows = await this.client.workspaceIdentity.findMany({
      where: { organizationId, status: 'ACTIVE' },
    });
    const workspace = [...workspaceRows].sort(compareCreatedIdentity)[0];
    if (!workspace) throw new Error('IAM_PERSISTED_WORKSPACE_INVALID');
    const projectRows = await this.client.projectIdentity.findMany({
      where: { organizationId, workspaceId: workspace.id, status: 'ACTIVE', kind: 'INTERNAL' },
    });
    const project = [...projectRows].sort(compareCreatedIdentity)[0];
    if (!project) throw new Error('IAM_PERSISTED_PROJECT_INVALID');
    return bootstrapFromRows(user, organization, workspace, project, membershipRow);
  }

  /** IAM-002/IAM-027: return only active hierarchy rows covered by the actor's memberships. */
  public async listVisibleByUserId(
    userId: StableIdentifierV1,
  ): Promise<IdentityBootstrapVisibleTreeV1 | undefined> {
    const userRow = await this.client.userIdentity.findUnique({ where: { id: userId } });
    if (!userRow) return undefined;
    const profileRevisionCandidate = userRow.profileRevision;
    const profileRevision =
      Number.isSafeInteger(profileRevisionCandidate) && (profileRevisionCandidate ?? 0) >= 1
        ? (profileRevisionCandidate ?? 1)
        : 1;
    const user = Object.freeze({ ...userFromRow(userRow), email: userRow.email, profileRevision });
    const memberships = await this.client.membershipIdentity.findMany({
      where: { principalId: user.id, status: 'ACTIVE' },
    });
    if (memberships.length === 0) return undefined;
    const organizationIds = [
      ...new Set(
        memberships
          .map((membership) => stableId(membership.organizationId))
          .filter((id): id is StableIdentifierV1 => id !== undefined),
      ),
    ];
    if (organizationIds.length === 0) return undefined;
    const [organizationRows, workspaceRows, projectRows] = await Promise.all([
      this.client.organizationIdentity.findMany({
        where: { id: { in: organizationIds }, status: 'ACTIVE' },
      }),
      this.client.workspaceIdentity.findMany({ where: { status: 'ACTIVE' } }),
      this.client.projectIdentity.findMany({ where: { status: 'ACTIVE' } }),
    ]);
    const activeMemberships = memberships.filter(
      (membership) =>
        membership.status === 'ACTIVE' && stableId(membership.organizationId) !== undefined,
    );
    const organizations = [...organizationRows]
      .sort(compareCreatedIdentity)
      .map((organizationRow) => {
        const organization = organizationFromRow(organizationRow);
        const scopedMemberships = activeMemberships.filter(
          (membership) => membership.organizationId === organization.id,
        );
        const organizationMember = scopedMemberships.some(
          (membership) =>
            membership.scopeType === 'ORGANIZATION' &&
            membership.workspaceId === null &&
            membership.projectId === null,
        );
        const visibleWorkspaceIds = new Set(
          scopedMemberships
            .filter(
              (membership) =>
                (membership.scopeType === 'WORKSPACE' || membership.scopeType === 'PROJECT') &&
                membership.workspaceId !== null,
            )
            .map((membership) => membership.workspaceId as string),
        );
        const visibleWorkspaces = [...workspaceRows]
          .filter(
            (workspaceRow) =>
              workspaceRow.organizationId === organization.id &&
              (organizationMember || visibleWorkspaceIds.has(workspaceRow.id)),
          )
          .sort(compareCreatedIdentity)
          .map((workspaceRow) => {
            const workspace = workspaceFromRow(workspaceRow);
            const workspaceMember = scopedMemberships.some(
              (membership) =>
                membership.scopeType === 'WORKSPACE' &&
                membership.workspaceId === workspace.id &&
                membership.projectId === null,
            );
            const projectMembershipIds = new Set(
              scopedMemberships
                .filter(
                  (membership) =>
                    membership.scopeType === 'PROJECT' &&
                    membership.workspaceId === workspace.id &&
                    membership.projectId !== null,
                )
                .map((membership) => membership.projectId as string),
            );
            const projects = [...projectRows]
              .filter(
                (projectRow) =>
                  projectRow.organizationId === organization.id &&
                  projectRow.workspaceId === workspace.id &&
                  (organizationMember ||
                    workspaceMember ||
                    projectMembershipIds.has(projectRow.id)),
              )
              .sort(compareCreatedIdentity)
              .map((projectRow) => projectFromRow(projectRow));
            return projects.length === 0
              ? undefined
              : Object.freeze({ ...workspace, projects: Object.freeze(projects) });
          })
          .filter(
            (workspace): workspace is NonNullable<typeof workspace> => workspace !== undefined,
          );
        return visibleWorkspaces.length === 0
          ? undefined
          : Object.freeze({
              ...organization,
              workspaces: Object.freeze(visibleWorkspaces),
            });
      })
      .filter(
        (organization): organization is NonNullable<typeof organization> =>
          organization !== undefined,
      );
    if (organizations.length === 0) return undefined;
    return Object.freeze({ user, organizations: Object.freeze(organizations) });
  }

  public async save(bootstrap: PersonalOrganizationBootstrapV1): Promise<void> {
    const userRow = await this.client.userIdentity.findUnique({ where: { id: bootstrap.user.id } });
    if (!userRow) throw new Error('IAM_USER_NOT_FOUND');
    if (!ownedFieldsMatch(userFromRow(userRow), bootstrap.user))
      throw new Error('IAM_BOOTSTRAP_CONFLICT');
    if (!this.initialWorkspacePolicy) throw new Error('IAM_INITIAL_WORKSPACE_POLICY_UNAVAILABLE');
    const policy = await this.initialWorkspacePolicy.provision({
      organizationId: bootstrap.organization.id,
      workspaceId: bootstrap.workspace.id,
      publishedAt: bootstrap.workspace.createdAt,
    });
    if (policy.dataModeProjection !== 'HYBRID')
      throw new Error('IAM_INITIAL_WORKSPACE_POLICY_INVALID');
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
      dataModePolicyId: policy.policyId,
      currentDataModePolicyVersionId: policy.policyVersionId,
      dataModeProjection: policy.dataModeProjection,
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
      if (!ownedFieldsMatch(existing, expected)) throw new Error('IAM_BOOTSTRAP_CONFLICT');
      return;
    }
    await delegate.create({ data: expected });
  }
}

export class PrismaIdentityBootstrapRepositoryAdapter implements IdentityBootstrapRepositoryPortV1 {
  public constructor(
    private readonly client: IdentityBootstrapDatabaseClientV1,
    private readonly policyProvisionerFactory?: IdentityBootstrapPolicyProvisionerFactoryV1,
  ) {}

  public findByUserId(userId: PersonalOrganizationBootstrapV1['user']['id']) {
    return new PrismaIdentityBootstrapTransactionAdapter(this.client).findByUserId(userId);
  }

  public listVisibleByUserId(userId: StableIdentifierV1) {
    return new PrismaIdentityBootstrapTransactionAdapter(this.client).listVisibleByUserId(userId);
  }

  public save(bootstrap: PersonalOrganizationBootstrapV1) {
    return this.client.$transaction((transaction) =>
      new PrismaIdentityBootstrapTransactionAdapter(
        transaction,
        this.policyProvisionerFactory?.(transaction),
      ).save(bootstrap),
    );
  }

  public withTransaction<TValue>(
    work: (transaction: IdentityBootstrapTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(
        new PrismaIdentityBootstrapTransactionAdapter(
          transaction,
          this.policyProvisionerFactory?.(transaction),
        ),
      ),
    );
  }
}

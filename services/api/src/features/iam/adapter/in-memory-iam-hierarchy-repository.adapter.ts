import {
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type {
  OrganizationIdentityV1,
  ProjectIdentityV1,
  WorkspaceIdentityV1,
} from '@databreeze/domain/identity/v1';

import type {
  IamHierarchyRepositoryPortV1,
  IamHierarchyTransactionPortV1,
} from '../application/hierarchy-repository.port.js';
import type { IamTenantContextV1 } from '../application/tenant-context.js';

function cloneOrganization(value: OrganizationIdentityV1): OrganizationIdentityV1 {
  return Object.freeze({ ...value });
}

function cloneWorkspace(value: WorkspaceIdentityV1): WorkspaceIdentityV1 {
  return Object.freeze({ ...value });
}

function cloneProject(value: ProjectIdentityV1): ProjectIdentityV1 {
  return Object.freeze({ ...value });
}

function organizationScope(organizationId: StableIdentifierV1): TenantScopeV1 {
  return Object.freeze({ scopeType: 'organization', organizationId });
}

function workspaceScope(
  organizationId: StableIdentifierV1,
  workspaceId: StableIdentifierV1,
): TenantScopeV1 {
  return Object.freeze({ scopeType: 'workspace', organizationId, workspaceId });
}

function projectScope(
  organizationId: StableIdentifierV1,
  workspaceId: StableIdentifierV1,
  projectId: StableIdentifierV1,
): TenantScopeV1 {
  return Object.freeze({ scopeType: 'project', organizationId, workspaceId, projectId });
}

function cloneMaps(source: {
  readonly organizations: Map<string, OrganizationIdentityV1>;
  readonly workspaces: Map<string, WorkspaceIdentityV1>;
  readonly projects: Map<string, ProjectIdentityV1>;
}): {
  readonly organizations: Map<string, OrganizationIdentityV1>;
  readonly workspaces: Map<string, WorkspaceIdentityV1>;
  readonly projects: Map<string, ProjectIdentityV1>;
} {
  return {
    organizations: new Map(
      [...source.organizations].map(([id, value]) => [id, cloneOrganization(value)]),
    ),
    workspaces: new Map([...source.workspaces].map(([id, value]) => [id, cloneWorkspace(value)])),
    projects: new Map([...source.projects].map(([id, value]) => [id, cloneProject(value)])),
  };
}

function organizationVisible(context: IamTenantContextV1, organizationId: StableIdentifierV1): boolean {
  return tenantScopesEqualV1(context.tenantScope, organizationScope(organizationId));
}

function workspaceVisible(
  context: IamTenantContextV1,
  organizationId: StableIdentifierV1,
  workspaceId: StableIdentifierV1,
): boolean {
  return tenantScopeContainsV1(
    context.tenantScope,
    workspaceScope(organizationId, workspaceId),
  );
}

function projectVisible(
  context: IamTenantContextV1,
  organizationId: StableIdentifierV1,
  workspaceId: StableIdentifierV1,
  projectId: StableIdentifierV1,
): boolean {
  return tenantScopeContainsV1(
    context.tenantScope,
    projectScope(organizationId, workspaceId, projectId),
  );
}

/** In-memory IAM hierarchy adapter with the same tenant and immutability checks as persistence. */
export class InMemoryIamHierarchyRepositoryAdapter implements IamHierarchyRepositoryPortV1 {
  private organizations = new Map<string, OrganizationIdentityV1>();
  private workspaces = new Map<string, WorkspaceIdentityV1>();
  private projects = new Map<string, ProjectIdentityV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async seed(input: {
    readonly organizations: readonly OrganizationIdentityV1[];
    readonly workspaces: readonly WorkspaceIdentityV1[];
    readonly projects: readonly ProjectIdentityV1[];
  }): Promise<void> {
    await Promise.resolve();
    this.organizations = new Map(input.organizations.map((value) => [value.id, cloneOrganization(value)]));
    this.workspaces = new Map(input.workspaces.map((value) => [value.id, cloneWorkspace(value)]));
    this.projects = new Map(input.projects.map((value) => [value.id, cloneProject(value)]));
  }

  public async findOrganization(
    context: IamTenantContextV1,
    organizationId: StableIdentifierV1,
  ): Promise<OrganizationIdentityV1 | undefined> {
    await Promise.resolve();
    const value = this.organizations.get(organizationId);
    return value && organizationVisible(context, organizationId) ? cloneOrganization(value) : undefined;
  }

  public async listOrganizations(
    context: IamTenantContextV1,
  ): Promise<readonly OrganizationIdentityV1[]> {
    await Promise.resolve();
    if (context.tenantScope.scopeType !== 'organization') return [];
    const value = this.organizations.get(context.tenantScope.organizationId);
    return value ? [cloneOrganization(value)] : [];
  }

  public async findWorkspace(
    context: IamTenantContextV1,
    workspaceId: StableIdentifierV1,
  ): Promise<WorkspaceIdentityV1 | undefined> {
    await Promise.resolve();
    const value = this.workspaces.get(workspaceId);
    return value && workspaceVisible(context, value.organizationId, value.id)
      ? cloneWorkspace(value)
      : undefined;
  }

  public async listWorkspaces(
    context: IamTenantContextV1,
    organizationId: StableIdentifierV1,
  ): Promise<readonly WorkspaceIdentityV1[]> {
    await Promise.resolve();
    if (!organizationVisible(context, organizationId)) return [];
    return [...this.workspaces.values()]
      .filter((value) => value.organizationId === organizationId)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(cloneWorkspace);
  }

  public async findProject(
    context: IamTenantContextV1,
    projectId: StableIdentifierV1,
  ): Promise<ProjectIdentityV1 | undefined> {
    await Promise.resolve();
    const value = this.projects.get(projectId);
    return value && projectVisible(context, value.organizationId, value.workspaceId, value.id)
      ? cloneProject(value)
      : undefined;
  }

  public async listProjects(
    context: IamTenantContextV1,
    workspaceId: StableIdentifierV1,
  ): Promise<readonly ProjectIdentityV1[]> {
    await Promise.resolve();
    return [...this.projects.values()]
      .filter(
        (value) =>
          value.workspaceId === workspaceId &&
          projectVisible(context, value.organizationId, value.workspaceId, value.id),
      )
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(cloneProject);
  }

  public async saveOrganization(
    context: IamTenantContextV1,
    value: OrganizationIdentityV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!organizationVisible(context, value.id)) throw new Error('IAM_SCOPE_DENIED');
    const existing = this.organizations.get(value.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(value))
      throw new Error('IAM_HIERARCHY_CONFLICT');
    if (!existing) this.organizations.set(value.id, cloneOrganization(value));
  }

  public async saveWorkspace(
    context: IamTenantContextV1,
    value: WorkspaceIdentityV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!organizationVisible(context, value.organizationId)) throw new Error('IAM_SCOPE_DENIED');
    if (!this.organizations.has(value.organizationId)) throw new Error('IAM_PARENT_NOT_FOUND');
    const existing = this.workspaces.get(value.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(value))
      throw new Error('IAM_HIERARCHY_CONFLICT');
    if (!existing) this.workspaces.set(value.id, cloneWorkspace(value));
  }

  public async saveProject(
    context: IamTenantContextV1,
    value: ProjectIdentityV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!workspaceVisible(context, value.organizationId, value.workspaceId))
      throw new Error('IAM_SCOPE_DENIED');
    if (
      !this.workspaces.has(value.workspaceId) ||
      this.workspaces.get(value.workspaceId)?.organizationId !== value.organizationId
    )
      throw new Error('IAM_PARENT_NOT_FOUND');
    const existing = this.projects.get(value.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(value))
      throw new Error('IAM_HIERARCHY_CONFLICT');
    if (!existing) this.projects.set(value.id, cloneProject(value));
  }

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: IamHierarchyTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    return previous.then(async () => {
      const before = cloneMaps({
        organizations: this.organizations,
        workspaces: this.workspaces,
        projects: this.projects,
      });
      try {
        return await work({
          findOrganization: this.findOrganization.bind(this),
          listOrganizations: this.listOrganizations.bind(this),
          findWorkspace: this.findWorkspace.bind(this),
          listWorkspaces: this.listWorkspaces.bind(this),
          findProject: this.findProject.bind(this),
          listProjects: this.listProjects.bind(this),
          saveOrganization: this.saveOrganization.bind(this),
          saveWorkspace: this.saveWorkspace.bind(this),
          saveProject: this.saveProject.bind(this),
        });
      } catch (error) {
        this.organizations = before.organizations;
        this.workspaces = before.workspaces;
        this.projects = before.projects;
        throw error;
      } finally {
        void context;
        release();
      }
    });
  }
}

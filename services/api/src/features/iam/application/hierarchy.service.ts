import { randomUUID } from 'node:crypto';

import {
  createProjectIdentityV1,
  createWorkspaceIdentityV1,
  isBoundedTextV1,
  isProjectKindV1,
  type OrganizationIdentityV1,
  type ProjectIdentityV1,
  type WorkspaceIdentityV1,
} from '@databreeze/domain/identity/v1';
import {
  parseStableIdentifierV1,
  tenantScopeContainsV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import { roleHasPermissionV1, PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';

import type { IamRepositoryPortV1 } from './iam-repository.port.js';
import type { IamHierarchyRepositoryPortV1 } from './hierarchy-repository.port.js';
import { createIamTenantContextV1, type IamTenantContextV1 } from './tenant-context.js';

export const IAM_HIERARCHY_SERVICE = Symbol('IAM_HIERARCHY_SERVICE');

export type IamHierarchyApplicationCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_TEXT'
  | 'INVALID_KIND'
  | 'SCOPE_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAVAILABLE';

export type IamHierarchyApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: IamHierarchyApplicationCodeV1 };

export type IamHierarchyIdGeneratorV1 = () => string;
export type IamHierarchyClockV1 = () => Date;

/** IAM-027: the created workspace plus its server-provisioned default private project. */
export interface IamCreatedWorkspaceV1 {
  readonly workspace: WorkspaceIdentityV1;
  readonly defaultProject: ProjectIdentityV1;
  readonly dataMode: 'HYBRID';
}

function accepted<TValue>(value: TValue): IamHierarchyApplicationResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: IamHierarchyApplicationCodeV1): IamHierarchyApplicationResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function applicationError(error: unknown): IamHierarchyApplicationCodeV1 {
  const message = error instanceof Error ? error.message : '';
  if (message === 'IAM_SCOPE_DENIED' || message === 'IAM_SCOPE_NARROWING_REQUIRED')
    return 'SCOPE_DENIED';
  if (message === 'IAM_PARENT_NOT_FOUND' || message.endsWith('_NOT_FOUND')) return 'NOT_FOUND';
  if (message === 'IAM_HIERARCHY_CONFLICT' || message === 'IAM_REVISION_CONFLICT')
    return 'CONFLICT';
  return 'UNAVAILABLE';
}

function identityCode(code: string): IamHierarchyApplicationCodeV1 {
  if (code === 'INVALID_IDENTIFIER') return 'INVALID_IDENTIFIER';
  if (code === 'INVALID_TEXT') return 'INVALID_TEXT';
  if (code === 'INVALID_KIND') return 'INVALID_KIND';
  return 'UNAVAILABLE';
}

function parseId(
  input: unknown,
):
  | { readonly accepted: true; readonly value: StableIdentifierV1 }
  | { readonly accepted: false; readonly code: 'INVALID_IDENTIFIER' } {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed : { accepted: false, code: 'INVALID_IDENTIFIER' };
}

function isoNow(clock: IamHierarchyClockV1): string | undefined {
  try {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return undefined;
    return value.toISOString();
  } catch {
    return undefined;
  }
}

function workspaceScopeFor(context: IamTenantContextV1, workspaceId: StableIdentifierV1) {
  return {
    scopeType: 'workspace' as const,
    organizationId: context.tenantScope.organizationId,
    workspaceId,
  };
}

/** IAM hierarchy use cases. Paths are checked against the authenticated scope; IDs are server-generated. */
export class IamHierarchyService {
  public constructor(
    private readonly repository: IamHierarchyRepositoryPortV1,
    private readonly idGenerator: IamHierarchyIdGeneratorV1 = () => randomUUID(),
    private readonly clock: IamHierarchyClockV1 = () => new Date(),
    private readonly authority?: IamRepositoryPortV1,
  ) {}

  private async authorizeMutation(
    context: IamTenantContextV1,
    permission: (typeof PERMISSIONS_V1)[keyof typeof PERMISSIONS_V1],
  ): Promise<'ALLOWED' | 'DENIED' | 'UNAVAILABLE'> {
    if (!this.authority) return 'UNAVAILABLE';
    try {
      const membership = await this.authority.findMembership(context, context.actorId);
      return membership && roleHasPermissionV1(membership.roleId, permission)
        ? 'ALLOWED'
        : 'DENIED';
    } catch {
      return 'UNAVAILABLE';
    }
  }

  public async getOrganization(
    context: IamTenantContextV1,
    organizationIdInput: unknown,
  ): Promise<IamHierarchyApplicationResultV1<OrganizationIdentityV1>> {
    const organizationId = parseId(organizationIdInput);
    if (!organizationId.accepted) return rejected(organizationId.code);
    try {
      const value = await this.repository.findOrganization(context, organizationId.value);
      return value ? accepted(value) : rejected('NOT_FOUND');
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  public async listWorkspaces(
    context: IamTenantContextV1,
    organizationIdInput: unknown,
  ): Promise<IamHierarchyApplicationResultV1<readonly WorkspaceIdentityV1[]>> {
    const organizationId = parseId(organizationIdInput);
    if (!organizationId.accepted) return rejected(organizationId.code);
    // IAM-027: every session inside the organization sees its workspace list;
    // the underlying membership visibility stays enforced per request context.
    if (context.tenantScope.organizationId !== organizationId.value)
      return rejected('SCOPE_DENIED');
    try {
      return accepted(await this.repository.listWorkspaces(context, organizationId.value));
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  public async getWorkspace(
    context: IamTenantContextV1,
    workspaceIdInput: unknown,
  ): Promise<IamHierarchyApplicationResultV1<WorkspaceIdentityV1>> {
    const workspaceId = parseId(workspaceIdInput);
    if (!workspaceId.accepted) return rejected(workspaceId.code);
    try {
      const value = await this.repository.findWorkspace(context, workspaceId.value);
      return value ? accepted(value) : rejected('NOT_FOUND');
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  public async createWorkspace(
    context: IamTenantContextV1,
    organizationIdInput: unknown,
    nameInput: unknown,
  ): Promise<IamHierarchyApplicationResultV1<IamCreatedWorkspaceV1>> {
    const organizationId = parseId(organizationIdInput);
    if (!organizationId.accepted) return rejected(organizationId.code);
    // IAM-027: a session scoped anywhere inside the target organization may attempt
    // creation; the permission check below remains the authority.
    if (context.tenantScope.organizationId !== organizationId.value)
      return rejected('SCOPE_DENIED');
    const createdAt = isoNow(this.clock);
    if (!createdAt) return rejected('UNAVAILABLE');
    if (!isBoundedTextV1(nameInput, 200)) return rejected('INVALID_TEXT');
    const authorization = await this.authorizeMutation(
      context,
      PERMISSIONS_V1.ORGANIZATION_SETTINGS_MANAGE,
    );
    if (authorization !== 'ALLOWED')
      return rejected(authorization === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'SCOPE_DENIED');
    const organizationContext = createIamTenantContextV1({
      ...context,
      tenantScope: { scopeType: 'organization', organizationId: organizationId.value },
    });
    if (!organizationContext.accepted) return rejected('UNAVAILABLE');
    try {
      return await this.repository.withTransaction(organizationContext.value, async (transaction) => {
        const parent = await transaction.findOrganization(
          organizationContext.value,
          organizationId.value,
        );
        if (!parent) return rejected('NOT_FOUND');
        const candidate = createWorkspaceIdentityV1({
          id: this.idGenerator(),
          organizationId: parent.id,
          name: nameInput,
          createdAt,
        });
        if (!candidate.accepted) return rejected(identityCode(candidate.code));
        await transaction.saveWorkspace(organizationContext.value, candidate.value);
        const project = createProjectIdentityV1({
          id: this.idGenerator(),
          organizationId: parent.id,
          workspaceId: candidate.value.id,
          kind: 'INTERNAL',
          name: 'Private project',
          createdAt,
        });
        if (!project.accepted) return rejected(identityCode(project.code));
        await transaction.saveProject(organizationContext.value, project.value);
        return accepted({
          workspace: candidate.value,
          defaultProject: project.value,
          dataMode: 'HYBRID',
        });
      });
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  public async listProjects(
    context: IamTenantContextV1,
    workspaceIdInput: unknown,
  ): Promise<IamHierarchyApplicationResultV1<readonly ProjectIdentityV1[]>> {
    const workspaceId = parseId(workspaceIdInput);
    if (!workspaceId.accepted) return rejected(workspaceId.code);
    if (
      context.tenantScope.scopeType === 'project' ||
      !tenantScopeContainsV1(context.tenantScope, workspaceScopeFor(context, workspaceId.value))
    )
      return rejected('SCOPE_DENIED');
    try {
      return accepted(await this.repository.listProjects(context, workspaceId.value));
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  public async getProject(
    context: IamTenantContextV1,
    projectIdInput: unknown,
  ): Promise<IamHierarchyApplicationResultV1<ProjectIdentityV1>> {
    const projectId = parseId(projectIdInput);
    if (!projectId.accepted) return rejected(projectId.code);
    try {
      const value = await this.repository.findProject(context, projectId.value);
      return value ? accepted(value) : rejected('NOT_FOUND');
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  public async createProject(
    context: IamTenantContextV1,
    workspaceIdInput: unknown,
    kindInput: unknown,
    nameInput: unknown,
  ): Promise<IamHierarchyApplicationResultV1<ProjectIdentityV1>> {
    const workspaceId = parseId(workspaceIdInput);
    if (!workspaceId.accepted) return rejected(workspaceId.code);
    if (
      context.tenantScope.scopeType === 'project' ||
      !tenantScopeContainsV1(context.tenantScope, workspaceScopeFor(context, workspaceId.value))
    )
      return rejected('SCOPE_DENIED');
    const createdAt = isoNow(this.clock);
    if (!createdAt) return rejected('UNAVAILABLE');
    if (!isProjectKindV1(kindInput)) return rejected('INVALID_KIND');
    if (!isBoundedTextV1(nameInput, 200)) return rejected('INVALID_TEXT');
    const authorization = await this.authorizeMutation(
      context,
      PERMISSIONS_V1.WORKSPACE_SETTINGS_MANAGE,
    );
    if (authorization !== 'ALLOWED')
      return rejected(authorization === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'SCOPE_DENIED');
    try {
      return await this.repository.withTransaction(context, async (transaction) => {
        const parent = await transaction.findWorkspace(context, workspaceId.value);
        if (!parent) return rejected('NOT_FOUND');
        const candidate = createProjectIdentityV1({
          id: this.idGenerator(),
          organizationId: parent.organizationId,
          workspaceId: parent.id,
          kind: kindInput,
          name: nameInput,
          createdAt,
        });
        if (!candidate.accepted) return rejected(identityCode(candidate.code));
        await transaction.saveProject(context, candidate.value);
        return accepted(candidate.value);
      });
    } catch (error) {
      return rejected(applicationError(error));
    }
  }
}

import type {
  OrganizationIdentityV1,
  ProjectIdentityV1,
  WorkspaceIdentityV1,
} from '@databreeze/domain/identity/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from './tenant-context.js';

export const IAM_HIERARCHY_REPOSITORY = Symbol('IAM_HIERARCHY_REPOSITORY');

export interface IamHierarchyTransactionPortV1 {
  findOrganization(
    context: IamTenantContextV1,
    organizationId: StableIdentifierV1,
  ): Promise<OrganizationIdentityV1 | undefined>;
  listOrganizations(context: IamTenantContextV1): Promise<readonly OrganizationIdentityV1[]>;
  findWorkspace(
    context: IamTenantContextV1,
    workspaceId: StableIdentifierV1,
  ): Promise<WorkspaceIdentityV1 | undefined>;
  listWorkspaces(
    context: IamTenantContextV1,
    organizationId: StableIdentifierV1,
  ): Promise<readonly WorkspaceIdentityV1[]>;
  findProject(
    context: IamTenantContextV1,
    projectId: StableIdentifierV1,
  ): Promise<ProjectIdentityV1 | undefined>;
  listProjects(
    context: IamTenantContextV1,
    workspaceId: StableIdentifierV1,
  ): Promise<readonly ProjectIdentityV1[]>;
  saveOrganization(context: IamTenantContextV1, value: OrganizationIdentityV1): Promise<void>;
  saveWorkspace(context: IamTenantContextV1, value: WorkspaceIdentityV1): Promise<void>;
  saveProject(context: IamTenantContextV1, value: ProjectIdentityV1): Promise<void>;
}

export interface IamHierarchyRepositoryPortV1 extends IamHierarchyTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: IamHierarchyTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

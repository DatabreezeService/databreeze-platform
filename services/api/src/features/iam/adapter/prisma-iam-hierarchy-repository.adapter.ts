import {
  createOrganizationIdentityV1,
  createProjectIdentityV1,
  createWorkspaceIdentityV1,
  type OrganizationIdentityV1,
  type ProjectIdentityV1,
  type WorkspaceIdentityV1,
} from '@databreeze/domain/identity/v1';
import {
  parseStrictUtcTimestampV1,
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  IamHierarchyRepositoryPortV1,
  IamHierarchyTransactionPortV1,
} from '../application/hierarchy-repository.port.js';
import type { IamTenantContextV1 } from '../application/tenant-context.js';

/** The fields owned by the IAM hierarchy tables. Updated timestamps are deliberately excluded. */
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

interface IdentityDelegateV1<TRow> {
  findUnique(input: { readonly where: { readonly id: string } }): Promise<TRow | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<readonly TRow[]>;
  create(input: { readonly data: TRow }): Promise<TRow>;
}

export interface IamHierarchyDatabaseClientV1 {
  readonly organizationIdentity: IdentityDelegateV1<OrganizationIdentityDatabaseRowV1>;
  readonly workspaceIdentity: IdentityDelegateV1<WorkspaceIdentityDatabaseRowV1>;
  readonly projectIdentity: IdentityDelegateV1<ProjectIdentityDatabaseRowV1>;
  $transaction<TValue>(
    work: (transaction: IamHierarchyDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

interface IamHierarchyDiagnosticsV1 {
  readonly onMalformedOrganizationRow?: (organizationId: string) => void;
  readonly onMalformedWorkspaceRow?: (workspaceId: string) => void;
  readonly onMalformedProjectRow?: (projectId: string) => void;
}

function timestamp(input: Date | null | undefined): StrictUtcTimestampV1 | undefined {
  if (!(input instanceof Date) || !Number.isFinite(input.getTime())) return undefined;
  try {
    const parsed = parseStrictUtcTimestampV1(input.toISOString());
    return parsed.accepted ? parsed.value : undefined;
  } catch {
    return undefined;
  }
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

function organizationFromRow(row: OrganizationIdentityDatabaseRowV1): OrganizationIdentityV1 {
  const parsed = createOrganizationIdentityV1({
    id: row.id,
    name: row.name,
    personal: row.personal,
    status: row.status,
    createdAt: timestamp(row.createdAt),
  });
  if (!parsed.accepted) throw new Error('IAM_PERSISTED_ORGANIZATION_INVALID');
  return parsed.value;
}

function workspaceFromRow(row: WorkspaceIdentityDatabaseRowV1): WorkspaceIdentityV1 {
  const parsed = createWorkspaceIdentityV1({
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status,
    authorizationEpoch: row.authorizationEpoch,
    createdAt: timestamp(row.createdAt),
  });
  if (!parsed.accepted) throw new Error('IAM_PERSISTED_WORKSPACE_INVALID');
  return parsed.value;
}

function projectFromRow(row: ProjectIdentityDatabaseRowV1): ProjectIdentityV1 {
  const parsed = createProjectIdentityV1({
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    kind: row.kind,
    name: row.name,
    status: row.status,
    createdAt: timestamp(row.createdAt),
  });
  if (!parsed.accepted) throw new Error('IAM_PERSISTED_PROJECT_INVALID');
  return parsed.value;
}

function organizationRow(value: OrganizationIdentityV1): OrganizationIdentityDatabaseRowV1 {
  return {
    id: value.id,
    name: value.name,
    personal: value.personal,
    status: value.status,
    createdAt: new Date(value.createdAt),
  };
}

function workspaceRow(value: WorkspaceIdentityV1): WorkspaceIdentityDatabaseRowV1 {
  return {
    id: value.id,
    organizationId: value.organizationId,
    name: value.name,
    status: value.status,
    authorizationEpoch: value.authorizationEpoch,
    createdAt: new Date(value.createdAt),
  };
}

function projectRow(value: ProjectIdentityV1): ProjectIdentityDatabaseRowV1 {
  return {
    id: value.id,
    organizationId: value.organizationId,
    workspaceId: value.workspaceId,
    kind: value.kind,
    name: value.name,
    status: value.status,
    createdAt: new Date(value.createdAt),
  };
}

function organizationScope(organizationId: StableIdentifierV1): TenantScopeV1 {
  return { scopeType: 'organization', organizationId };
}

function workspaceScope(
  organizationId: StableIdentifierV1,
  workspaceId: StableIdentifierV1,
): TenantScopeV1 {
  return { scopeType: 'workspace', organizationId, workspaceId };
}

function projectScope(
  organizationId: StableIdentifierV1,
  workspaceId: StableIdentifierV1,
  projectId: StableIdentifierV1,
): TenantScopeV1 {
  return { scopeType: 'project', organizationId, workspaceId, projectId };
}

function organizationVisible(
  context: IamTenantContextV1,
  organizationId: StableIdentifierV1,
): boolean {
  return tenantScopesEqualV1(context.tenantScope, organizationScope(organizationId));
}

function workspaceVisible(
  context: IamTenantContextV1,
  organizationId: StableIdentifierV1,
  workspaceId: StableIdentifierV1,
): boolean {
  return tenantScopeContainsV1(context.tenantScope, workspaceScope(organizationId, workspaceId));
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

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}

function reportMalformed(
  diagnostics: IamHierarchyDiagnosticsV1,
  kind: 'organization' | 'workspace' | 'project',
  id: string,
): never {
  try {
    if (kind === 'organization') diagnostics.onMalformedOrganizationRow?.(id);
    if (kind === 'workspace') diagnostics.onMalformedWorkspaceRow?.(id);
    if (kind === 'project') diagnostics.onMalformedProjectRow?.(id);
  } catch {
    // Diagnostics are best-effort; persistence corruption remains fail-closed.
  }
  throw new Error(
    kind === 'organization'
      ? 'IAM_PERSISTED_ORGANIZATION_INVALID'
      : kind === 'workspace'
        ? 'IAM_PERSISTED_WORKSPACE_INVALID'
        : 'IAM_PERSISTED_PROJECT_INVALID',
  );
}

function organizationFromRowWithDiagnostics(
  row: OrganizationIdentityDatabaseRowV1,
  diagnostics: IamHierarchyDiagnosticsV1,
): OrganizationIdentityV1 {
  try {
    return organizationFromRow(row);
  } catch {
    return reportMalformed(diagnostics, 'organization', row.id);
  }
}

function workspaceFromRowWithDiagnostics(
  row: WorkspaceIdentityDatabaseRowV1,
  diagnostics: IamHierarchyDiagnosticsV1,
): WorkspaceIdentityV1 {
  try {
    return workspaceFromRow(row);
  } catch {
    return reportMalformed(diagnostics, 'workspace', row.id);
  }
}

function projectFromRowWithDiagnostics(
  row: ProjectIdentityDatabaseRowV1,
  diagnostics: IamHierarchyDiagnosticsV1,
): ProjectIdentityV1 {
  try {
    return projectFromRow(row);
  } catch {
    return reportMalformed(diagnostics, 'project', row.id);
  }
}

class PrismaIamHierarchyTransactionAdapter implements IamHierarchyTransactionPortV1 {
  public constructor(
    private readonly client: IamHierarchyDatabaseClientV1,
    private readonly diagnostics: IamHierarchyDiagnosticsV1,
  ) {}

  public async findOrganization(
    context: IamTenantContextV1,
    organizationId: StableIdentifierV1,
  ): Promise<OrganizationIdentityV1 | undefined> {
    if (!organizationVisible(context, organizationId)) return undefined;
    const row = await this.client.organizationIdentity.findUnique({
      where: { id: organizationId },
    });
    return row ? organizationFromRowWithDiagnostics(row, this.diagnostics) : undefined;
  }

  public async listOrganizations(
    context: IamTenantContextV1,
  ): Promise<readonly OrganizationIdentityV1[]> {
    if (context.tenantScope.scopeType !== 'organization') return [];
    const rows = await this.client.organizationIdentity.findMany({
      where: { id: context.tenantScope.organizationId },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => organizationFromRowWithDiagnostics(row, this.diagnostics));
  }

  public async findWorkspace(
    context: IamTenantContextV1,
    workspaceId: StableIdentifierV1,
  ): Promise<WorkspaceIdentityV1 | undefined> {
    const row = await this.client.workspaceIdentity.findUnique({ where: { id: workspaceId } });
    if (!row) return undefined;
    const workspace = workspaceFromRowWithDiagnostics(row, this.diagnostics);
    return workspaceVisible(context, workspace.organizationId, workspace.id)
      ? workspace
      : undefined;
  }

  public async listWorkspaces(
    context: IamTenantContextV1,
    organizationId: StableIdentifierV1,
  ): Promise<readonly WorkspaceIdentityV1[]> {
    if (!organizationVisible(context, organizationId)) return [];
    const rows = await this.client.workspaceIdentity.findMany({
      where: { organizationId },
      orderBy: { id: 'asc' },
    });
    return rows
      .map((row) => workspaceFromRowWithDiagnostics(row, this.diagnostics))
      .filter((workspace) => workspace.organizationId === organizationId);
  }

  public async findProject(
    context: IamTenantContextV1,
    projectId: StableIdentifierV1,
  ): Promise<ProjectIdentityV1 | undefined> {
    const row = await this.client.projectIdentity.findUnique({ where: { id: projectId } });
    if (!row) return undefined;
    const project = projectFromRowWithDiagnostics(row, this.diagnostics);
    return projectVisible(context, project.organizationId, project.workspaceId, project.id)
      ? project
      : undefined;
  }

  public async listProjects(
    context: IamTenantContextV1,
    workspaceId: StableIdentifierV1,
  ): Promise<readonly ProjectIdentityV1[]> {
    const rows = await this.client.projectIdentity.findMany({
      where: { workspaceId },
      orderBy: { id: 'asc' },
    });
    return rows
      .map((row) => projectFromRowWithDiagnostics(row, this.diagnostics))
      .filter((project) =>
        projectVisible(context, project.organizationId, project.workspaceId, project.id),
      );
  }

  public async saveOrganization(
    context: IamTenantContextV1,
    value: OrganizationIdentityV1,
  ): Promise<void> {
    const validated = createOrganizationIdentityV1(value);
    if (!validated.accepted) throw new Error(`IAM_${validated.code}`);
    if (!organizationVisible(context, validated.value.id)) throw new Error('IAM_SCOPE_DENIED');
    await this.saveImmutable(
      this.client.organizationIdentity,
      organizationRow(validated.value),
      'IAM_HIERARCHY_CONFLICT',
    );
  }

  public async saveWorkspace(
    context: IamTenantContextV1,
    value: WorkspaceIdentityV1,
  ): Promise<void> {
    const validated = createWorkspaceIdentityV1(value);
    if (!validated.accepted) throw new Error(`IAM_${validated.code}`);
    if (!organizationVisible(context, validated.value.organizationId))
      throw new Error('IAM_SCOPE_DENIED');
    const parent = await this.client.organizationIdentity.findUnique({
      where: { id: validated.value.organizationId },
    });
    if (!parent) throw new Error('IAM_PARENT_NOT_FOUND');
    organizationFromRowWithDiagnostics(parent, this.diagnostics);
    await this.saveImmutable(
      this.client.workspaceIdentity,
      workspaceRow(validated.value),
      'IAM_HIERARCHY_CONFLICT',
    );
  }

  public async saveProject(context: IamTenantContextV1, value: ProjectIdentityV1): Promise<void> {
    const validated = createProjectIdentityV1(value);
    if (!validated.accepted) throw new Error(`IAM_${validated.code}`);
    if (!workspaceVisible(context, validated.value.organizationId, validated.value.workspaceId))
      throw new Error('IAM_SCOPE_DENIED');
    const parent = await this.client.workspaceIdentity.findUnique({
      where: { id: validated.value.workspaceId },
    });
    if (!parent) throw new Error('IAM_PARENT_NOT_FOUND');
    const workspace = workspaceFromRowWithDiagnostics(parent, this.diagnostics);
    if (workspace.organizationId !== validated.value.organizationId)
      throw new Error('IAM_PARENT_NOT_FOUND');
    await this.saveImmutable(
      this.client.projectIdentity,
      projectRow(validated.value),
      'IAM_HIERARCHY_CONFLICT',
    );
  }

  private async saveImmutable<TRow extends { readonly id: string }>(
    delegate: IdentityDelegateV1<TRow>,
    expected: TRow,
    conflictCode: string,
  ): Promise<void> {
    const existing = await delegate.findUnique({ where: { id: expected.id } });
    if (existing) {
      if (!ownedFieldsMatch(existing, expected)) throw new Error(conflictCode);
      return;
    }
    try {
      await delegate.create({ data: expected });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new Error(conflictCode);
      throw error;
    }
  }
}

/** Prisma-backed IAM hierarchy adapter. Reads are scope-filtered and writes are immutable. */
export class PrismaIamHierarchyRepositoryAdapter implements IamHierarchyRepositoryPortV1 {
  private readonly diagnostics: IamHierarchyDiagnosticsV1;

  public constructor(
    private readonly client: IamHierarchyDatabaseClientV1,
    diagnostics: IamHierarchyDiagnosticsV1 = {},
  ) {
    this.diagnostics = diagnostics;
  }

  private transaction(): PrismaIamHierarchyTransactionAdapter {
    return new PrismaIamHierarchyTransactionAdapter(this.client, this.diagnostics);
  }

  public findOrganization(context: IamTenantContextV1, organizationId: StableIdentifierV1) {
    return this.transaction().findOrganization(context, organizationId);
  }

  public listOrganizations(context: IamTenantContextV1) {
    return this.transaction().listOrganizations(context);
  }

  public findWorkspace(context: IamTenantContextV1, workspaceId: StableIdentifierV1) {
    return this.transaction().findWorkspace(context, workspaceId);
  }

  public listWorkspaces(context: IamTenantContextV1, organizationId: StableIdentifierV1) {
    return this.transaction().listWorkspaces(context, organizationId);
  }

  public findProject(context: IamTenantContextV1, projectId: StableIdentifierV1) {
    return this.transaction().findProject(context, projectId);
  }

  public listProjects(context: IamTenantContextV1, workspaceId: StableIdentifierV1) {
    return this.transaction().listProjects(context, workspaceId);
  }

  public saveOrganization(context: IamTenantContextV1, value: OrganizationIdentityV1) {
    return this.client.$transaction((transaction) =>
      new PrismaIamHierarchyTransactionAdapter(transaction, this.diagnostics).saveOrganization(
        context,
        value,
      ),
    );
  }

  public saveWorkspace(context: IamTenantContextV1, value: WorkspaceIdentityV1) {
    return this.client.$transaction((transaction) =>
      new PrismaIamHierarchyTransactionAdapter(transaction, this.diagnostics).saveWorkspace(
        context,
        value,
      ),
    );
  }

  public saveProject(context: IamTenantContextV1, value: ProjectIdentityV1) {
    return this.client.$transaction((transaction) =>
      new PrismaIamHierarchyTransactionAdapter(transaction, this.diagnostics).saveProject(
        context,
        value,
      ),
    );
  }

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: IamHierarchyTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaIamHierarchyTransactionAdapter(transaction, this.diagnostics)),
    );
  }
}

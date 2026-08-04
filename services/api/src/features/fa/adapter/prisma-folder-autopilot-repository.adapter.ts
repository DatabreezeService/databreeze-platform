import {
  createAutopilotFolderBindingV1,
  createFolderAutopilotProfileV1,
  createRecipeAssignmentV1,
  type AutopilotFolderBindingV1,
  type FolderAutopilotProfileV1,
  type RecipeAssignmentV1,
} from '@databreeze/domain/folder-autopilot/v1';
import {
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  FolderAutopilotRepositoryPortV1,
  FolderAutopilotTransactionPortV1,
} from '../application/folder-autopilot-repository.port.js';

export interface FolderAutopilotProfileDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly version: number;
  readonly payloadHash: string;
  readonly stabilizationDelayMs: number;
  readonly maxFilesPerScan: number;
  readonly collisionPolicy: string;
  readonly undoWindowSeconds: number;
  readonly outputLineageEnabled: boolean;
  readonly createdAt: Date;
  readonly revision: number;
}

export interface FolderAutopilotBindingDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly deviceGrantId: string;
  readonly role: string;
  readonly expectedCapabilityDigest: string;
  readonly createdAt: Date;
  readonly revision: number;
}

export interface FolderAutopilotAssignmentDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly profileId: string;
  readonly profileVersion: number;
  readonly profileHash: string;
  readonly jraRecipeVersionId: string;
  readonly jraRecipeVersionHash: string;
  readonly deviceId: string;
  readonly inputBindingIds: unknown;
  readonly outputBindingIds: unknown;
  readonly dataModeConstraint: string | null;
  readonly effectiveDataModePolicyRef: string | null;
  readonly idempotencyKey: string;
  readonly state: string;
  readonly revision: number;
  readonly createdAt: Date;
}

export interface FolderAutopilotDatabaseClientV1 {
  readonly folderAutopilotProfileRecord: {
    create(input: {
      readonly data: FolderAutopilotProfileDatabaseRowV1;
    }): Promise<FolderAutopilotProfileDatabaseRowV1>;
    findFirst(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
    }): Promise<FolderAutopilotProfileDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy: Readonly<Record<string, 'asc' | 'desc'>>;
    }): Promise<readonly FolderAutopilotProfileDatabaseRowV1[]>;
  };
  readonly autopilotFolderBindingRecord: {
    create(input: {
      readonly data: FolderAutopilotBindingDatabaseRowV1;
    }): Promise<FolderAutopilotBindingDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<FolderAutopilotBindingDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy: Readonly<Record<string, 'asc' | 'desc'>>;
    }): Promise<readonly FolderAutopilotBindingDatabaseRowV1[]>;
  };
  readonly recipeAssignmentRecord: {
    create(input: {
      readonly data: FolderAutopilotAssignmentDatabaseRowV1;
    }): Promise<FolderAutopilotAssignmentDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<FolderAutopilotAssignmentDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy: Readonly<Record<string, 'asc' | 'desc'>>;
    }): Promise<readonly FolderAutopilotAssignmentDatabaseRowV1[]>;
    update(input: {
      readonly where: { readonly id: string };
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<FolderAutopilotAssignmentDatabaseRowV1>;
  };
  $transaction<TValue>(
    work: (transaction: FolderAutopilotDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function rowScope(row: {
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
}): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('FA_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function profileFromRow(row: FolderAutopilotProfileDatabaseRowV1): FolderAutopilotProfileV1 {
  const parsed = createFolderAutopilotProfileV1({
    profileId: row.id,
    tenantScope: rowScope(row),
    version: row.version,
    payloadHash: row.payloadHash,
    stabilizationDelayMs: row.stabilizationDelayMs,
    maxFilesPerScan: row.maxFilesPerScan,
    collisionPolicy: row.collisionPolicy,
    undoWindowSeconds: row.undoWindowSeconds,
    outputLineageEnabled: row.outputLineageEnabled,
    createdAt: row.createdAt.toISOString(),
  });
  if (!parsed.accepted) throw new Error('FA_PERSISTED_PROFILE_INVALID');
  return parsed.value;
}

function bindingFromRow(row: FolderAutopilotBindingDatabaseRowV1): AutopilotFolderBindingV1 {
  const parsed = createAutopilotFolderBindingV1({
    bindingId: row.id,
    tenantScope: rowScope(row),
    deviceGrantId: row.deviceGrantId,
    role: row.role,
    expectedCapabilityDigest: row.expectedCapabilityDigest,
    createdAt: row.createdAt.toISOString(),
  });
  if (!parsed.accepted) throw new Error('FA_PERSISTED_BINDING_INVALID');
  return parsed.value;
}

function assignmentFromRow(row: FolderAutopilotAssignmentDatabaseRowV1): RecipeAssignmentV1 {
  const parsed = createRecipeAssignmentV1({
    assignmentId: row.id,
    tenantScope: rowScope(row),
    profileId: row.profileId,
    profileVersion: row.profileVersion,
    profileHash: row.profileHash,
    jraRecipeVersionId: row.jraRecipeVersionId,
    jraRecipeVersionHash: row.jraRecipeVersionHash,
    deviceId: row.deviceId,
    inputBindingIds: row.inputBindingIds,
    outputBindingIds: row.outputBindingIds,
    ...(row.dataModeConstraint === null ? {} : { dataModeConstraint: row.dataModeConstraint }),
    ...(row.effectiveDataModePolicyRef === null
      ? {}
      : { effectiveDataModePolicyRef: row.effectiveDataModePolicyRef }),
    idempotencyKey: row.idempotencyKey,
    state: row.state,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
  });
  if (!parsed.accepted) throw new Error('FA_PERSISTED_ASSIGNMENT_INVALID');
  return parsed.value;
}

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaFolderAutopilotTransactionAdapter implements FolderAutopilotTransactionPortV1 {
  public constructor(private readonly client: FolderAutopilotDatabaseClientV1) {}

  public async saveProfile(
    context: IamTenantContextV1,
    profile: FolderAutopilotProfileV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, profile.tenantScope))
      throw new Error('FA_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.folderAutopilotProfileRecord.findFirst({
      where: { id: profile.profileId, version: profile.version },
    });
    if (existing) {
      if (JSON.stringify(profileFromRow(existing)) !== JSON.stringify(profile))
        throw new Error('FA_IMMUTABLE_PROFILE');
      return;
    }
    await this.client.folderAutopilotProfileRecord.create({
      data: {
        ...databaseScope(profile.tenantScope),
        id: profile.profileId,
        version: profile.version,
        payloadHash: profile.payloadHash,
        stabilizationDelayMs: profile.stabilizationDelayMs,
        maxFilesPerScan: profile.maxFilesPerScan,
        collisionPolicy: profile.collisionPolicy,
        undoWindowSeconds: profile.undoWindowSeconds,
        outputLineageEnabled: profile.outputLineageEnabled,
        createdAt: new Date(profile.createdAt),
        revision: profile.revision,
      },
    });
  }

  public async findProfile(
    context: IamTenantContextV1,
    profileId: FolderAutopilotProfileV1['profileId'],
    version?: number,
  ) {
    const row = await this.client.folderAutopilotProfileRecord.findFirst({
      where: { id: profileId, ...(version === undefined ? {} : { version }) },
      orderBy: { version: 'desc' },
    });
    return row !== null && visible(context.tenantScope, rowScope(row))
      ? profileFromRow(row)
      : undefined;
  }

  public async listProfiles(context: IamTenantContextV1) {
    const rows = await this.client.folderAutopilotProfileRecord.findMany({
      where: { organizationId: context.tenantScope.organizationId },
      orderBy: { id: 'asc' },
    });
    return rows.filter((row) => visible(context.tenantScope, rowScope(row))).map(profileFromRow);
  }

  public async saveBinding(
    context: IamTenantContextV1,
    binding: AutopilotFolderBindingV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, binding.tenantScope))
      throw new Error('FA_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.autopilotFolderBindingRecord.findUnique({
      where: { id: binding.bindingId },
    });
    if (existing) {
      if (JSON.stringify(bindingFromRow(existing)) !== JSON.stringify(binding))
        throw new Error('FA_IMMUTABLE_BINDING');
      return;
    }
    await this.client.autopilotFolderBindingRecord.create({
      data: {
        ...databaseScope(binding.tenantScope),
        id: binding.bindingId,
        deviceGrantId: binding.deviceGrantId,
        role: binding.role,
        expectedCapabilityDigest: binding.expectedCapabilityDigest,
        createdAt: new Date(binding.createdAt),
        revision: binding.revision,
      },
    });
  }

  public async findBinding(
    context: IamTenantContextV1,
    bindingId: AutopilotFolderBindingV1['bindingId'],
  ) {
    const row = await this.client.autopilotFolderBindingRecord.findUnique({
      where: { id: bindingId },
    });
    return row !== null && visible(context.tenantScope, rowScope(row))
      ? bindingFromRow(row)
      : undefined;
  }

  public async listBindings(context: IamTenantContextV1) {
    const rows = await this.client.autopilotFolderBindingRecord.findMany({
      where: { organizationId: context.tenantScope.organizationId },
      orderBy: { id: 'asc' },
    });
    return rows.filter((row) => visible(context.tenantScope, rowScope(row))).map(bindingFromRow);
  }

  public async saveAssignment(
    context: IamTenantContextV1,
    assignment: RecipeAssignmentV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, assignment.tenantScope))
      throw new Error('FA_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.recipeAssignmentRecord.findUnique({
      where: { id: assignment.assignmentId },
    });
    if (existing) {
      if (JSON.stringify(assignmentFromRow(existing)) !== JSON.stringify(assignment))
        throw new Error('FA_IMMUTABLE_ASSIGNMENT');
      return;
    }
    await this.client.recipeAssignmentRecord.create({
      data: {
        ...databaseScope(assignment.tenantScope),
        id: assignment.assignmentId,
        profileId: assignment.profileId,
        profileVersion: assignment.profileVersion,
        profileHash: assignment.profileHash,
        jraRecipeVersionId: assignment.jraRecipeVersionId,
        jraRecipeVersionHash: assignment.jraRecipeVersionHash,
        deviceId: assignment.deviceId,
        inputBindingIds: assignment.inputBindingIds,
        outputBindingIds: assignment.outputBindingIds,
        dataModeConstraint: assignment.dataModeConstraint ?? null,
        effectiveDataModePolicyRef: assignment.effectiveDataModePolicyRef ?? null,
        idempotencyKey: assignment.idempotencyKey,
        state: assignment.state,
        revision: assignment.revision,
        createdAt: new Date(assignment.createdAt),
      },
    });
  }

  public async findAssignment(
    context: IamTenantContextV1,
    assignmentId: RecipeAssignmentV1['assignmentId'],
  ) {
    const row = await this.client.recipeAssignmentRecord.findUnique({
      where: { id: assignmentId },
    });
    return row !== null && visible(context.tenantScope, rowScope(row))
      ? assignmentFromRow(row)
      : undefined;
  }

  public async listAssignments(context: IamTenantContextV1) {
    const rows = await this.client.recipeAssignmentRecord.findMany({
      where: { organizationId: context.tenantScope.organizationId },
      orderBy: { id: 'asc' },
    });
    return rows.filter((row) => visible(context.tenantScope, rowScope(row))).map(assignmentFromRow);
  }

  public async updateAssignmentState(
    context: IamTenantContextV1,
    assignmentId: RecipeAssignmentV1['assignmentId'],
    expectedRevision: number,
    state: RecipeAssignmentV1['state'],
  ): Promise<RecipeAssignmentV1> {
    const existing = await this.client.recipeAssignmentRecord.findUnique({
      where: { id: assignmentId },
    });
    if (!existing || !visible(context.tenantScope, rowScope(existing)))
      throw new Error('FA_ASSIGNMENT_NOT_FOUND');
    if (!tenantScopeContainsV1(context.tenantScope, rowScope(existing)))
      throw new Error('FA_SCOPE_NARROWING_REQUIRED');
    if (existing.revision !== expectedRevision) throw new Error('FA_ASSIGNMENT_REVISION_CONFLICT');
    const updated = await this.client.recipeAssignmentRecord.update({
      where: { id: assignmentId },
      data: { state, revision: expectedRevision + 1 },
    });
    return assignmentFromRow(updated);
  }
}

export class PrismaFolderAutopilotRepositoryAdapter implements FolderAutopilotRepositoryPortV1 {
  public constructor(private readonly client: FolderAutopilotDatabaseClientV1) {}

  public withTransaction<TValue>(
    _context: IamTenantContextV1,
    work: (transaction: FolderAutopilotTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaFolderAutopilotTransactionAdapter(transaction)),
    );
  }

  public saveProfile(context: IamTenantContextV1, profile: FolderAutopilotProfileV1) {
    return new PrismaFolderAutopilotTransactionAdapter(this.client).saveProfile(context, profile);
  }

  public findProfile(
    context: IamTenantContextV1,
    profileId: FolderAutopilotProfileV1['profileId'],
    version?: number,
  ) {
    return new PrismaFolderAutopilotTransactionAdapter(this.client).findProfile(
      context,
      profileId,
      version,
    );
  }

  public listProfiles(context: IamTenantContextV1) {
    return new PrismaFolderAutopilotTransactionAdapter(this.client).listProfiles(context);
  }

  public saveBinding(context: IamTenantContextV1, binding: AutopilotFolderBindingV1) {
    return new PrismaFolderAutopilotTransactionAdapter(this.client).saveBinding(context, binding);
  }

  public findBinding(
    context: IamTenantContextV1,
    bindingId: AutopilotFolderBindingV1['bindingId'],
  ) {
    return new PrismaFolderAutopilotTransactionAdapter(this.client).findBinding(context, bindingId);
  }

  public listBindings(context: IamTenantContextV1) {
    return new PrismaFolderAutopilotTransactionAdapter(this.client).listBindings(context);
  }

  public saveAssignment(context: IamTenantContextV1, assignment: RecipeAssignmentV1) {
    return new PrismaFolderAutopilotTransactionAdapter(this.client).saveAssignment(
      context,
      assignment,
    );
  }

  public findAssignment(
    context: IamTenantContextV1,
    assignmentId: RecipeAssignmentV1['assignmentId'],
  ) {
    return new PrismaFolderAutopilotTransactionAdapter(this.client).findAssignment(
      context,
      assignmentId,
    );
  }

  public listAssignments(context: IamTenantContextV1) {
    return new PrismaFolderAutopilotTransactionAdapter(this.client).listAssignments(context);
  }

  public updateAssignmentState(
    context: IamTenantContextV1,
    assignmentId: RecipeAssignmentV1['assignmentId'],
    expectedRevision: number,
    state: RecipeAssignmentV1['state'],
  ) {
    return new PrismaFolderAutopilotTransactionAdapter(this.client).updateAssignmentState(
      context,
      assignmentId,
      expectedRevision,
      state,
    );
  }
}

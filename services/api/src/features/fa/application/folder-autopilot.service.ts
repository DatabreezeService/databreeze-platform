import {
  createAutopilotFolderBindingV1,
  createFolderAutopilotProfileV1,
  createRecipeAssignmentV1,
  type AutopilotFolderBindingV1,
  type FolderAutopilotErrorCodeV1,
  type FolderAutopilotProfileV1,
  type RecipeAssignmentStateV1,
  type RecipeAssignmentV1,
} from '@databreeze/domain/folder-autopilot/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { DataModeV1 } from '@databreeze/domain/data-mode/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { FolderAutopilotRepositoryPortV1 } from './folder-autopilot-repository.port.js';

export const FOLDER_AUTOPILOT_SERVICE = Symbol('FOLDER_AUTOPILOT_SERVICE');
export const FOLDER_AUTOPILOT_DATA_MODE_POLICY_PORT = Symbol(
  'FOLDER_AUTOPILOT_DATA_MODE_POLICY_PORT',
);
export const FOLDER_AUTOPILOT_JRA_FACADE_PORT = Symbol('FOLDER_AUTOPILOT_JRA_FACADE_PORT');

export type FolderAutopilotDataModePolicyResultV1 =
  | { readonly accepted: true; readonly value: { readonly effectiveDataModePolicyRef: string } }
  | {
      readonly accepted: false;
      readonly code: 'DATA_MODE_BROADENS_WORKSPACE' | 'DATA_MODE_POLICY_UNAVAILABLE';
    };

/** DSO owns policy records; FA only calls this narrow integration facade. */
export interface FolderAutopilotDataModePolicyPortV1 {
  resolveNarrowed(
    context: IamTenantContextV1,
    requested: DataModeV1,
  ): Promise<FolderAutopilotDataModePolicyResultV1>;
}

export class UnavailableFolderAutopilotDataModePolicyAdapter
  implements FolderAutopilotDataModePolicyPortV1
{
  public resolveNarrowed(
    context: IamTenantContextV1,
    requested: DataModeV1,
  ): Promise<FolderAutopilotDataModePolicyResultV1> {
    void context;
    void requested;
    return Promise.resolve({ accepted: false, code: 'DATA_MODE_POLICY_UNAVAILABLE' as const });
  }
}

export interface FolderAutopilotJraFacadePortV1 {
  decideApproval(
    context: IamTenantContextV1,
    executionId: string,
    input: Readonly<Record<string, unknown>>,
  ): Promise<FolderAutopilotFacadeResultV1>;
  requestUndo(
    context: IamTenantContextV1,
    executionId: string,
    input: Readonly<Record<string, unknown>>,
  ): Promise<FolderAutopilotFacadeResultV1>;
}

export type FolderAutopilotFacadeResultV1 =
  | { readonly accepted: true; readonly value: Readonly<Record<string, unknown>> }
  | {
      readonly accepted: false;
      readonly code: 'FA_JRA_APPROVAL_FACADE_UNAVAILABLE' | 'FA_JRA_UNDO_FACADE_UNAVAILABLE';
    };

/** JRA remains the sole approval/effect authority; this adapter fails closed until composed. */
export class UnavailableFolderAutopilotJraFacadeAdapter implements FolderAutopilotJraFacadePortV1 {
  public decideApproval(
    context: IamTenantContextV1,
    executionId: string,
    input: Readonly<Record<string, unknown>>,
  ): Promise<FolderAutopilotFacadeResultV1> {
    void context;
    void executionId;
    void input;
    return Promise.resolve({
      accepted: false,
      code: 'FA_JRA_APPROVAL_FACADE_UNAVAILABLE' as const,
    });
  }

  public requestUndo(
    context: IamTenantContextV1,
    executionId: string,
    input: Readonly<Record<string, unknown>>,
  ): Promise<FolderAutopilotFacadeResultV1> {
    void context;
    void executionId;
    void input;
    return Promise.resolve({ accepted: false, code: 'FA_JRA_UNDO_FACADE_UNAVAILABLE' as const });
  }
}

export type FolderAutopilotServiceErrorV1 =
  | FolderAutopilotErrorCodeV1
  | 'FA_PROFILE_NOT_FOUND'
  | 'FA_BINDING_NOT_FOUND'
  | 'FA_ASSIGNMENT_NOT_FOUND'
  | 'FA_SCOPE_NARROWING_REQUIRED'
  | 'FA_IMMUTABLE_PROFILE'
  | 'FA_IMMUTABLE_BINDING'
  | 'FA_IMMUTABLE_ASSIGNMENT'
  | 'FA_PROFILE_HASH_MISMATCH'
  | 'FA_BINDING_ROLE_MISMATCH'
  | 'FA_ASSIGNMENT_REVISION_CONFLICT'
  | 'FA_PERSISTENCE_UNAVAILABLE'
  | 'DATA_MODE_BROADENS_WORKSPACE'
  | 'DATA_MODE_POLICY_UNAVAILABLE';

export type FolderAutopilotServiceResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: FolderAutopilotServiceErrorV1 };

type ProfileInputV1 = Omit<Parameters<typeof createFolderAutopilotProfileV1>[0], 'tenantScope'>;
type BindingInputV1 = Omit<Parameters<typeof createAutopilotFolderBindingV1>[0], 'tenantScope'>;
type AssignmentInputV1 = Omit<Parameters<typeof createRecipeAssignmentV1>[0], 'tenantScope'>;

function rejected<TValue>(
  code: FolderAutopilotServiceErrorV1,
): FolderAutopilotServiceResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function mapPersistenceError(error: unknown): FolderAutopilotServiceErrorV1 {
  const code = error instanceof Error ? error.message : '';
  if (
    code === 'FA_SCOPE_NARROWING_REQUIRED' ||
    code === 'FA_IMMUTABLE_PROFILE' ||
    code === 'FA_IMMUTABLE_BINDING' ||
    code === 'FA_IMMUTABLE_ASSIGNMENT' ||
    code === 'FA_PROFILE_NOT_FOUND' ||
    code === 'FA_BINDING_NOT_FOUND' ||
    code === 'FA_ASSIGNMENT_NOT_FOUND' ||
    code === 'FA_ASSIGNMENT_REVISION_CONFLICT'
  )
    return code;
  return 'FA_PERSISTENCE_UNAVAILABLE' as FolderAutopilotServiceErrorV1;
}

function parseId(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

/** Coordinates FA-owned records without copying JRA recipe or DSO grant authority. */
export class FolderAutopilotService {
  public constructor(
    private readonly repository: FolderAutopilotRepositoryPortV1,
    private readonly dataModePolicy: FolderAutopilotDataModePolicyPortV1 = new UnavailableFolderAutopilotDataModePolicyAdapter(),
  ) {}

  public async createProfile(
    context: IamTenantContextV1,
    input: ProfileInputV1,
  ): Promise<FolderAutopilotServiceResultV1<FolderAutopilotProfileV1>> {
    const created = createFolderAutopilotProfileV1({
      ...input,
      tenantScope: context.tenantScope,
    });
    if (!created.accepted) return created;
    return this.repository
      .withTransaction(
        context,
        async (transaction): Promise<FolderAutopilotServiceResultV1<FolderAutopilotProfileV1>> => {
          const existing = await transaction.findProfile(
            context,
            created.value.profileId,
            created.value.version,
          );
          if (existing) {
            if (JSON.stringify(existing) === JSON.stringify(created.value))
              return Object.freeze({ accepted: true, value: existing });
            return rejected('FA_IMMUTABLE_PROFILE');
          }
          await transaction.saveProfile(context, created.value);
          return created;
        },
      )
      .catch((error: unknown) => rejected(mapPersistenceError(error)));
  }

  public async createBinding(
    context: IamTenantContextV1,
    input: BindingInputV1,
  ): Promise<FolderAutopilotServiceResultV1<AutopilotFolderBindingV1>> {
    const created = createAutopilotFolderBindingV1({
      ...input,
      tenantScope: context.tenantScope,
    });
    if (!created.accepted) return created;
    return this.repository
      .withTransaction(
        context,
        async (transaction): Promise<FolderAutopilotServiceResultV1<AutopilotFolderBindingV1>> => {
          const existing = await transaction.findBinding(context, created.value.bindingId);
          if (existing) {
            if (JSON.stringify(existing) === JSON.stringify(created.value))
              return Object.freeze({ accepted: true, value: existing });
            return rejected('FA_IMMUTABLE_BINDING');
          }
          await transaction.saveBinding(context, created.value);
          return created;
        },
      )
      .catch((error: unknown) => rejected(mapPersistenceError(error)));
  }

  public async createAssignment(
    context: IamTenantContextV1,
    input: AssignmentInputV1,
  ): Promise<FolderAutopilotServiceResultV1<RecipeAssignmentV1>> {
    let effectiveDataModePolicyRef: string | undefined;
    if (input.dataModeConstraint !== undefined) {
      const requested = input.dataModeConstraint;
      const resolution = await this.dataModePolicy.resolveNarrowed(
        context,
        requested as DataModeV1,
      );
      if (!resolution.accepted) return rejected(resolution.code);
      effectiveDataModePolicyRef = resolution.value.effectiveDataModePolicyRef;
    }
    const created = createRecipeAssignmentV1({
      ...input,
      tenantScope: context.tenantScope,
      ...(effectiveDataModePolicyRef === undefined ? {} : { effectiveDataModePolicyRef }),
    });
    if (!created.accepted) return created;
    return this.repository
      .withTransaction(
        context,
        async (transaction): Promise<FolderAutopilotServiceResultV1<RecipeAssignmentV1>> => {
          const profile = await transaction.findProfile(
            context,
            created.value.profileId,
            created.value.profileVersion,
          );
          if (!profile) return rejected('FA_PROFILE_NOT_FOUND');
          if (profile.payloadHash !== created.value.profileHash)
            return rejected('FA_PROFILE_HASH_MISMATCH');
          for (const bindingId of created.value.inputBindingIds) {
            const binding = await transaction.findBinding(context, bindingId);
            if (!binding) return rejected('FA_BINDING_NOT_FOUND');
            if (binding.role !== 'INPUT') return rejected('FA_BINDING_ROLE_MISMATCH');
          }
          for (const bindingId of created.value.outputBindingIds) {
            const binding = await transaction.findBinding(context, bindingId);
            if (!binding) return rejected('FA_BINDING_NOT_FOUND');
            if (binding.role !== 'OUTPUT') return rejected('FA_BINDING_ROLE_MISMATCH');
          }
          const existing = await transaction.findAssignment(context, created.value.assignmentId);
          if (existing) {
            if (JSON.stringify(existing) === JSON.stringify(created.value))
              return Object.freeze({ accepted: true, value: existing });
            return rejected('FA_IMMUTABLE_ASSIGNMENT');
          }
          await transaction.saveAssignment(context, created.value);
          return created;
        },
      )
      .catch((error: unknown) => rejected(mapPersistenceError(error)));
  }

  public async updateAssignmentState(
    context: IamTenantContextV1,
    assignmentIdInput: unknown,
    expectedRevision: number,
    state: RecipeAssignmentStateV1,
  ): Promise<FolderAutopilotServiceResultV1<RecipeAssignmentV1>> {
    const assignmentId = parseId(assignmentIdInput);
    if (!assignmentId) return rejected('INVALID_IDENTIFIER');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      return rejected('INVALID_REVISION');
    if (!['DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED'].includes(state)) return rejected('INVALID_STATE');
    try {
      const value = await this.repository.updateAssignmentState(
        context,
        assignmentId,
        expectedRevision,
        state,
      );
      return Object.freeze({ accepted: true as const, value });
    } catch (error) {
      return rejected<RecipeAssignmentV1>(mapPersistenceError(error));
    }
  }

  public async findProfile(
    context: IamTenantContextV1,
    profileIdInput: unknown,
    version?: number,
  ): Promise<FolderAutopilotServiceResultV1<FolderAutopilotProfileV1>> {
    const profileId = parseId(profileIdInput);
    if (!profileId) return rejected('INVALID_IDENTIFIER');
    if (
      version !== undefined &&
      (!Number.isSafeInteger(version) || version < 1 || version > 10_000)
    )
      return rejected('INVALID_VERSION');
    try {
      const value = await this.repository.findProfile(context, profileId, version);
      return value ? Object.freeze({ accepted: true, value }) : rejected('FA_PROFILE_NOT_FOUND');
    } catch (error) {
      return rejected<FolderAutopilotProfileV1>(mapPersistenceError(error));
    }
  }

  public async findBinding(
    context: IamTenantContextV1,
    bindingIdInput: unknown,
  ): Promise<FolderAutopilotServiceResultV1<AutopilotFolderBindingV1>> {
    const bindingId = parseId(bindingIdInput);
    if (!bindingId) return rejected('INVALID_IDENTIFIER');
    try {
      const value = await this.repository.findBinding(context, bindingId);
      return value ? Object.freeze({ accepted: true, value }) : rejected('FA_BINDING_NOT_FOUND');
    } catch (error) {
      return rejected<AutopilotFolderBindingV1>(mapPersistenceError(error));
    }
  }

  public async findAssignment(
    context: IamTenantContextV1,
    assignmentIdInput: unknown,
  ): Promise<FolderAutopilotServiceResultV1<RecipeAssignmentV1>> {
    const assignmentId = parseId(assignmentIdInput);
    if (!assignmentId) return rejected('INVALID_IDENTIFIER');
    try {
      const value = await this.repository.findAssignment(context, assignmentId);
      return value ? Object.freeze({ accepted: true, value }) : rejected('FA_ASSIGNMENT_NOT_FOUND');
    } catch (error) {
      return rejected<RecipeAssignmentV1>(mapPersistenceError(error));
    }
  }

  public async listProfiles(
    context: IamTenantContextV1,
  ): Promise<FolderAutopilotServiceResultV1<readonly FolderAutopilotProfileV1[]>> {
    try {
      return Object.freeze({ accepted: true, value: await this.repository.listProfiles(context) });
    } catch (error) {
      return rejected<readonly FolderAutopilotProfileV1[]>(mapPersistenceError(error));
    }
  }

  public async listBindings(
    context: IamTenantContextV1,
  ): Promise<FolderAutopilotServiceResultV1<readonly AutopilotFolderBindingV1[]>> {
    try {
      return Object.freeze({ accepted: true, value: await this.repository.listBindings(context) });
    } catch (error) {
      return rejected<readonly AutopilotFolderBindingV1[]>(mapPersistenceError(error));
    }
  }

  public async listAssignments(
    context: IamTenantContextV1,
  ): Promise<FolderAutopilotServiceResultV1<readonly RecipeAssignmentV1[]>> {
    try {
      return Object.freeze({
        accepted: true,
        value: await this.repository.listAssignments(context),
      });
    } catch (error) {
      return rejected<readonly RecipeAssignmentV1[]>(mapPersistenceError(error));
    }
  }

  public decideApproval(
    context: IamTenantContextV1,
    executionId: string,
    input: Readonly<Record<string, unknown>>,
    facade: FolderAutopilotJraFacadePortV1,
  ): Promise<FolderAutopilotFacadeResultV1> {
    return facade.decideApproval(context, executionId, input);
  }

  public requestUndo(
    context: IamTenantContextV1,
    executionId: string,
    input: Readonly<Record<string, unknown>>,
    facade: FolderAutopilotJraFacadePortV1,
  ): Promise<FolderAutopilotFacadeResultV1> {
    return facade.requestUndo(context, executionId, input);
  }
}

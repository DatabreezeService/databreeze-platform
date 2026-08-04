import type {
  AutopilotFolderBindingV1,
  FolderAutopilotProfileV1,
  RecipeAssignmentStateV1,
  RecipeAssignmentV1,
} from '@databreeze/domain/folder-autopilot/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const FOLDER_AUTOPILOT_REPOSITORY_PORT = Symbol('FOLDER_AUTOPILOT_REPOSITORY_PORT');

export interface FolderAutopilotTransactionPortV1 {
  saveProfile(context: IamTenantContextV1, profile: FolderAutopilotProfileV1): Promise<void>;
  findProfile(
    context: IamTenantContextV1,
    profileId: StableIdentifierV1,
    version?: number,
  ): Promise<FolderAutopilotProfileV1 | undefined>;
  listProfiles(
    context: IamTenantContextV1,
  ): Promise<readonly FolderAutopilotProfileV1[]>;
  saveBinding(context: IamTenantContextV1, binding: AutopilotFolderBindingV1): Promise<void>;
  findBinding(
    context: IamTenantContextV1,
    bindingId: StableIdentifierV1,
  ): Promise<AutopilotFolderBindingV1 | undefined>;
  listBindings(
    context: IamTenantContextV1,
  ): Promise<readonly AutopilotFolderBindingV1[]>;
  saveAssignment(context: IamTenantContextV1, assignment: RecipeAssignmentV1): Promise<void>;
  findAssignment(
    context: IamTenantContextV1,
    assignmentId: StableIdentifierV1,
  ): Promise<RecipeAssignmentV1 | undefined>;
  listAssignments(
    context: IamTenantContextV1,
  ): Promise<readonly RecipeAssignmentV1[]>;
  updateAssignmentState(
    context: IamTenantContextV1,
    assignmentId: StableIdentifierV1,
    expectedRevision: number,
    state: RecipeAssignmentStateV1,
  ): Promise<RecipeAssignmentV1>;
}

export interface FolderAutopilotRepositoryPortV1 extends FolderAutopilotTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: FolderAutopilotTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

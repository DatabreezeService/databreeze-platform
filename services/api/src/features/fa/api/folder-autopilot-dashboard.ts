import type {
  FolderAutopilotProfileV1,
  RecipeAssignmentV1,
} from '@databreeze/domain/folder-autopilot/v1';

/**
 * The dashboard is a read-only projection. It deliberately contains no local
 * paths, handles, bytes, or independent JRA/DSO authority.
 */
export interface FolderAutopilotDashboardProjectionV1 {
  readonly schemaVersion: 1;
  readonly profiles: readonly FolderAutopilotDashboardProfileV1[];
  readonly assignments: readonly FolderAutopilotDashboardAssignmentV1[];
  readonly previews: readonly [];
  readonly approvals: readonly [];
  readonly executions: readonly [];
  readonly exceptions: readonly [];
  readonly health: readonly [];
}

export interface FolderAutopilotDashboardProfileV1 {
  readonly profileId: string;
  readonly version: number;
  readonly stabilizationSeconds: number;
  readonly collisionPolicy: FolderAutopilotProfileV1['collisionPolicy'];
  readonly confidenceThreshold: 1;
  readonly undoWindowHours: number;
  readonly approvalRequired: true;
  readonly dataModeConstraint: 'Hybrid';
  readonly recipeHash: string;
  readonly updatedAt: string;
}

export interface FolderAutopilotDashboardAssignmentV1 {
  readonly assignmentId: string;
  readonly profileId: string;
  readonly jraRecipeVersionId: string;
  readonly deviceId: string;
  readonly inputBindingId: string;
  readonly outputBindingId: string;
  readonly dataModeConstraint?: RecipeAssignmentV1['dataModeConstraint'];
  readonly state: RecipeAssignmentV1['state'];
  readonly approvalRequired: true;
  readonly revision: number;
  readonly updatedAt: string;
}

function profileProjection(profile: FolderAutopilotProfileV1): FolderAutopilotDashboardProfileV1 {
  return Object.freeze({
    profileId: profile.profileId,
    version: profile.version,
    stabilizationSeconds: Math.floor(profile.stabilizationDelayMs / 1_000),
    collisionPolicy: profile.collisionPolicy,
    confidenceThreshold: 1 as const,
    undoWindowHours: Math.floor(profile.undoWindowSeconds / 3_600),
    approvalRequired: true as const,
    dataModeConstraint: 'Hybrid' as const,
    recipeHash: profile.payloadHash,
    updatedAt: profile.createdAt,
  });
}

function assignmentProjection(
  assignment: RecipeAssignmentV1,
): FolderAutopilotDashboardAssignmentV1 {
  const inputBindingId = assignment.inputBindingIds[0];
  const outputBindingId = assignment.outputBindingIds[0];
  if (inputBindingId === undefined || outputBindingId === undefined) {
    throw new Error('FA_ASSIGNMENT_BINDINGS_INVALID');
  }
  return Object.freeze({
    assignmentId: assignment.assignmentId,
    profileId: assignment.profileId,
    jraRecipeVersionId: assignment.jraRecipeVersionId,
    deviceId: assignment.deviceId,
    inputBindingId,
    outputBindingId,
    ...(assignment.dataModeConstraint === undefined
      ? {}
      : { dataModeConstraint: assignment.dataModeConstraint }),
    state: assignment.state,
    approvalRequired: true as const,
    revision: assignment.revision,
    updatedAt: assignment.updatedAt,
  });
}

export function buildFolderAutopilotDashboardProjection(
  profiles: readonly FolderAutopilotProfileV1[],
  assignments: readonly RecipeAssignmentV1[],
): FolderAutopilotDashboardProjectionV1 {
  const empty: readonly [] = Object.freeze([]);
  return Object.freeze({
    schemaVersion: 1 as const,
    profiles: Object.freeze(profiles.map(profileProjection)),
    assignments: Object.freeze(assignments.map(assignmentProjection)),
    previews: empty,
    approvals: empty,
    executions: empty,
    exceptions: empty,
    health: empty,
  });
}

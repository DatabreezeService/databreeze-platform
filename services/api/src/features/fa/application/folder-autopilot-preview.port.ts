import {
  createFolderAutopilotRecipeV1,
  type FolderAutopilotFileV1,
  type FolderAutopilotPreviewV1,
  type FolderAutopilotResultV1,
} from '@databreeze/domain/folder-autopilot/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const FOLDER_AUTOPILOT_PREVIEW_PORT = Symbol('FOLDER_AUTOPILOT_PREVIEW_PORT');

export type FolderAutopilotPreviewRecipeInputV1 = Omit<
  Parameters<typeof createFolderAutopilotRecipeV1>[0],
  'tenantScope'
>;

export interface FolderAutopilotPreviewInputV1 {
  /**
   * A caller-supplied, pinned recipe descriptor. JRA remains the canonical
   * owner of durable recipes; this ephemeral operation never persists it.
   */
  readonly recipe: FolderAutopilotPreviewRecipeInputV1;
  /** Content-free metadata only. Paths are constrained to relative paths. */
  readonly files: readonly FolderAutopilotFileV1[];
}

export type FolderAutopilotPreviewPortResultV1 =
  | FolderAutopilotResultV1<FolderAutopilotPreviewV1>
  | { readonly accepted: false; readonly code: 'PREVIEW_UNAVAILABLE' };

/** Executes a bounded, non-persistent preview without any filesystem access. */
export interface FolderAutopilotPreviewPortV1 {
  preview(
    context: IamTenantContextV1,
    input: FolderAutopilotPreviewInputV1,
  ): Promise<FolderAutopilotPreviewPortResultV1>;
}

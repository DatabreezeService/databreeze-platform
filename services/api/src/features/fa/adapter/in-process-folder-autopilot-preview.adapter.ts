import {
  createFolderAutopilotRecipeV1,
  previewFolderAutopilotRecipeV1,
} from '@databreeze/domain/folder-autopilot/v1';

import type {
  FolderAutopilotPreviewInputV1,
  FolderAutopilotPreviewPortResultV1,
  FolderAutopilotPreviewPortV1,
} from '../application/folder-autopilot-preview.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

/**
 * The in-process adapter is intentionally pure: it only evaluates supplied
 * relative-path metadata and never opens a local path or stores a preview.
 */
export class InProcessFolderAutopilotPreviewAdapter implements FolderAutopilotPreviewPortV1 {
  public preview(
    context: IamTenantContextV1,
    input: FolderAutopilotPreviewInputV1,
  ): Promise<FolderAutopilotPreviewPortResultV1> {
    try {
      const recipe = createFolderAutopilotRecipeV1({
        ...input.recipe,
        tenantScope: context.tenantScope,
      });
      if (!recipe.accepted) return Promise.resolve(recipe);
      return Promise.resolve(previewFolderAutopilotRecipeV1(recipe.value, input.files));
    } catch {
      return Promise.resolve(
        Object.freeze({ accepted: false, code: 'PREVIEW_UNAVAILABLE' as const }),
      );
    }
  }
}

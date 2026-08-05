import { Inject, Injectable } from '@nestjs/common';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import {
  FOLDER_AUTOPILOT_PREVIEW_PORT,
  type FolderAutopilotPreviewInputV1,
  type FolderAutopilotPreviewPortResultV1,
  type FolderAutopilotPreviewPortV1,
} from './folder-autopilot-preview.port.js';

export type FolderAutopilotPreviewServiceResultV1 =
  | FolderAutopilotPreviewPortResultV1
  | { readonly accepted: false; readonly code: 'WORKSPACE_SCOPE_REQUIRED' };

/**
 * Keeps a preview tenant-bound while deliberately avoiding durable recipe,
 * filesystem, device-grant, approval, or execution state.
 */
@Injectable()
export class FolderAutopilotPreviewService {
  public constructor(
    @Inject(FOLDER_AUTOPILOT_PREVIEW_PORT)
    private readonly previewPort: FolderAutopilotPreviewPortV1,
  ) {}

  public preview(
    context: IamTenantContextV1,
    input: FolderAutopilotPreviewInputV1,
  ): Promise<FolderAutopilotPreviewServiceResultV1> {
    if (context.tenantScope.scopeType !== 'workspace')
      return Promise.resolve(
        Object.freeze({ accepted: false, code: 'WORKSPACE_SCOPE_REQUIRED' as const }),
      );
    return this.previewPort.preview(context, input);
  }
}

import { type DynamicModule, Module } from '@nestjs/common';

import { InProcessFolderAutopilotPreviewAdapter } from './adapter/in-process-folder-autopilot-preview.adapter.js';
import { FolderAutopilotPreviewController } from './api/folder-autopilot-preview.controller.js';
import {
  FOLDER_AUTOPILOT_PREVIEW_PORT,
  type FolderAutopilotPreviewPortV1,
} from './application/folder-autopilot-preview.port.js';
import { FolderAutopilotPreviewService } from './application/folder-autopilot-preview.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface FaModuleOptions {
  readonly folderAutopilotPreviewPort?: FolderAutopilotPreviewPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class FaModule {
  public static register(options: FaModuleOptions = {}): DynamicModule {
    return {
      module: FaModule,
      controllers: [FolderAutopilotPreviewController],
      providers: [
        {
          provide: FOLDER_AUTOPILOT_PREVIEW_PORT,
          useValue:
            options.folderAutopilotPreviewPort ?? new InProcessFolderAutopilotPreviewAdapter(),
        },
        FolderAutopilotPreviewService,
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [FOLDER_AUTOPILOT_PREVIEW_PORT],
    };
  }
}

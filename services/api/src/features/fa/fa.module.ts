import { type DynamicModule, Module } from '@nestjs/common';

import { FolderAutopilotController } from './api/folder-autopilot.controller.js';
import { InMemoryFolderAutopilotRepositoryAdapter } from './adapter/in-memory-folder-autopilot-repository.adapter.js';
import {
  PrismaFolderAutopilotRepositoryAdapter,
  type FolderAutopilotDatabaseClientV1,
} from './adapter/prisma-folder-autopilot-repository.adapter.js';
import {
  FOLDER_AUTOPILOT_DATA_MODE_POLICY_PORT,
  FOLDER_AUTOPILOT_JRA_FACADE_PORT,
  FOLDER_AUTOPILOT_SERVICE,
  FolderAutopilotService,
  type FolderAutopilotDataModePolicyPortV1,
  type FolderAutopilotJraFacadePortV1,
  UnavailableFolderAutopilotDataModePolicyAdapter,
  UnavailableFolderAutopilotJraFacadeAdapter,
} from './application/folder-autopilot.service.js';
import {
  FOLDER_AUTOPILOT_REPOSITORY_PORT,
  type FolderAutopilotRepositoryPortV1,
} from './application/folder-autopilot-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface FaModuleOptions {
  /** Production composition passes the generated Prisma client; tests may use in-memory state. */
  readonly folderAutopilotDatabase?: FolderAutopilotDatabaseClientV1;
  readonly folderAutopilotRepository?: FolderAutopilotRepositoryPortV1;
  /** DSO owns policy authority; FA receives only this narrow facade. */
  readonly folderAutopilotDataModePolicy?: FolderAutopilotDataModePolicyPortV1;
  /** JRA owns ApprovalRequest/Decision and effects; FA receives only this facade. */
  readonly folderAutopilotJraFacade?: FolderAutopilotJraFacadePortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class FaModule {
  public static register(options: FaModuleOptions = {}): DynamicModule {
    if (
      process.env['NODE_ENV'] === 'production' &&
      options.folderAutopilotRepository === undefined &&
      options.folderAutopilotDatabase === undefined
    ) {
      throw new Error('FA_PERSISTENCE_REQUIRED');
    }
    const repository =
      options.folderAutopilotRepository ??
      (options.folderAutopilotDatabase === undefined
        ? new InMemoryFolderAutopilotRepositoryAdapter()
        : new PrismaFolderAutopilotRepositoryAdapter(options.folderAutopilotDatabase));
    const dataModePolicy =
      options.folderAutopilotDataModePolicy ??
      new UnavailableFolderAutopilotDataModePolicyAdapter();
    const jraFacade =
      options.folderAutopilotJraFacade ?? new UnavailableFolderAutopilotJraFacadeAdapter();
    return {
      module: FaModule,
      controllers: [FolderAutopilotController],
      providers: [
        { provide: FOLDER_AUTOPILOT_REPOSITORY_PORT, useValue: repository },
        {
          provide: FOLDER_AUTOPILOT_DATA_MODE_POLICY_PORT,
          useValue: dataModePolicy,
        },
        { provide: FOLDER_AUTOPILOT_JRA_FACADE_PORT, useValue: jraFacade },
        {
          provide: FOLDER_AUTOPILOT_SERVICE,
          useFactory: (
            folderRepository: FolderAutopilotRepositoryPortV1,
            policy: FolderAutopilotDataModePolicyPortV1,
          ): FolderAutopilotService => new FolderAutopilotService(folderRepository, policy),
          inject: [FOLDER_AUTOPILOT_REPOSITORY_PORT, FOLDER_AUTOPILOT_DATA_MODE_POLICY_PORT],
        },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [FOLDER_AUTOPILOT_REPOSITORY_PORT, FOLDER_AUTOPILOT_SERVICE],
    };
  }
}

import { type DynamicModule, Module } from '@nestjs/common';

import { SpreadsheetAuditController } from './api/spreadsheet-audit.controller.js';
import { InMemorySpreadsheetAuditRepositoryAdapter } from './adapter/in-memory-spreadsheet-audit-repository.adapter.js';
import {
  SPREADSHEET_AUDIT_REPOSITORY_PORT,
  type SpreadsheetAuditRepositoryPortV1,
} from './application/spreadsheet-audit-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface SaModuleOptions {
  readonly spreadsheetAuditRepository?: SpreadsheetAuditRepositoryPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class SaModule {
  public static register(options: SaModuleOptions = {}): DynamicModule {
    return {
      module: SaModule,
      controllers: [SpreadsheetAuditController],
      providers: [
        {
          provide: SPREADSHEET_AUDIT_REPOSITORY_PORT,
          useValue: options.spreadsheetAuditRepository ?? new InMemorySpreadsheetAuditRepositoryAdapter(),
        },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [SPREADSHEET_AUDIT_REPOSITORY_PORT],
    };
  }
}

import { type DynamicModule, Module } from '@nestjs/common';

import { SpreadsheetAuditController } from './api/spreadsheet-audit.controller.js';
import { SpreadsheetAuditRunController } from './api/spreadsheet-audit-run.controller.js';
import { InMemorySpreadsheetAuditRepositoryAdapter } from './adapter/in-memory-spreadsheet-audit-repository.adapter.js';
import { InMemorySpreadsheetAuditRunRepositoryAdapter } from './adapter/in-memory-spreadsheet-audit-run-repository.adapter.js';
import {
  PrismaSpreadsheetAuditRepositoryAdapter,
  type SpreadsheetAuditDatabaseClientV1,
} from './adapter/prisma-spreadsheet-audit-repository.adapter.js';
import {
  SPREADSHEET_AUDIT_REPOSITORY_PORT,
  type SpreadsheetAuditRepositoryPortV1,
} from './application/spreadsheet-audit-repository.port.js';
import {
  SPREADSHEET_AUDIT_RUN_REPOSITORY_PORT,
  type SpreadsheetAuditRunRepositoryPortV1,
} from './application/spreadsheet-audit-run-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface SaModuleOptions {
  readonly spreadsheetAuditRepository?: SpreadsheetAuditRepositoryPortV1;
  readonly spreadsheetAuditRunRepository?: SpreadsheetAuditRunRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly spreadsheetAuditDatabase?: SpreadsheetAuditDatabaseClientV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class SaModule {
  public static register(options: SaModuleOptions = {}): DynamicModule {
    return {
      module: SaModule,
      controllers: [SpreadsheetAuditController, SpreadsheetAuditRunController],
      providers: [
        {
          provide: SPREADSHEET_AUDIT_REPOSITORY_PORT,
          useValue:
            options.spreadsheetAuditRepository ??
            (options.spreadsheetAuditDatabase === undefined
              ? new InMemorySpreadsheetAuditRepositoryAdapter()
              : new PrismaSpreadsheetAuditRepositoryAdapter(options.spreadsheetAuditDatabase)),
        },
        {
          provide: SPREADSHEET_AUDIT_RUN_REPOSITORY_PORT,
          useValue:
            options.spreadsheetAuditRunRepository ??
            new InMemorySpreadsheetAuditRunRepositoryAdapter(),
        },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [SPREADSHEET_AUDIT_REPOSITORY_PORT, SPREADSHEET_AUDIT_RUN_REPOSITORY_PORT],
    };
  }
}

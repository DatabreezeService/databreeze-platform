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
  ARTIFACT_REPOSITORY_PORT,
  type ArtifactRepositoryPortV1,
} from '../iae/application/artifact-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface SaModuleOptions {
  readonly spreadsheetAuditRepository?: SpreadsheetAuditRepositoryPortV1;
  readonly artifactRepository?: ArtifactRepositoryPortV1;
  readonly spreadsheetAuditRunRepository?: SpreadsheetAuditRunRepositoryPortV1;
  /** Local/test composition must opt in; production requires a durable JRA-owned store. */
  readonly allowInMemorySpreadsheetAuditRunRepository?: boolean;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly spreadsheetAuditDatabase?: SpreadsheetAuditDatabaseClientV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class SaModule {
  public static register(options: SaModuleOptions = {}): DynamicModule {
    const spreadsheetAuditRunRepository =
      options.spreadsheetAuditRunRepository ??
      (options.allowInMemorySpreadsheetAuditRunRepository === true
        ? new InMemorySpreadsheetAuditRunRepositoryAdapter()
        : undefined);
    if (spreadsheetAuditRunRepository === undefined)
      throw new Error('SA_RUN_DURABLE_REPOSITORY_REQUIRED');

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
          useValue: spreadsheetAuditRunRepository,
        },
        ...(options.artifactRepository === undefined
          ? []
          : [{ provide: ARTIFACT_REPOSITORY_PORT, useValue: options.artifactRepository }]),
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [
        SPREADSHEET_AUDIT_REPOSITORY_PORT,
        SPREADSHEET_AUDIT_RUN_REPOSITORY_PORT,
        ...(options.artifactRepository === undefined ? [] : [ARTIFACT_REPOSITORY_PORT]),
      ],
    };
  }
}

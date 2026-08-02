import { type DynamicModule, Module } from '@nestjs/common';

import { AuditLedgerService } from './application/audit-ledger.service.js';
import {
  AUDIT_REPOSITORY_PORT,
  type AuditRepositoryPortV1,
} from './application/audit-repository.port.js';
import { InMemoryAuditRepositoryAdapter } from './adapter/in-memory-audit-repository.adapter.js';
import {
  PrismaAuditRepositoryAdapter,
  type AuditDatabaseClientV1,
} from './adapter/prisma-audit-repository.adapter.js';
import { Sha256AuditDigestAdapter } from './adapter/sha256-audit-digest.adapter.js';
import { AuditController } from './api/audit.controller.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export const AUDIT_LEDGER_SERVICE = Symbol('AUDIT_LEDGER_SERVICE');

export interface AudModuleOptions {
  readonly auditRepository?: AuditRepositoryPortV1;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly auditDatabase?: AuditDatabaseClientV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class AudModule {
  public static register(options: AudModuleOptions = {}): DynamicModule {
    const digest = new Sha256AuditDigestAdapter();
    const repository =
      options.auditRepository ??
      (options.auditDatabase === undefined
        ? new InMemoryAuditRepositoryAdapter()
        : new PrismaAuditRepositoryAdapter(options.auditDatabase, digest));
    const service = new AuditLedgerService(repository, digest);
    return {
      module: AudModule,
      controllers: [AuditController],
      providers: [
        { provide: AUDIT_REPOSITORY_PORT, useValue: repository },
        { provide: AUDIT_LEDGER_SERVICE, useValue: service },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [AUDIT_REPOSITORY_PORT, AUDIT_LEDGER_SERVICE],
    };
  }
}

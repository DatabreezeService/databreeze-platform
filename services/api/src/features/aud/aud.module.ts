import { type DynamicModule, Module } from '@nestjs/common';

import { AuditLedgerService } from './application/audit-ledger.service.js';
import {
  AUDIT_REPOSITORY_PORT,
  type AuditRepositoryPortV1,
} from './application/audit-repository.port.js';
import { InMemoryAuditRepositoryAdapter } from './adapter/in-memory-audit-repository.adapter.js';
import { Sha256AuditDigestAdapter } from './adapter/sha256-audit-digest.adapter.js';

export const AUDIT_LEDGER_SERVICE = Symbol('AUDIT_LEDGER_SERVICE');

export interface AudModuleOptions {
  readonly auditRepository?: AuditRepositoryPortV1;
}

@Module({})
export class AudModule {
  public static register(options: AudModuleOptions = {}): DynamicModule {
    const repository = options.auditRepository ?? new InMemoryAuditRepositoryAdapter();
    const service = new AuditLedgerService(repository, new Sha256AuditDigestAdapter());
    return {
      module: AudModule,
      providers: [
        { provide: AUDIT_REPOSITORY_PORT, useValue: repository },
        { provide: AUDIT_LEDGER_SERVICE, useValue: service },
      ],
      exports: [AUDIT_REPOSITORY_PORT, AUDIT_LEDGER_SERVICE],
    };
  }
}

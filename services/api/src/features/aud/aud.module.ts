import { type DynamicModule, Module } from '@nestjs/common';

import { AuditLedgerService } from './application/audit-ledger.service.js';
import {
  AUDIT_ATTESTATION_SERVICE,
  AuditAttestationService,
  UnavailableAuditAttestationService,
  type AuditAttestationIdGeneratorV1,
  type AuditAttestationService as AuditAttestationServicePortV1,
} from './application/audit-attestation.service.js';
import {
  AUDIT_ATTESTATION_REPOSITORY_PORT,
  type AuditAttestationRepositoryPortV1,
} from './application/audit-attestation-repository.port.js';
import type { AuditSealAttestationSignerV1 } from '@databreeze/domain/audit/v1';
import { InMemoryAuditAttestationRepositoryAdapter } from './adapter/in-memory-audit-attestation-repository.adapter.js';
import {
  PrismaAuditAttestationRepositoryAdapter,
  type AuditAttestationDatabaseClientV1,
} from './adapter/prisma-audit-attestation-repository.adapter.js';
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
import { AuditAttestationController } from './api/audit-attestation.controller.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export const AUDIT_LEDGER_SERVICE = Symbol('AUDIT_LEDGER_SERVICE');

export interface AudModuleOptions {
  readonly auditRepository?: AuditRepositoryPortV1;
  /** Root composition may share the canonical ledger with DDA audit adapters. */
  readonly auditLedgerService?: AuditLedgerService;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly auditDatabase?: AuditDatabaseClientV1;
  readonly auditAttestationRepository?: AuditAttestationRepositoryPortV1;
  readonly auditAttestationDatabase?: AuditAttestationDatabaseClientV1;
  readonly auditAttestationService?:
    | AuditAttestationServicePortV1
    | UnavailableAuditAttestationService;
  readonly auditAttestationSigner?: AuditSealAttestationSignerV1;
  readonly auditAttestationIdGenerator?: AuditAttestationIdGeneratorV1;
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
    const service = options.auditLedgerService ?? new AuditLedgerService(repository, digest);
    const attestationRepository =
      options.auditAttestationRepository ??
      (options.auditAttestationDatabase === undefined
        ? new InMemoryAuditAttestationRepositoryAdapter()
        : new PrismaAuditAttestationRepositoryAdapter(options.auditAttestationDatabase));
    const attestationService =
      options.auditAttestationService ??
      (options.auditAttestationSigner === undefined
        ? new UnavailableAuditAttestationService()
        : new AuditAttestationService(
            repository,
            attestationRepository,
            options.auditAttestationSigner,
            options.auditAttestationIdGenerator,
          ));
    return {
      module: AudModule,
      controllers: [AuditController, AuditAttestationController],
      providers: [
        { provide: AUDIT_REPOSITORY_PORT, useValue: repository },
        { provide: AUDIT_LEDGER_SERVICE, useValue: service },
        { provide: AUDIT_ATTESTATION_REPOSITORY_PORT, useValue: attestationRepository },
        { provide: AUDIT_ATTESTATION_SERVICE, useValue: attestationService },
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [
        AUDIT_REPOSITORY_PORT,
        AUDIT_LEDGER_SERVICE,
        AUDIT_ATTESTATION_REPOSITORY_PORT,
        AUDIT_ATTESTATION_SERVICE,
      ],
    };
  }
}

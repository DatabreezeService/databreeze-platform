import { type DynamicModule, Module } from '@nestjs/common';

import { InMemoryEntitlementRepositoryAdapter } from './adapter/in-memory-entitlement-repository.adapter.js';
import {
  PrismaEntitlementRepositoryAdapter,
  type EntitlementDatabaseClientV1,
} from './adapter/prisma-entitlement-repository.adapter.js';
import { EntitlementAdmissionService } from './application/entitlement-admission.service.js';
import {
  ENTITLEMENT_LEASE_SERVICE,
  EntitlementLeaseService,
  UnavailableEntitlementLeaseService,
  type EntitlementLeaseClockV1,
  type EntitlementLeaseIdGeneratorV1,
  type EntitlementLeaseService as EntitlementLeaseServicePortV1,
  type EntitlementLeaseSignerV1,
} from './application/entitlement-lease.service.js';
import {
  ENTITLEMENT_LEASE_REPOSITORY_PORT,
  type EntitlementLeaseRepositoryPortV1,
} from './application/entitlement-lease-repository.port.js';
import { InMemoryEntitlementLeaseRepositoryAdapter } from './adapter/in-memory-entitlement-lease-repository.adapter.js';
import {
  PrismaEntitlementLeaseRepositoryAdapter,
  type EntitlementLeaseDatabaseClientV1,
} from './adapter/prisma-entitlement-lease-repository.adapter.js';
import { HmacEntitlementLeaseSignerAdapter } from './adapter/hmac-entitlement-lease-signer.adapter.js';
import {
  ENTITLEMENT_REPOSITORY_PORT,
  type EntitlementRepositoryPortV1,
} from './application/entitlement-repository.port.js';
import {
  RESULT_USAGE_SETTLEMENT_BINDING_REPOSITORY_PORT,
  type ResultUsageSettlementBindingRepositoryPortV1,
} from './application/result-usage-settlement-binding.port.js';
import {
  PrismaResultUsageSettlementBindingRepository,
  type ResultUsageSettlementBindingDatabaseClientV1,
} from './adapter/prisma-result-usage-settlement-binding-repository.adapter.js';
import { EntitlementController } from './api/entitlement.controller.js';
import { PayosController } from './api/payos.controller.js';
import { PayosPaymentService } from './application/payos-payment.service.js';
import { PayosPaymentLinkAdapter } from './adapter/payos-payment-link.adapter.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export const ENTITLEMENT_ADMISSION_SERVICE = Symbol('ENTITLEMENT_ADMISSION_SERVICE');

export interface BuaModuleOptions {
  readonly payosPaymentService?: PayosPaymentService;
  readonly entitlementRepository?: EntitlementRepositoryPortV1;
  /** Root composition may share the canonical service with DDA agent admission. */
  readonly entitlementAdmissionService?: EntitlementAdmissionService;
  /** Production composition passes the generated Prisma client; tests may keep the port in-memory. */
  readonly entitlementDatabase?: EntitlementDatabaseClientV1;
  readonly resultUsageSettlementBindingRepository?: ResultUsageSettlementBindingRepositoryPortV1;
  readonly resultUsageSettlementBindingDatabase?: ResultUsageSettlementBindingDatabaseClientV1;
  readonly entitlementLeaseRepository?: EntitlementLeaseRepositoryPortV1;
  readonly entitlementLeaseDatabase?: EntitlementLeaseDatabaseClientV1;
  readonly entitlementLeaseService?:
    | EntitlementLeaseServicePortV1
    | UnavailableEntitlementLeaseService;
  readonly entitlementLeaseSigner?: EntitlementLeaseSignerV1;
  /** Secret-manager supplied key; direct signer injection remains available for HSM/KMS adapters. */
  readonly entitlementLeaseSigningKey?: Uint8Array | string;
  readonly entitlementLeaseClock?: EntitlementLeaseClockV1;
  readonly entitlementLeaseIdGenerator?: EntitlementLeaseIdGeneratorV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class BuaModule {
  public static register(options: BuaModuleOptions = {}): DynamicModule {
    const payos = options.payosPaymentService ?? (() => {
      // The current adapter stores sessions in memory and is local-test only.
      // Never expose it in a production process before the Prisma inbox/ledger
      // and tenant/Owner authorization composition are installed.
      if (process.env['PAYOS_LOCAL_TEST_MODE'] !== 'true') return undefined;
      const clientId = process.env['PAYOS_CLIENT_ID'];
      const apiKey = process.env['PAYOS_API_KEY'];
      const checksumKey = process.env['PAYOS_CHECKSUM_KEY'];
      const webUrl = process.env['DATABREEZE_WEB_PUBLIC_URL'];
      if (clientId === undefined || apiKey === undefined || checksumKey === undefined || webUrl === undefined) return undefined;
      const adapter = new PayosPaymentLinkAdapter({
        clientId,
        apiKey,
        checksumKey,
        successUrl: process.env['DATABREEZE_PAYOS_SUCCESS_URL'] ?? `${webUrl}/vi-VN/billing/success`,
        failedUrl: process.env['DATABREEZE_PAYOS_FAILED_URL'] ?? `${webUrl}/vi-VN/billing/failed`,
      });
      return new PayosPaymentService(adapter, checksumKey);
    })();
    const repository =
      options.entitlementRepository ??
      (options.entitlementDatabase === undefined
        ? new InMemoryEntitlementRepositoryAdapter()
        : new PrismaEntitlementRepositoryAdapter(options.entitlementDatabase));
    const service =
      options.entitlementAdmissionService ?? new EntitlementAdmissionService(repository);
    const resultUsageSettlementBindingRepository =
      options.resultUsageSettlementBindingRepository ??
      (options.resultUsageSettlementBindingDatabase === undefined
        ? undefined
        : new PrismaResultUsageSettlementBindingRepository(
            options.resultUsageSettlementBindingDatabase,
          ));
    const leaseRepository =
      options.entitlementLeaseRepository ??
      (options.entitlementLeaseDatabase === undefined
        ? new InMemoryEntitlementLeaseRepositoryAdapter()
        : new PrismaEntitlementLeaseRepositoryAdapter(options.entitlementLeaseDatabase));
    const leaseSigner =
      options.entitlementLeaseSigner ??
      (options.entitlementLeaseSigningKey === undefined
        ? undefined
        : new HmacEntitlementLeaseSignerAdapter(options.entitlementLeaseSigningKey));
    const leaseService =
      options.entitlementLeaseService ??
      (leaseSigner === undefined
        ? new UnavailableEntitlementLeaseService()
        : new EntitlementLeaseService(
            leaseRepository,
            repository,
            leaseSigner,
            options.entitlementLeaseClock,
            options.entitlementLeaseIdGenerator,
          ));
    return {
      module: BuaModule,
      controllers: [EntitlementController, ...(payos === undefined ? [] : [PayosController])],
      providers: [
        { provide: ENTITLEMENT_REPOSITORY_PORT, useValue: repository },
        { provide: ENTITLEMENT_ADMISSION_SERVICE, useValue: service },
        {
          provide: RESULT_USAGE_SETTLEMENT_BINDING_REPOSITORY_PORT,
          useValue: resultUsageSettlementBindingRepository,
        },
        { provide: ENTITLEMENT_LEASE_REPOSITORY_PORT, useValue: leaseRepository },
        { provide: ENTITLEMENT_LEASE_SERVICE, useValue: leaseService },
        ...(payos === undefined ? [] : [{ provide: PayosPaymentService, useValue: payos }]),
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [
        ENTITLEMENT_REPOSITORY_PORT,
        ENTITLEMENT_ADMISSION_SERVICE,
        RESULT_USAGE_SETTLEMENT_BINDING_REPOSITORY_PORT,
        ENTITLEMENT_LEASE_REPOSITORY_PORT,
        ENTITLEMENT_LEASE_SERVICE,
      ],
    };
  }
}

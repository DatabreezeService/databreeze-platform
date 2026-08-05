import { type DynamicModule, Module } from '@nestjs/common';

import { InProcessInvoiceLeakDetectorAuditAdapter } from './adapter/in-process-invoice-leak-detector-audit.adapter.js';
import { InvoiceLeakDetectorAuditController } from './api/invoice-leak-detector-audit.controller.js';
import {
  INVOICE_LEAK_DETECTOR_AUDIT_PORT,
  type InvoiceLeakDetectorAuditPortV1,
} from './application/invoice-leak-detector-audit.port.js';
import { InvoiceLeakDetectorAuditService } from './application/invoice-leak-detector-audit.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface IldModuleOptions {
  readonly invoiceLeakDetectorAuditPort?: InvoiceLeakDetectorAuditPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class IldModule {
  public static register(options: IldModuleOptions = {}): DynamicModule {
    return {
      module: IldModule,
      controllers: [InvoiceLeakDetectorAuditController],
      providers: [
        {
          provide: INVOICE_LEAK_DETECTOR_AUDIT_PORT,
          useValue:
            options.invoiceLeakDetectorAuditPort ?? new InProcessInvoiceLeakDetectorAuditAdapter(),
        },
        InvoiceLeakDetectorAuditService,
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [INVOICE_LEAK_DETECTOR_AUDIT_PORT],
    };
  }
}

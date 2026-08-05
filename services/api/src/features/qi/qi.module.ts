import { type DynamicModule, Module } from '@nestjs/common';

import { InProcessQuoteIntelligenceComparisonAdapter } from './adapter/in-process-quote-intelligence-comparison.adapter.js';
import { QuoteIntelligenceComparisonController } from './api/quote-intelligence-comparison.controller.js';
import {
  QUOTE_INTELLIGENCE_COMPARISON_PORT,
  type QuoteIntelligenceComparisonPortV1,
} from './application/quote-intelligence-comparison.port.js';
import { QuoteIntelligenceComparisonService } from './application/quote-intelligence-comparison.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
  UnavailableRequestTenantContextAdapter,
} from '../../platform/http/request-tenant-context.port.js';

export interface QiModuleOptions {
  readonly quoteIntelligenceComparisonPort?: QuoteIntelligenceComparisonPortV1;
  readonly requestTenantContext?: RequestTenantContextPortV1;
}

@Module({})
export class QiModule {
  public static register(options: QiModuleOptions = {}): DynamicModule {
    return {
      module: QiModule,
      controllers: [QuoteIntelligenceComparisonController],
      providers: [
        {
          provide: QUOTE_INTELLIGENCE_COMPARISON_PORT,
          useValue:
            options.quoteIntelligenceComparisonPort ??
            new InProcessQuoteIntelligenceComparisonAdapter(),
        },
        QuoteIntelligenceComparisonService,
        {
          provide: REQUEST_TENANT_CONTEXT,
          useValue: options.requestTenantContext ?? new UnavailableRequestTenantContextAdapter(),
        },
      ],
      exports: [QUOTE_INTELLIGENCE_COMPARISON_PORT],
    };
  }
}

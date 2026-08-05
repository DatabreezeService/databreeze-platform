import { Inject, Injectable } from '@nestjs/common';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import {
  QUOTE_INTELLIGENCE_COMPARISON_PORT,
  type QuoteIntelligenceComparisonInputV1,
  type QuoteIntelligenceComparisonPortResultV1,
  type QuoteIntelligenceComparisonPortV1,
} from './quote-intelligence-comparison.port.js';

export type QuoteIntelligenceComparisonServiceResultV1 =
  | QuoteIntelligenceComparisonPortResultV1
  | { readonly accepted: false; readonly code: 'WORKSPACE_SCOPE_REQUIRED' };

/**
 * Enforces an exact server-derived workspace scope before a pure, transient
 * quote calculation is permitted.
 */
@Injectable()
export class QuoteIntelligenceComparisonService {
  public constructor(
    @Inject(QUOTE_INTELLIGENCE_COMPARISON_PORT)
    private readonly comparisonPort: QuoteIntelligenceComparisonPortV1,
  ) {}

  public compare(
    context: IamTenantContextV1,
    input: QuoteIntelligenceComparisonInputV1,
  ): Promise<QuoteIntelligenceComparisonServiceResultV1> {
    if (context.tenantScope.scopeType !== 'workspace')
      return Promise.resolve(
        Object.freeze({ accepted: false, code: 'WORKSPACE_SCOPE_REQUIRED' as const }),
      );
    return this.comparisonPort.compare(context, input);
  }
}

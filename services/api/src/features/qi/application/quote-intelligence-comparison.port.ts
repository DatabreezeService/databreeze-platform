import {
  compareQuoteIntelligenceV1,
  type QuoteComparisonResultV1,
  type QuoteEvidenceV1,
  type QuoteSupplierResultV1,
} from '@databreeze/domain/quote-intelligence/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const QUOTE_INTELLIGENCE_COMPARISON_PORT = Symbol('QUOTE_INTELLIGENCE_COMPARISON_PORT');

export type QuoteIntelligenceComparisonInputV1 = Omit<
  Parameters<typeof compareQuoteIntelligenceV1>[0],
  'tenantScope'
>;

export interface QuoteIntelligenceEvidenceReferenceV1 {
  readonly sourceId: string;
  readonly locatorFingerprint: string;
}

export interface QuoteIntelligenceSupplierOutputV1 {
  readonly supplierId: string;
  readonly targetCurrency: string;
  readonly subtotal: number;
  readonly tax: number;
  readonly freight: number;
  readonly landedCost: number;
  readonly leadDays: number;
  readonly complete: boolean;
  readonly score?: number;
  readonly scoreBreakdown?: readonly {
    readonly criterionFingerprint: string;
    readonly rawValue: number;
    readonly normalizedValue: number;
    readonly weight: number;
    readonly contribution: number;
  }[];
  readonly evidence: readonly QuoteIntelligenceEvidenceReferenceV1[];
}

export type QuoteIntelligenceComparisonOutputV1 =
  | {
      readonly schemaVersion: 1;
      readonly status: 'BLOCKED';
      readonly comparisonId: string;
      readonly reasons: readonly string[];
    }
  | {
      readonly schemaVersion: 1;
      readonly status: 'READY';
      readonly comparisonId: string;
      readonly targetCurrency: string;
      readonly suppliers: readonly QuoteIntelligenceSupplierOutputV1[];
      readonly candidateSupplierId?: string;
      readonly requiresHumanApproval: boolean;
      readonly comparisonFingerprint: string;
      readonly warnings: readonly string[];
    };

export type QuoteIntelligenceComparisonPortResultV1 =
  | { readonly accepted: true; readonly value: QuoteIntelligenceComparisonOutputV1 }
  | { readonly accepted: false; readonly code: 'COMPARISON_UNAVAILABLE' };

/**
 * Implements a non-persistent comparison and removes source text before the
 * result crosses the HTTP boundary.
 */
export interface QuoteIntelligenceComparisonPortV1 {
  compare(
    context: IamTenantContextV1,
    input: QuoteIntelligenceComparisonInputV1,
  ): Promise<QuoteIntelligenceComparisonPortResultV1>;
}

export type QuoteIntelligenceDomainProjectionInputV1 = {
  readonly result: QuoteComparisonResultV1;
  readonly supplier: QuoteSupplierResultV1;
  readonly evidence: readonly QuoteEvidenceV1[];
};

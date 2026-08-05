import { createHash } from 'node:crypto';

import {
  compareQuoteIntelligenceV1,
  type QuoteComparisonResultV1,
  type QuoteEvidenceV1,
  type QuoteSupplierResultV1,
} from '@databreeze/domain/quote-intelligence/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  QuoteIntelligenceComparisonInputV1,
  QuoteIntelligenceComparisonOutputV1,
  QuoteIntelligenceComparisonPortResultV1,
  QuoteIntelligenceComparisonPortV1,
  QuoteIntelligenceEvidenceReferenceV1,
  QuoteIntelligenceSupplierOutputV1,
} from '../application/quote-intelligence-comparison.port.js';

function fingerprint(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function safeEvidence(
  evidence: readonly QuoteEvidenceV1[],
): readonly QuoteIntelligenceEvidenceReferenceV1[] {
  return Object.freeze(
    evidence.map((entry) =>
      Object.freeze({
        sourceId: entry.sourceId,
        locatorFingerprint: fingerprint({ sourceId: entry.sourceId, locator: entry.locator }),
      }),
    ),
  );
}

function safeSupplier(supplier: QuoteSupplierResultV1): QuoteIntelligenceSupplierOutputV1 {
  return Object.freeze({
    supplierId: supplier.supplierId,
    targetCurrency: supplier.targetCurrency,
    subtotal: supplier.subtotal,
    tax: supplier.tax,
    freight: supplier.freight,
    landedCost: supplier.landedCost,
    leadDays: supplier.leadDays,
    complete: supplier.complete,
    ...(supplier.score === undefined ? {} : { score: supplier.score }),
    ...(supplier.scoreBreakdown === undefined
      ? {}
      : {
          scoreBreakdown: Object.freeze(
            supplier.scoreBreakdown.map((item) =>
              Object.freeze({
                criterionFingerprint: fingerprint(item.key),
                rawValue: item.rawValue,
                normalizedValue: item.normalizedValue,
                weight: item.weight,
                contribution: item.contribution,
              }),
            ),
          ),
        }),
    evidence: safeEvidence(supplier.evidence),
  });
}

function safeWarning(warning: string): string {
  return warning.startsWith('MISSING_SCORE:') ? 'MISSING_SCORE' : 'UNSPECIFIED_WARNING';
}

function safeOutput(result: QuoteComparisonResultV1): QuoteIntelligenceComparisonOutputV1 {
  if (result.status === 'BLOCKED')
    return Object.freeze({
      schemaVersion: result.schemaVersion,
      status: result.status,
      comparisonId: result.comparisonId,
      reasons: Object.freeze([...result.reasons]),
    });
  return Object.freeze({
    schemaVersion: result.schemaVersion,
    status: result.status,
    comparisonId: result.comparisonId,
    targetCurrency: result.targetCurrency,
    suppliers: Object.freeze(result.suppliers.map(safeSupplier)),
    ...(result.candidateSupplierId === undefined
      ? {}
      : { candidateSupplierId: result.candidateSupplierId }),
    requiresHumanApproval: result.requiresHumanApproval,
    comparisonFingerprint: fingerprint(result.comparisonHash),
    warnings: Object.freeze([...new Set(result.warnings.map(safeWarning))]),
  });
}

/**
 * Runs only public domain logic in process. It has no repository, filesystem,
 * artifact reader, or durable state; source text is projected away immediately.
 */
export class InProcessQuoteIntelligenceComparisonAdapter
  implements QuoteIntelligenceComparisonPortV1
{
  public compare(
    context: IamTenantContextV1,
    input: QuoteIntelligenceComparisonInputV1,
  ): Promise<QuoteIntelligenceComparisonPortResultV1> {
    try {
      return Promise.resolve(
        Object.freeze({
          accepted: true,
          value: safeOutput(
            compareQuoteIntelligenceV1({ ...input, tenantScope: context.tenantScope }),
          ),
        }),
      );
    } catch {
      return Promise.resolve(
        Object.freeze({ accepted: false, code: 'COMPARISON_UNAVAILABLE' as const }),
      );
    }
  }
}

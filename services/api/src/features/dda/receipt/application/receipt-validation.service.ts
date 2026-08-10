const SUPPORTED_CURRENCIES = new Set(['VND', 'USD', 'EUR']);

export type ReceiptValidationErrorCode =
  | 'REQUIRED_FIELD_MISSING'
  | 'INVALID_DATETIME'
  | 'UNSUPPORTED_CURRENCY'
  | 'NEGATIVE_OR_ZERO_AMOUNT'
  | 'TOTAL_MISMATCH'
  | 'LINE_ITEM_MISMATCH'
  | 'LOW_CONFIDENCE_REVIEW'
  | 'CONFLICTING_CANDIDATES';

export interface ReceiptLineItemInput {
  readonly description: string;
  readonly amount: string;
}

export interface ReceiptValidationInput {
  readonly merchant: string;
  readonly transactionDateTime: string;
  readonly currency: string;
  readonly subtotal: string;
  readonly tax: string;
  readonly total: string;
  readonly paymentReference?: string;
  readonly lineItems?: readonly ReceiptLineItemInput[];
  readonly fieldConfidence: Readonly<Record<string, number>>;
  readonly conflictingCandidateTotals?: readonly string[];
  readonly artifactContentHash?: string;
}

export type ReceiptValidationResult =
  | { readonly accepted: true }
  | {
      readonly accepted: false;
      readonly code: ReceiptValidationErrorCode;
      readonly requiresReview: boolean;
    };

export interface DuplicateDetectionInput extends ReceiptValidationInput {
  readonly artifactContentHash: string;
}

export interface DuplicateDetectionResult {
  readonly probableDuplicate: boolean;
  readonly reason?: 'EXACT_ARTIFACT_HASH' | 'MERCHANT_DATE_TOTAL_REFERENCE';
  readonly action?: 'REVIEW_REQUIRED';
}

export class ReceiptValidationService {
  public constructor(
    private readonly options: {
      readonly roundingToleranceMinorUnits?: number;
      readonly lowConfidenceThreshold?: number;
    } = {},
  ) {}

  public validate(input: ReceiptValidationInput): ReceiptValidationResult {
    if (!input.merchant.trim()) {
      return denied('REQUIRED_FIELD_MISSING', true);
    }
    if (!Number.isFinite(Date.parse(input.transactionDateTime))) {
      return denied('INVALID_DATETIME', true);
    }
    if (!SUPPORTED_CURRENCIES.has(input.currency)) {
      return denied('UNSUPPORTED_CURRENCY', true);
    }
    const subtotal = parseAmount(input.subtotal);
    const tax = parseAmount(input.tax);
    const total = parseAmount(input.total);
    if (subtotal === undefined || tax === undefined || total === undefined) {
      return denied('REQUIRED_FIELD_MISSING', true);
    }
    if (subtotal <= 0 || tax < 0 || total <= 0) {
      return denied('NEGATIVE_OR_ZERO_AMOUNT', true);
    }
    const tolerance = this.options.roundingToleranceMinorUnits ?? 1;
    if (Math.abs(subtotal + tax - total) > tolerance) {
      return denied('TOTAL_MISMATCH', true);
    }
    if (input.lineItems && input.lineItems.length > 0) {
      const lineSum = input.lineItems.reduce((sum, item) => {
        const amount = parseAmount(item.amount) ?? Number.NaN;
        return sum + amount;
      }, 0);
      if (!Number.isFinite(lineSum) || Math.abs(lineSum - subtotal) > tolerance) {
        return denied('LINE_ITEM_MISMATCH', true);
      }
    }
    if (input.conflictingCandidateTotals && new Set(input.conflictingCandidateTotals).size > 1) {
      return denied('CONFLICTING_CANDIDATES', true);
    }
    const threshold = this.options.lowConfidenceThreshold ?? 85;
    const critical = ['merchant', 'total', 'currency', 'transactionDateTime'] as const;
    for (const field of critical) {
      const confidence = input.fieldConfidence[field];
      if (confidence !== undefined && confidence < threshold) {
        return denied('LOW_CONFIDENCE_REVIEW', true);
      }
    }
    return Object.freeze({ accepted: true as const });
  }

  public detectDuplicate(
    candidate: DuplicateDetectionInput,
    existing: readonly DuplicateDetectionInput[],
  ): DuplicateDetectionResult {
    if (existing.some((item) => item.artifactContentHash === candidate.artifactContentHash)) {
      return Object.freeze({
        probableDuplicate: true,
        reason: 'EXACT_ARTIFACT_HASH' as const,
        action: 'REVIEW_REQUIRED' as const,
      });
    }
    const signalHit = existing.some(
      (item) =>
        item.merchant === candidate.merchant &&
        item.transactionDateTime === candidate.transactionDateTime &&
        item.total === candidate.total &&
        item.paymentReference !== undefined &&
        item.paymentReference === candidate.paymentReference,
    );
    if (signalHit) {
      return Object.freeze({
        probableDuplicate: true,
        reason: 'MERCHANT_DATE_TOTAL_REFERENCE' as const,
        action: 'REVIEW_REQUIRED' as const,
      });
    }
    return Object.freeze({ probableDuplicate: false });
  }
}

function parseAmount(raw: string): number | undefined {
  if (!/^-?\d+$/.test(raw)) return undefined;
  return Number(raw);
}

function denied(
  code: ReceiptValidationErrorCode,
  requiresReview: boolean,
): ReceiptValidationResult {
  return Object.freeze({ accepted: false, code, requiresReview });
}

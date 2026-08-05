import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** QI-001..QI-018: evidence-backed quote normalization and scoring. */
export const QUOTE_INTELLIGENCE_SCHEMA_VERSION_V1 = 1 as const;
type CurrencyV1 = string;

export interface QuoteEvidenceV1 {
  readonly sourceId: StableIdentifierV1;
  readonly locator: string;
}
export interface QuoteLineV1 {
  readonly lineId: StableIdentifierV1;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly currency: CurrencyV1;
  readonly taxRate: number;
  readonly evidence: readonly QuoteEvidenceV1[];
}
export interface QuoteV1 {
  readonly supplierId: StableIdentifierV1;
  readonly supplierName: string;
  readonly freight: number;
  readonly leadDays: number;
  readonly lines: readonly QuoteLineV1[];
  readonly evidence: readonly QuoteEvidenceV1[];
}
export interface QuoteExchangeRateV1 {
  readonly rateId: StableIdentifierV1;
  readonly from: CurrencyV1;
  readonly to: CurrencyV1;
  readonly rate: number;
  readonly effectiveDate: string;
  readonly provenance: string;
}
export interface QuoteScoringCriterionV1 {
  readonly key: string;
  readonly direction: 'HIGHER_BETTER' | 'LOWER_BETTER';
  readonly weight: number;
  readonly values: Readonly<Record<string, number>>;
}
export interface QuoteScoringPolicyV1 {
  readonly policyVersion: number;
  readonly criteria: readonly QuoteScoringCriterionV1[];
}
export interface QuoteSupplierResultV1 {
  readonly supplierId: StableIdentifierV1;
  readonly supplierName: string;
  readonly targetCurrency: CurrencyV1;
  readonly subtotal: number;
  readonly tax: number;
  readonly freight: number;
  readonly landedCost: number;
  readonly leadDays: number;
  readonly complete: boolean;
  readonly score?: number;
  readonly scoreBreakdown?: readonly {
    readonly key: string;
    readonly rawValue: number;
    readonly normalizedValue: number;
    readonly weight: number;
    readonly contribution: number;
  }[];
  readonly evidence: readonly QuoteEvidenceV1[];
}
export type QuoteComparisonResultV1 =
  | {
      readonly schemaVersion: typeof QUOTE_INTELLIGENCE_SCHEMA_VERSION_V1;
      readonly status: 'READY';
      readonly comparisonId: StableIdentifierV1;
      readonly tenantScope: TenantScopeV1;
      readonly targetCurrency: CurrencyV1;
      readonly suppliers: readonly QuoteSupplierResultV1[];
      readonly candidateSupplierId?: StableIdentifierV1;
      readonly requiresHumanApproval: boolean;
      readonly comparisonHash: string;
      readonly warnings: readonly string[];
    }
  | {
      readonly schemaVersion: typeof QUOTE_INTELLIGENCE_SCHEMA_VERSION_V1;
      readonly status: 'BLOCKED';
      readonly comparisonId: StableIdentifierV1;
      readonly reasons: readonly string[];
    };

function id(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}
function scope(input: unknown): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1(input);
  return parsed.accepted ? parsed.value : undefined;
}
function text(input: unknown, max: number): string | undefined {
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > max ||
    /\p{Cc}/u.test(input)
  )
    return undefined;
  const value = input.normalize('NFC').trim();
  return value.length > 0 ? value : undefined;
}
function currency(input: unknown): string | undefined {
  const value = text(input, 3)?.toUpperCase();
  return value && /^[A-Z]{3}$/u.test(value) ? value : undefined;
}
function diagnosticHash(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').repeat(8);
}
function evidence(input: unknown): readonly QuoteEvidenceV1[] | undefined {
  if (!Array.isArray(input) || input.length === 0 || input.length > 128) return undefined;
  const result: QuoteEvidenceV1[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') return undefined;
    const record = entry as Record<string, unknown>;
    const sourceId = id(record['sourceId']);
    const locator = text(record['locator'], 256);
    if (!sourceId || !locator) return undefined;
    result.push(Object.freeze({ sourceId, locator }));
  }
  return Object.freeze(result);
}

export function compareQuoteIntelligenceV1(input: {
  readonly comparisonId: unknown;
  readonly tenantScope: unknown;
  readonly targetCurrency: unknown;
  readonly exchangeRates?: unknown;
  readonly quotes: unknown;
  readonly scoring?: unknown;
}): QuoteComparisonResultV1 {
  const comparisonId = id(input.comparisonId);
  const tenantScope = scope(input.tenantScope);
  const targetCurrency = currency(input.targetCurrency);
  if (
    !comparisonId ||
    !tenantScope ||
    !targetCurrency ||
    !Array.isArray(input.quotes) ||
    input.quotes.length === 0 ||
    input.quotes.length > 500
  )
    return {
      schemaVersion: 1,
      status: 'BLOCKED',
      comparisonId: comparisonId ?? ('00000000-0000-4000-8000-000000000000' as StableIdentifierV1),
      reasons: ['INVALID_COMPARISON'],
    };
  const rates = new Map<string, QuoteExchangeRateV1>();
  for (const raw of (input.exchangeRates ?? []) as unknown[]) {
    if (!raw || typeof raw !== 'object')
      return {
        schemaVersion: 1,
        status: 'BLOCKED',
        comparisonId,
        reasons: ['INVALID_EXCHANGE_RATE'],
      };
    const record = raw as Record<string, unknown>;
    const rateId = id(record['rateId']);
    const from = currency(record['from']);
    const to = currency(record['to']);
    const rate = record['rate'];
    const effectiveDate = text(record['effectiveDate'], 32);
    const provenance = text(record['provenance'], 128);
    if (
      !rateId ||
      !from ||
      !to ||
      typeof rate !== 'number' ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      !effectiveDate ||
      !provenance
    )
      return {
        schemaVersion: 1,
        status: 'BLOCKED',
        comparisonId,
        reasons: ['INVALID_EXCHANGE_RATE'],
      };
    rates.set(
      `${from}:${to}`,
      Object.freeze({ rateId, from, to, rate, effectiveDate, provenance }),
    );
  }
  const suppliers: QuoteSupplierResultV1[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.quotes as unknown[]) {
    if (!raw || typeof raw !== 'object')
      return { schemaVersion: 1, status: 'BLOCKED', comparisonId, reasons: ['INVALID_QUOTE'] };
    const record = raw as Record<string, unknown>;
    const supplierId = id(record['supplierId']);
    const supplierName = text(record['supplierName'], 256);
    const quoteEvidence = evidence(record['evidence']);
    const freight = record['freight'];
    const leadDays = record['leadDays'];
    const lines = record['lines'];
    if (
      !supplierId ||
      seen.has(supplierId) ||
      !supplierName ||
      !quoteEvidence ||
      typeof freight !== 'number' ||
      !Number.isFinite(freight) ||
      freight < 0 ||
      typeof leadDays !== 'number' ||
      !Number.isFinite(leadDays) ||
      leadDays < 0 ||
      !Array.isArray(lines) ||
      lines.length === 0
    )
      return { schemaVersion: 1, status: 'BLOCKED', comparisonId, reasons: ['INVALID_QUOTE'] };
    seen.add(supplierId);
    let subtotal = 0;
    let tax = 0;
    let freightCurrency: string | undefined;
    for (const lineRaw of lines as unknown[]) {
      if (!lineRaw || typeof lineRaw !== 'object')
        return { schemaVersion: 1, status: 'BLOCKED', comparisonId, reasons: ['INVALID_LINE'] };
      const line = lineRaw as Record<string, unknown>;
      const lineId = id(line['lineId']);
      const description = text(line['description'], 256);
      const quantity = line['quantity'];
      const unitPrice = line['unitPrice'];
      const currentCurrency = currency(line['currency']);
      const taxRate = line['taxRate'];
      const lineEvidence = evidence(line['evidence']);
      if (
        !lineId ||
        !description ||
        typeof quantity !== 'number' ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        typeof unitPrice !== 'number' ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0 ||
        !currentCurrency ||
        typeof taxRate !== 'number' ||
        !Number.isFinite(taxRate) ||
        taxRate < 0 ||
        !lineEvidence
      )
        return { schemaVersion: 1, status: 'BLOCKED', comparisonId, reasons: ['INVALID_LINE'] };
      freightCurrency ??= currentCurrency;
      const rate =
        currentCurrency === targetCurrency
          ? 1
          : rates.get(`${currentCurrency}:${targetCurrency}`)?.rate;
      if (rate === undefined)
        return {
          schemaVersion: 1,
          status: 'BLOCKED',
          comparisonId,
          reasons: ['MISSING_EXCHANGE_RATE'],
        };
      const normalizedSubtotal = quantity * unitPrice * rate;
      subtotal += normalizedSubtotal;
      tax += normalizedSubtotal * taxRate;
    }
    const freightRate =
      freightCurrency === targetCurrency
        ? 1
        : rates.get(`${freightCurrency}:${targetCurrency}`)?.rate;
    if (freightRate === undefined)
      return {
        schemaVersion: 1,
        status: 'BLOCKED',
        comparisonId,
        reasons: ['MISSING_EXCHANGE_RATE'],
      };
    const normalizedFreight = freight * freightRate;
    suppliers.push(
      Object.freeze({
        supplierId,
        supplierName,
        targetCurrency,
        subtotal: Number(subtotal.toFixed(2)),
        tax: Number(tax.toFixed(2)),
        freight: Number(normalizedFreight.toFixed(2)),
        landedCost: Number((subtotal + tax + normalizedFreight).toFixed(2)),
        leadDays,
        complete: true,
        evidence: Object.freeze([...quoteEvidence]),
      }),
    );
  }
  let scored = suppliers;
  let candidateSupplierId: StableIdentifierV1 | undefined;
  if (input.scoring !== undefined) {
    const policy = input.scoring as Record<string, unknown>;
    const criteria = policy['criteria'];
    if (
      !Number.isSafeInteger(policy['policyVersion']) ||
      !Array.isArray(criteria) ||
      criteria.length === 0
    )
      return {
        schemaVersion: 1,
        status: 'BLOCKED',
        comparisonId,
        reasons: ['INVALID_SCORING_POLICY'],
      };
    const normalizedCriteria: QuoteScoringCriterionV1[] = [];
    let weightTotal = 0;
    for (const criterionRaw of criteria as unknown[]) {
      if (!criterionRaw || typeof criterionRaw !== 'object')
        return {
          schemaVersion: 1,
          status: 'BLOCKED',
          comparisonId,
          reasons: ['INVALID_SCORING_POLICY'],
        };
      const criterion = criterionRaw as Record<string, unknown>;
      const key = text(criterion['key'], 64);
      const direction = criterion['direction'];
      const weight = criterion['weight'];
      const values = criterion['values'];
      if (
        !key ||
        (direction !== 'HIGHER_BETTER' && direction !== 'LOWER_BETTER') ||
        typeof weight !== 'number' ||
        !Number.isFinite(weight) ||
        weight <= 0 ||
        !values ||
        typeof values !== 'object' ||
        Array.isArray(values)
      )
        return {
          schemaVersion: 1,
          status: 'BLOCKED',
          comparisonId,
          reasons: ['INVALID_SCORING_POLICY'],
        };
      weightTotal += weight;
      normalizedCriteria.push({ key, direction, weight, values: values as Record<string, number> });
    }
    if (Math.abs(weightTotal - 1) > 1e-6 && Math.abs(weightTotal - 100) > 1e-6)
      return {
        schemaVersion: 1,
        status: 'BLOCKED',
        comparisonId,
        reasons: ['SCORING_WEIGHTS_MUST_TOTAL_100_PERCENT'],
      };
    const divisor = weightTotal > 1.01 ? 100 : 1;
    const breakdowns = new Map<
      string,
      {
        key: string;
        rawValue: number;
        normalizedValue: number;
        weight: number;
        contribution: number;
      }[]
    >();
    for (const criterion of normalizedCriteria) {
      const values = suppliers
        .map((supplier) => criterion.values[supplier.supplierId])
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      if (values.length !== suppliers.length) {
        warnings.push(`MISSING_SCORE:${criterion.key}`);
        continue;
      }
      const min = Math.min(...values);
      const max = Math.max(...values);
      for (const supplier of suppliers) {
        const rawValue = criterion.values[supplier.supplierId];
        if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) continue;
        const normalizedValue =
          max === min
            ? 1
            : criterion.direction === 'HIGHER_BETTER'
              ? (rawValue - min) / (max - min)
              : (max - rawValue) / (max - min);
        const list = breakdowns.get(supplier.supplierId) ?? [];
        list.push({
          key: criterion.key,
          rawValue,
          normalizedValue,
          weight: criterion.weight / divisor,
          contribution: normalizedValue * (criterion.weight / divisor),
        });
        breakdowns.set(supplier.supplierId, list);
      }
    }
    scored = suppliers.map((supplier) => {
      const scoreBreakdown = breakdowns.get(supplier.supplierId) ?? [];
      if (scoreBreakdown.length !== normalizedCriteria.length)
        return Object.freeze({ ...supplier });
      const score = scoreBreakdown.reduce((sum, item) => sum + item.contribution, 0);
      return Object.freeze({ ...supplier, score, scoreBreakdown: Object.freeze(scoreBreakdown) });
    });
    const eligible = scored.filter((supplier) => supplier.score !== undefined);
    candidateSupplierId = eligible
      .slice()
      .sort((left, right) => (right.score ?? -1) - (left.score ?? -1))[0]?.supplierId;
  }
  const comparisonHash = diagnosticHash({
    comparisonId,
    tenantScope,
    targetCurrency,
    suppliers: scored,
    candidateSupplierId,
  });
  return {
    schemaVersion: 1,
    status: 'READY',
    comparisonId,
    tenantScope,
    targetCurrency,
    suppliers: Object.freeze(scored),
    ...(candidateSupplierId === undefined ? {} : { candidateSupplierId }),
    requiresHumanApproval: candidateSupplierId !== undefined,
    comparisonHash,
    warnings: Object.freeze(warnings),
  };
}

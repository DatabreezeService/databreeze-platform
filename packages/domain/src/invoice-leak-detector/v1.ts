import { parseStableIdentifierV1, type StableIdentifierV1 } from '../tenant-scope/v1.js';

/** ILD-001..ILD-015: evidence-backed deterministic invoice diagnostics. */
export const INVOICE_LEAK_DETECTOR_SCHEMA_VERSION_V1 = 1 as const;

export interface InvoiceEvidenceV1 {
  readonly sourceId: StableIdentifierV1;
  readonly locator: string;
}
export interface InvoiceLineV1 {
  readonly lineId: StableIdentifierV1;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly currency: string;
  readonly evidence: readonly InvoiceEvidenceV1[];
}
export interface InvoiceV1 {
  readonly invoiceId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly contentSha256: string;
  readonly supplierId: StableIdentifierV1;
  readonly invoiceNumber: string;
  readonly invoiceDate: string;
  readonly currency: string;
  readonly total: number;
  readonly lines: readonly InvoiceLineV1[];
  readonly evidence: readonly InvoiceEvidenceV1[];
}
export interface InvoiceGoverningLineV1 {
  readonly governingLineId: StableIdentifierV1;
  readonly supplierId: StableIdentifierV1;
  readonly description: string;
  readonly unitPrice: number;
  readonly currency: string;
  readonly maxQuantity?: number;
  readonly evidence: readonly InvoiceEvidenceV1[];
}
export type InvoiceLeakFindingTypeV1 =
  | 'DUPLICATE_INVOICE'
  | 'PRICE_OVERCHARGE'
  | 'QUANTITY_OVERCHARGE'
  | 'UNRESOLVED_GOVERNING_DATA';
export interface InvoiceLeakFindingV1 {
  readonly findingId: string;
  readonly type: InvoiceLeakFindingTypeV1;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly lineId?: StableIdentifierV1;
  readonly estimatedExposure: number;
  readonly evidence: readonly InvoiceEvidenceV1[];
  readonly stableFingerprint: string;
  readonly disposition: 'ESTIMATED';
}
export interface InvoiceLeakMatchedLineV1 {
  readonly invoiceLineId: StableIdentifierV1;
  readonly governingLineId?: StableIdentifierV1;
  readonly expectedQuantity?: number;
  readonly expectedUnitPrice?: number;
  readonly expectedAmount?: number;
  readonly billedAmount: number;
  readonly evidence: readonly InvoiceEvidenceV1[];
}
export interface InvoiceLeakAuditResultV1 {
  readonly schemaVersion: typeof INVOICE_LEAK_DETECTOR_SCHEMA_VERSION_V1;
  readonly invoiceId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly inputHash: string;
  readonly calculationVersion: string;
  readonly billedTotal: number;
  readonly expectedTotal: number | null;
  readonly variance: number | null;
  readonly status: 'COMPLETE' | 'NEEDS_REVIEW';
  readonly findings: readonly InvoiceLeakFindingV1[];
  readonly matchedLines: readonly InvoiceLeakMatchedLineV1[];
}

function id(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
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
function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input)
    ? input.toLowerCase()
    : undefined;
}
function currency(input: unknown): string | undefined {
  const value = text(input, 3)?.toUpperCase();
  return value && /^[A-Z]{3}$/u.test(value) ? value : undefined;
}
function diagnosticHash(value: unknown): string {
  const input = JSON.stringify(value);
  let hashValue = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hashValue ^= input.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }
  return (hashValue >>> 0).toString(16).padStart(8, '0').repeat(8);
}
function evidence(input: unknown): readonly InvoiceEvidenceV1[] | undefined {
  if (!Array.isArray(input) || input.length === 0 || input.length > 128) return undefined;
  const output: InvoiceEvidenceV1[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return undefined;
    const record = raw as Record<string, unknown>;
    const sourceId = id(record['sourceId']);
    const locator = text(record['locator'], 256);
    if (!sourceId || !locator) return undefined;
    output.push(Object.freeze({ sourceId, locator }));
  }
  return Object.freeze(output);
}
function normalizeDescription(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
}
function severity(exposure: number): InvoiceLeakFindingV1['severity'] {
  return exposure >= 1_000 ? 'HIGH' : exposure >= 100 ? 'MEDIUM' : 'LOW';
}

export function auditInvoiceLeakV1(input: {
  readonly invoice: unknown;
  readonly governingLines: unknown;
  readonly historicalInvoices?: unknown;
  readonly tolerance?: { readonly amount?: number; readonly percent?: number };
  readonly calculationVersion?: unknown;
}): InvoiceLeakAuditResultV1 {
  if (
    !input.invoice ||
    typeof input.invoice !== 'object' ||
    Array.isArray(input.invoice) ||
    !Array.isArray(input.governingLines)
  )
    throw new Error('INVALID_INVOICE');
  const rawInvoice = input.invoice as Record<string, unknown>;
  const invoiceId = id(rawInvoice['invoiceId']);
  const artifactVersionId = id(rawInvoice['artifactVersionId']);
  const contentSha256 = hash(rawInvoice['contentSha256']);
  const supplierId = id(rawInvoice['supplierId']);
  const invoiceNumber = text(rawInvoice['invoiceNumber'], 128);
  const invoiceDate = text(rawInvoice['invoiceDate'], 32);
  const invoiceCurrency = currency(rawInvoice['currency']);
  const total = rawInvoice['total'];
  const invoiceEvidence = evidence(rawInvoice['evidence']);
  const lines = rawInvoice['lines'];
  if (
    !invoiceId ||
    !artifactVersionId ||
    !contentSha256 ||
    !supplierId ||
    !invoiceNumber ||
    !invoiceDate ||
    !invoiceCurrency ||
    typeof total !== 'number' ||
    !Number.isFinite(total) ||
    total < 0 ||
    !invoiceEvidence ||
    !Array.isArray(lines) ||
    lines.length === 0
  )
    throw new Error('INVALID_INVOICE');
  const invoiceLines: InvoiceLineV1[] = [];
  for (const rawLine of lines as unknown[]) {
    if (!rawLine || typeof rawLine !== 'object') throw new Error('INVALID_INVOICE_LINE');
    const record = rawLine as Record<string, unknown>;
    const lineId = id(record['lineId']);
    const description = text(record['description'], 256);
    const quantity = record['quantity'];
    const unitPrice = record['unitPrice'];
    const lineCurrency = currency(record['currency']);
    const lineEvidence = evidence(record['evidence']);
    if (
      !lineId ||
      !description ||
      typeof quantity !== 'number' ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      typeof unitPrice !== 'number' ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      !lineCurrency ||
      !lineEvidence
    )
      throw new Error('INVALID_INVOICE_LINE');
    invoiceLines.push(
      Object.freeze({
        lineId,
        description,
        quantity,
        unitPrice,
        currency: lineCurrency,
        evidence: lineEvidence,
      }),
    );
  }
  const governing: InvoiceGoverningLineV1[] = [];
  for (const raw of input.governingLines as unknown[]) {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_GOVERNING_LINE');
    const record = raw as Record<string, unknown>;
    const governingLineId = id(record['governingLineId']);
    const governingSupplierId = id(record['supplierId']);
    const description = text(record['description'], 256);
    const unitPrice = record['unitPrice'];
    const lineCurrency = currency(record['currency']);
    const maxQuantity = record['maxQuantity'];
    const governingEvidence = evidence(record['evidence']);
    if (
      !governingLineId ||
      !governingSupplierId ||
      !description ||
      typeof unitPrice !== 'number' ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      !lineCurrency ||
      (maxQuantity !== undefined &&
        (typeof maxQuantity !== 'number' || !Number.isFinite(maxQuantity) || maxQuantity < 0)) ||
      !governingEvidence
    )
      throw new Error('INVALID_GOVERNING_LINE');
    governing.push(
      Object.freeze({
        governingLineId,
        supplierId: governingSupplierId,
        description,
        unitPrice,
        currency: lineCurrency,
        ...(maxQuantity === undefined ? {} : { maxQuantity }),
        evidence: governingEvidence,
      }),
    );
  }
  const amountTolerance = input.tolerance?.amount ?? 0;
  const percentTolerance = input.tolerance?.percent ?? 0;
  if (
    amountTolerance < 0 ||
    percentTolerance < 0 ||
    !Number.isFinite(amountTolerance) ||
    !Number.isFinite(percentTolerance)
  )
    throw new Error('INVALID_TOLERANCE');
  const findings: InvoiceLeakFindingV1[] = [];
  const matchedLines: InvoiceLeakMatchedLineV1[] = [];
  let expectedTotal = 0;
  let complete = true;
  const addFinding = (
    type: InvoiceLeakFindingTypeV1,
    exposure: number,
    refs: readonly InvoiceEvidenceV1[],
    lineId: StableIdentifierV1 | undefined,
  ) => {
    const stableFingerprint = diagnosticHash({ invoiceId, type, lineId, refs, exposure });
    findings.push(
      Object.freeze({
        findingId: `finding-${stableFingerprint.slice(0, 32)}`,
        type,
        severity: severity(exposure),
        ...(lineId === undefined ? {} : { lineId }),
        estimatedExposure: Number(exposure.toFixed(2)),
        evidence: Object.freeze([...refs]),
        stableFingerprint,
        disposition: 'ESTIMATED',
      }),
    );
  };
  for (const line of invoiceLines) {
    const billedAmount = line.quantity * line.unitPrice;
    const match = governing.find(
      (candidate) =>
        candidate.supplierId === supplierId &&
        candidate.currency === invoiceCurrency &&
        normalizeDescription(candidate.description) === normalizeDescription(line.description),
    );
    const baseEvidence = Object.freeze([...invoiceEvidence, ...line.evidence]);
    if (!match) {
      complete = false;
      matchedLines.push(
        Object.freeze({ invoiceLineId: line.lineId, billedAmount, evidence: baseEvidence }),
      );
      addFinding('UNRESOLVED_GOVERNING_DATA', 0, baseEvidence, line.lineId);
      continue;
    }
    const expectedQuantity =
      match.maxQuantity === undefined ? line.quantity : Math.min(line.quantity, match.maxQuantity);
    const expectedAmount = expectedQuantity * match.unitPrice;
    expectedTotal += expectedAmount;
    const refs = Object.freeze([...baseEvidence, ...match.evidence]);
    matchedLines.push(
      Object.freeze({
        invoiceLineId: line.lineId,
        governingLineId: match.governingLineId,
        expectedQuantity,
        expectedUnitPrice: match.unitPrice,
        expectedAmount,
        billedAmount,
        evidence: refs,
      }),
    );
    const priceExposure = Math.max(0, line.unitPrice - match.unitPrice) * line.quantity;
    const quantityExposure =
      match.maxQuantity === undefined
        ? 0
        : Math.max(0, line.quantity - match.maxQuantity) * match.unitPrice;
    const allowedPrice = Math.max(amountTolerance, billedAmount * (percentTolerance / 100));
    if (priceExposure > allowedPrice)
      addFinding('PRICE_OVERCHARGE', priceExposure, refs, line.lineId);
    if (quantityExposure > allowedPrice)
      addFinding('QUANTITY_OVERCHARGE', quantityExposure, refs, line.lineId);
  }
  const history = (input.historicalInvoices ?? []) as unknown[];
  for (const raw of history) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as Record<string, unknown>;
    const candidateId = id(candidate['invoiceId']);
    const candidateSupplierId = id(candidate['supplierId']);
    const candidateHash = hash(candidate['contentSha256']);
    const candidateNumber = text(candidate['invoiceNumber'], 128);
    const candidateDate = text(candidate['invoiceDate'], 32);
    const candidateEvidence = evidence(candidate['evidence']);
    if (
      candidateId &&
      candidateSupplierId === supplierId &&
      candidateEvidence &&
      (candidateHash === contentSha256 ||
        (candidateNumber === invoiceNumber && candidateDate === invoiceDate))
    ) {
      addFinding(
        'DUPLICATE_INVOICE',
        total,
        Object.freeze([...invoiceEvidence, ...candidateEvidence]),
        undefined,
      );
      break;
    }
  }
  const variance = complete ? Number((total - expectedTotal).toFixed(2)) : null;
  const calculationVersion = text(input.calculationVersion ?? 'ild-v1', 64) ?? 'ild-v1';
  return Object.freeze({
    schemaVersion: INVOICE_LEAK_DETECTOR_SCHEMA_VERSION_V1,
    invoiceId,
    artifactVersionId,
    inputHash: diagnosticHash({
      invoiceId,
      artifactVersionId,
      contentSha256,
      governing,
      calculationVersion,
    }),
    calculationVersion,
    billedTotal: total,
    expectedTotal: complete ? Number(expectedTotal.toFixed(2)) : null,
    variance,
    status: complete && findings.length === 0 ? 'COMPLETE' : 'NEEDS_REVIEW',
    findings: Object.freeze(findings),
    matchedLines: Object.freeze(matchedLines),
  });
}

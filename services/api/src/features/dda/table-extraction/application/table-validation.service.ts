export type TableExtractionProfileV1 = 'RECEIPT_V1' | 'INVOICE_V1' | 'TABLE_V1';

export type TableMediaAdmissionCodeV1 =
  | 'UNSUPPORTED_MIME'
  | 'OVERSIZED_BYTES'
  | 'OVERSIZED_PIXELS'
  | 'OVERSIZED_PAGES'
  | 'DECOMPRESSION_BOMB';

export type TableValidationCodeV1 =
  | 'DUPLICATE_HEADER'
  | 'RAGGED_ROW'
  | 'LOW_CONFIDENCE'
  | 'FORMULA_INJECTION'
  | 'OFF_PAGE_COORDINATE'
  | 'MISSING_COORDINATE'
  | 'EXTRA_PROPERTY'
  | 'UNSUPPORTED_PROFILE'
  | 'EMPTY_TABLE';

export interface TableMediaAdmissionInputV1 {
  readonly mimeType: string;
  readonly byteSize: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly pageCount: number;
  readonly decompressionRatio?: number;
}

export interface TableCellRawV1 {
  readonly row: number;
  readonly column: number;
  readonly text: string;
  readonly confidence: number;
  readonly evidence: {
    readonly page: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface TableExtractionRawCandidateV1 {
  readonly profileVersion: TableExtractionProfileV1;
  readonly pageCount: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly columns: readonly string[];
  readonly cells: readonly TableCellRawV1[];
}

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'application/pdf']);
const MAX_BYTES = 50_000_000;
const MAX_PIXELS = 40_000_000;
const MAX_PAGES = 20;
const MAX_DECOMPRESSION_RATIO = 100;
const MIN_CONFIDENCE = 0.5;
const FORMULA_PREFIX = /^[=+\-@]/u;

export function admitTableMedia(
  input: TableMediaAdmissionInputV1,
):
  | { readonly accepted: true }
  | { readonly accepted: false; readonly code: TableMediaAdmissionCodeV1 } {
  if (!ALLOWED_MIME.has(input.mimeType.toLowerCase())) {
    return Object.freeze({ accepted: false, code: 'UNSUPPORTED_MIME' });
  }
  if (input.byteSize > MAX_BYTES) {
    return Object.freeze({ accepted: false, code: 'OVERSIZED_BYTES' });
  }
  if (input.widthPx * input.heightPx > MAX_PIXELS) {
    return Object.freeze({ accepted: false, code: 'OVERSIZED_PIXELS' });
  }
  if (input.pageCount < 1 || input.pageCount > MAX_PAGES) {
    return Object.freeze({ accepted: false, code: 'OVERSIZED_PAGES' });
  }
  if ((input.decompressionRatio ?? 1) > MAX_DECOMPRESSION_RATIO) {
    return Object.freeze({ accepted: false, code: 'DECOMPRESSION_BOMB' });
  }
  return Object.freeze({ accepted: true });
}

function hasExtraProperty(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  const keys = Object.keys(value as Record<string, unknown>);
  const allowed = new Set(['row', 'column', 'text', 'confidence', 'evidence']);
  return keys.some((key) => !allowed.has(key));
}

/** DDA-057: deterministic table candidate validation; never registers DatasetVersion. */
export function validateTableExtractionCandidate(input: TableExtractionRawCandidateV1):
  | { readonly accepted: true; readonly warnings: readonly string[] }
  | {
      readonly accepted: false;
      readonly code: TableValidationCodeV1;
      readonly requiresReview: true;
    } {
  if (input.profileVersion !== 'TABLE_V1') {
    return Object.freeze({
      accepted: false,
      code: 'UNSUPPORTED_PROFILE',
      requiresReview: true as const,
    });
  }
  if (input.columns.length === 0 || input.cells.length === 0) {
    return Object.freeze({ accepted: false, code: 'EMPTY_TABLE', requiresReview: true as const });
  }
  if (new Set(input.columns).size !== input.columns.length) {
    return Object.freeze({
      accepted: false,
      code: 'DUPLICATE_HEADER',
      requiresReview: true as const,
    });
  }

  const byRow = new Map<number, number>();
  for (const cell of input.cells) {
    if (hasExtraProperty(cell)) {
      return Object.freeze({
        accepted: false,
        code: 'EXTRA_PROPERTY',
        requiresReview: true as const,
      });
    }
    if (
      !cell.evidence ||
      !Number.isFinite(cell.evidence.page) ||
      !Number.isFinite(cell.evidence.x) ||
      !Number.isFinite(cell.evidence.y) ||
      !Number.isFinite(cell.evidence.width) ||
      !Number.isFinite(cell.evidence.height)
    ) {
      return Object.freeze({
        accepted: false,
        code: 'MISSING_COORDINATE',
        requiresReview: true as const,
      });
    }
    const { x, y, width, height, page } = cell.evidence;
    if (
      page < 1 ||
      page > input.pageCount ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > input.pageWidth ||
      y + height > input.pageHeight
    ) {
      return Object.freeze({
        accepted: false,
        code: 'OFF_PAGE_COORDINATE',
        requiresReview: true as const,
      });
    }
    if (cell.confidence < MIN_CONFIDENCE) {
      return Object.freeze({
        accepted: false,
        code: 'LOW_CONFIDENCE',
        requiresReview: true as const,
      });
    }
    if (FORMULA_PREFIX.test(cell.text.trim())) {
      return Object.freeze({
        accepted: false,
        code: 'FORMULA_INJECTION',
        requiresReview: true as const,
      });
    }
    byRow.set(cell.row, (byRow.get(cell.row) ?? 0) + 1);
  }

  for (const count of byRow.values()) {
    if (count !== input.columns.length) {
      return Object.freeze({ accepted: false, code: 'RAGGED_ROW', requiresReview: true as const });
    }
  }

  return Object.freeze({ accepted: true, warnings: Object.freeze([]) });
}

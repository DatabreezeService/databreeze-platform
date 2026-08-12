import assert from 'node:assert/strict';
import test from 'node:test';

import {
  admitTableMedia,
  validateTableExtractionCandidate,
  type TableExtractionRawCandidateV1,
} from '../../../src/features/dda/table-extraction/application/table-validation.service.js';

const baseCandidate: TableExtractionRawCandidateV1 = {
  profileVersion: 'TABLE_V1',
  pageCount: 1,
  pageWidth: 1000,
  pageHeight: 1400,
  columns: ['item', 'qty', 'amount'],
  cells: [
    {
      row: 0,
      column: 0,
      text: 'Coffee',
      confidence: 0.92,
      evidence: { page: 1, x: 10, y: 10, width: 40, height: 12 },
    },
    {
      row: 0,
      column: 1,
      text: '1',
      confidence: 0.9,
      evidence: { page: 1, x: 60, y: 10, width: 20, height: 12 },
    },
    {
      row: 0,
      column: 2,
      text: '25000',
      confidence: 0.91,
      evidence: { page: 1, x: 90, y: 10, width: 40, height: 12 },
    },
  ],
};

function expectCode<T extends { readonly accepted: boolean; readonly code?: string }>(
  result: T,
  code: string,
): void {
  assert.equal(result.accepted, false);
  assert.equal(result.code, code);
}

void test('[DDA-057] admits supported bounded table media and rejects hostile limits', () => {
  assert.equal(
    admitTableMedia({
      mimeType: 'image/png',
      byteSize: 100_000,
      widthPx: 1200,
      heightPx: 1600,
      pageCount: 1,
    }).accepted,
    true,
  );
  expectCode(
    admitTableMedia({
      mimeType: 'application/pdf',
      byteSize: 50_000_001,
      widthPx: 1200,
      heightPx: 1600,
      pageCount: 1,
    }),
    'OVERSIZED_BYTES',
  );
  expectCode(
    admitTableMedia({
      mimeType: 'text/plain',
      byteSize: 100,
      widthPx: 100,
      heightPx: 100,
      pageCount: 1,
    }),
    'UNSUPPORTED_MIME',
  );
  expectCode(
    admitTableMedia({
      mimeType: 'image/png',
      byteSize: 1000,
      widthPx: 800,
      heightPx: 600,
      pageCount: 1,
      decompressionRatio: 200,
    }),
    'DECOMPRESSION_BOMB',
  );
});

void test('[DDA-057] validates schema coordinates confidence and rejects hostile cells', () => {
  const ok = validateTableExtractionCandidate(baseCandidate);
  assert.equal(ok.accepted, true);

  expectCode(
    validateTableExtractionCandidate({
      ...baseCandidate,
      columns: ['item', 'item', 'amount'],
    }),
    'DUPLICATE_HEADER',
  );
  expectCode(
    validateTableExtractionCandidate({
      ...baseCandidate,
      cells: [
        ...baseCandidate.cells,
        {
          row: 1,
          column: 0,
          text: 'Tea',
          confidence: 0.9,
          evidence: { page: 1, x: 10, y: 30, width: 40, height: 12 },
        },
      ],
    }),
    'RAGGED_ROW',
  );
  expectCode(
    validateTableExtractionCandidate({
      ...baseCandidate,
      cells: [
        {
          ...baseCandidate.cells[0]!,
          evidence: { page: 1, x: 10, y: 10, width: 40, height: 12 },
          confidence: 0.2,
        },
        baseCandidate.cells[1]!,
        baseCandidate.cells[2]!,
      ],
    }),
    'LOW_CONFIDENCE',
  );
  expectCode(
    validateTableExtractionCandidate({
      ...baseCandidate,
      cells: [
        {
          ...baseCandidate.cells[0]!,
          text: '=cmd|calc',
        },
        baseCandidate.cells[1]!,
        baseCandidate.cells[2]!,
      ],
    }),
    'FORMULA_INJECTION',
  );
  expectCode(
    validateTableExtractionCandidate({
      ...baseCandidate,
      cells: [
        {
          ...baseCandidate.cells[0]!,
          evidence: { page: 1, x: 10, y: 10, width: 4000, height: 12 },
        },
        baseCandidate.cells[1]!,
        baseCandidate.cells[2]!,
      ],
    }),
    'OFF_PAGE_COORDINATE',
  );
  expectCode(
    validateTableExtractionCandidate({
      ...baseCandidate,
      cells: [
        {
          row: 0,
          column: 0,
          text: 'Coffee',
          confidence: 0.9,
          evidence: { page: 1, x: 10, y: 10, width: 40, height: 12 },
          extra: true,
        } as never,
        baseCandidate.cells[1]!,
        baseCandidate.cells[2]!,
      ],
    }),
    'EXTRA_PROPERTY',
  );
});

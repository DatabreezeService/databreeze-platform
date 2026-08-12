import { describe, expect, it } from 'vitest';

import {
  classifyStableFile,
  type SourceClassificationInputV1,
} from '../src/application/source-classification.service.ts';

const base: SourceClassificationInputV1 = {
  relativePath: 'sales/sales-2026-08.csv',
  extension: 'csv',
  contentFingerprint: 'a'.repeat(64),
  schemaFingerprint: 'b'.repeat(64),
  headers: ['invoice_id', 'amount', 'region'],
  sheetNames: [],
  previouslyAccepted: [
    {
      logicalDatasetId: '00000000-0000-4000-8000-000000000701',
      intendedFolder: 'sales',
      schemaFingerprint: 'b'.repeat(64),
      purpose: 'monthly-sales',
    },
  ],
  folderManifestDatasetIds: ['00000000-0000-4000-8000-000000000701'],
};

describe('[DDA-059][DSK-010] source classification', () => {
  it('matches previously accepted schema and folder assignment', () => {
    const result = classifyStableFile(base);
    expect(result.disposition).toBe('MATCH');
    expect(result.logicalDatasetId).toBe('00000000-0000-4000-8000-000000000701');
    expect(result.intendedFolder).toBe('sales');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('flags misplaced files when schema matches a different folder', () => {
    const result = classifyStableFile({
      ...base,
      relativePath: 'receipts/sales-2026-08.csv',
    });
    expect(result.disposition).toBe('MISPLACED');
    expect(result.reasons).toContain('FOLDER_MISMATCH');
  });

  it('returns AMBIGUOUS when multiple datasets share headers', () => {
    const result = classifyStableFile({
      ...base,
      previouslyAccepted: [
        ...base.previouslyAccepted,
        {
          logicalDatasetId: '00000000-0000-4000-8000-000000000702',
          intendedFolder: 'archive',
          schemaFingerprint: 'b'.repeat(64),
          purpose: 'archive-sales',
        },
      ],
      folderManifestDatasetIds: [
        '00000000-0000-4000-8000-000000000701',
        '00000000-0000-4000-8000-000000000702',
      ],
    });
    expect(result.disposition).toBe('AMBIGUOUS');
    expect(result.reasons).toContain('MULTIPLE_DATASET_CANDIDATES');
  });

  it('returns UNSUPPORTED for unknown extensions and treats store names as data', () => {
    const result = classifyStableFile({
      ...base,
      extension: 'exe',
      relativePath: 'inbox/Store Alpha sales.csv.exe',
    });
    expect(result.disposition).toBe('UNSUPPORTED');
    expect(result.sampleDescriptor).toContain('Store Alpha');
    expect(result.reasons).toContain('UNSUPPORTED_EXTENSION');
  });

  it('flags schema mismatch when fingerprints diverge', () => {
    const result = classifyStableFile({
      ...base,
      schemaFingerprint: 'c'.repeat(64),
    });
    expect(result.disposition).toBe('AMBIGUOUS');
    expect(result.reasons).toContain('SCHEMA_MISMATCH');
  });
});

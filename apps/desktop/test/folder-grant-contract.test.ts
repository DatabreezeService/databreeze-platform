import { describe, expect, it } from 'vitest';
import { parseFolderGrantState } from '../src/shared/desktop-contract-v1.ts';

describe('dogfood folder grant contract', () => {
  it('accepts only bounded, content-free local folder state', () => {
    expect(
      parseFolderGrantState({
        fileCount: 3,
        lastScanAt: '2026-08-04T00:00:00.000Z',
        status: 'granted',
      }),
    ).toEqual({
      fileCount: 3,
      lastScanAt: '2026-08-04T00:00:00.000Z',
      status: 'granted',
    });
  });

  it('rejects paths, file names, extra fields, and unsafe counts', () => {
    for (const value of [
      {
        fileCount: 1,
        lastScanAt: '2026-08-04T00:00:00.000Z',
        status: 'granted',
        path: 'C:\\secret',
      },
      {
        fileCount: 1,
        lastScanAt: '2026-08-04T00:00:00.000Z',
        status: 'granted',
        fileName: 'payroll.xlsx',
      },
      { fileCount: -1, lastScanAt: null, status: 'not-granted' },
      { fileCount: 10_001, lastScanAt: null, status: 'granted' },
      { fileCount: 1, lastScanAt: '2026-08-04T00:00:00Z', status: 'granted' },
    ]) {
      expect(() => parseFolderGrantState(value)).toThrow('INVALID_FOLDER_GRANT');
    }
  });

  it('rejects timestamps that match the shape but are not valid Dates', () => {
    for (const lastScanAt of [
      '2026-02-29T00:00:00.000Z',
      '2026-13-04T00:00:00.000Z',
      '2026-08-04T25:00:00.000Z',
    ]) {
      expect(() => parseFolderGrantState({ fileCount: 1, lastScanAt, status: 'granted' })).toThrow(
        'INVALID_FOLDER_GRANT',
      );
    }
  });
});

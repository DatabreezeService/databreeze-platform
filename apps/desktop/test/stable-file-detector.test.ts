import { describe, expect, it } from 'vitest';
import { StableFileDetector } from '../src/application/stable-file-detector.ts';

describe('DDA-014 stable file detector', () => {
  it('waits through create/write/rename bursts until size and mtime stop changing', () => {
    const detector = new StableFileDetector({ debounceMs: 1000, nowMs: () => 0 });
    const path = 'C:\\Approved\\sales.csv';

    expect(detector.observe({ path, size: 10, mtimeMs: 1, kind: 'create' }, 0)).toEqual({
      state: 'PENDING',
    });
    expect(detector.observe({ path, size: 20, mtimeMs: 2, kind: 'write' }, 200)).toEqual({
      state: 'PENDING',
    });
    expect(
      detector.observe({ path, size: 20, mtimeMs: 2, kind: 'rename', previousPath: path }, 400),
    ).toEqual({ state: 'PENDING' });
    expect(detector.observe({ path, size: 20, mtimeMs: 2, kind: 'write' }, 1400)).toEqual({
      state: 'STABLE',
      path,
      size: 20,
      mtimeMs: 2,
    });
  });

  it('keeps partial copies and lock files pending and expires stale bursts', () => {
    const detector = new StableFileDetector({ debounceMs: 500, nowMs: () => 0 });
    expect(
      detector.observe(
        { path: 'C:\\Approved\\sales.csv.partial', size: 4, mtimeMs: 1, kind: 'write' },
        0,
      ),
    ).toEqual({ state: 'QUARANTINE', reason: 'PARTIAL_OR_LOCK_FILE' });
    expect(
      detector.observe(
        { path: 'C:\\Approved\\~$sales.xlsx', size: 4, mtimeMs: 1, kind: 'write' },
        0,
      ),
    ).toEqual({ state: 'QUARANTINE', reason: 'PARTIAL_OR_LOCK_FILE' });

    detector.observe({ path: 'C:\\Approved\\a.csv', size: 1, mtimeMs: 1, kind: 'write' }, 0);
    expect(detector.tick(10_000)).toEqual([
      { state: 'EXPIRED', path: 'C:\\Approved\\a.csv', reason: 'DEBOUNCE_EXPIRED' },
    ]);
  });

  it('deduplicates repeated native events and identical content at a new path after restart', () => {
    const detector = new StableFileDetector({ debounceMs: 100, nowMs: () => 0 });
    const first = detector.observe(
      { path: 'C:\\Approved\\a.csv', size: 8, mtimeMs: 9, kind: 'write' },
      0,
    );
    expect(first).toEqual({ state: 'PENDING' });
    expect(
      detector.observe({ path: 'C:\\Approved\\a.csv', size: 8, mtimeMs: 9, kind: 'write' }, 10),
    ).toEqual({ state: 'PENDING' });
    const stable = detector.observe(
      { path: 'C:\\Approved\\a.csv', size: 8, mtimeMs: 9, kind: 'write' },
      120,
    );
    expect(stable).toMatchObject({ state: 'STABLE', path: 'C:\\Approved\\a.csv' });

    const contentFingerprint = 'sha256:' + 'ab'.repeat(32);
    detector.rememberContent(contentFingerprint, 'C:\\Approved\\a.csv');
    detector.restartWatcher();
    expect(
      detector.observe(
        {
          path: 'C:\\Approved\\copy.csv',
          size: 8,
          mtimeMs: 11,
          kind: 'create',
          contentFingerprint,
        },
        0,
      ),
    ).toEqual({ state: 'PENDING' });
    expect(
      detector.observe(
        {
          path: 'C:\\Approved\\copy.csv',
          size: 8,
          mtimeMs: 11,
          kind: 'create',
          contentFingerprint,
        },
        120,
      ),
    ).toEqual({
      state: 'DUPLICATE_CONTENT',
      path: 'C:\\Approved\\copy.csv',
      contentFingerprint,
    });
  });
});

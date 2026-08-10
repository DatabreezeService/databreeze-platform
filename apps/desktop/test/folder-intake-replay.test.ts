import { describe, expect, it } from 'vitest';
import { FolderIntakeService } from '../src/application/folder-intake.service.ts';
import { StableFileDetector } from '../src/application/stable-file-detector.ts';
import type { FolderManifestRevision } from '../src/application/folder-manifest.service.ts';

const ROOT = 'D:\\Approved';

function manifest(): FolderManifestRevision {
  return {
    version: 1,
    parentVersion: null,
    purpose: 'sales-intake',
    supportedProfiles: ['CSV'],
    schemaFingerprints: ['a'.repeat(64)],
    groupingRules: ['by-period'],
    versionBehavior: 'APPEND',
    periodOverlapPolicy: 'REJECT',
    duplicateKeyFields: ['invoice_id'],
    mappingPolicyId: '01GGGGGGGGGGGGGGGGGGGGGGGG',
    stabilityDebounceMs: 50,
    publicationProjection: {
      class: 'METADATA_ONLY',
      fieldAllowlist: [],
    },
    createdAtMs: 1,
    manifestHash: 'b'.repeat(64),
  };
}

describe('DDA-014 folder intake replay ledger', () => {
  it('deduplicates replayed events and quarantines period overlap and duplicate keys', async () => {
    const intake = new FolderIntakeService({
      detector: new StableFileDetector({ debounceMs: 50, nowMs: () => 0 }),
      bindingRoot: ROOT,
      manifest: manifest(),
      assertInsideBinding: (candidate) => candidate.startsWith(ROOT),
      readFingerprint: () =>
        Promise.resolve({
          accepted: true as const,
          contentFingerprint: 'sha256:' + '33'.repeat(32),
          schemaFingerprint: 'a'.repeat(64),
          profile: 'CSV' as const,
          periodKey: '2026-Q1',
          duplicateKey: 'INV-1',
        }),
    });

    const first = await intake.admitStableFile({
      path: `${ROOT}\\sales.csv`,
      size: 4,
      mtimeMs: 1,
      nowMs: 100,
    });
    expect(first.disposition).toBe('ADMITTED');

    const replay = await intake.admitStableFile({
      path: `${ROOT}\\sales.csv`,
      size: 4,
      mtimeMs: 1,
      nowMs: 200,
    });
    expect(replay).toMatchObject({ disposition: 'DUPLICATE_EVENT' });

    const overlap = await intake.admitStableFile({
      path: `${ROOT}\\sales-q1-again.csv`,
      size: 5,
      mtimeMs: 2,
      nowMs: 300,
    });
    expect(overlap).toMatchObject({ disposition: 'QUARANTINE', reason: 'PERIOD_OVERLAP' });
  });
});

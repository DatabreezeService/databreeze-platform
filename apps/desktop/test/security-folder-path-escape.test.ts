import { describe, expect, it } from 'vitest';
import { FolderIntakeService } from '../src/application/folder-intake.service.ts';
import { StableFileDetector } from '../src/application/stable-file-detector.ts';
import type { FolderManifestRevision } from '../src/application/folder-manifest.service.ts';

const BINDING_ROOT = 'C:\\Users\\demo\\ApprovedSales';

function manifest(): FolderManifestRevision {
  return {
    version: 1,
    parentVersion: null,
    purpose: 'sales-intake',
    supportedProfiles: ['CSV', 'XLSX'],
    schemaFingerprints: ['a'.repeat(64)],
    groupingRules: ['by-period'],
    versionBehavior: 'APPEND',
    periodOverlapPolicy: 'REJECT',
    duplicateKeyFields: ['invoice_id'],
    mappingPolicyId: '01GGGGGGGGGGGGGGGGGGGGGGGG',
    stabilityDebounceMs: 100,
    publicationProjection: {
      class: 'DASHBOARD_AGGREGATES',
      fieldAllowlist: ['amount', 'period'],
    },
    createdAtMs: 1,
    manifestHash: 'b'.repeat(64),
  };
}

describe('DDA-014 folder path escape security', () => {
  it('quarantines path escape, unsupported content, schema drift, and never mutates sources', async () => {
    const mutations: string[] = [];
    const intake = new FolderIntakeService({
      detector: new StableFileDetector({ debounceMs: 100, nowMs: () => 0 }),
      bindingRoot: BINDING_ROOT,
      manifest: manifest(),
      assertInsideBinding: (candidate) =>
        candidate.toLowerCase().startsWith(BINDING_ROOT.toLowerCase()),
      readFingerprint: async (path) => {
        if (path.endsWith('escape.csv')) return { rejected: 'PATH_ESCAPE' as const };
        if (path.endsWith('code.js')) return { rejected: 'UNSUPPORTED_PROFILE' as const };
        if (path.endsWith('drift.csv')) {
          return {
            accepted: true as const,
            contentFingerprint: 'sha256:' + '11'.repeat(32),
            schemaFingerprint: 'c'.repeat(64),
            profile: 'CSV' as const,
          };
        }
        return {
          accepted: true as const,
          contentFingerprint: 'sha256:' + '22'.repeat(32),
          schemaFingerprint: 'a'.repeat(64),
          profile: 'CSV' as const,
        };
      },
      mutateSource: async (path, action) => {
        mutations.push(`${action}:${path}`);
      },
    });

    await expect(
      intake.admitStableFile({
        path: 'C:\\Users\\demo\\Other\\escape.csv',
        size: 10,
        mtimeMs: 1,
        nowMs: 200,
      }),
    ).resolves.toMatchObject({ disposition: 'QUARANTINE', reason: 'PATH_ESCAPE' });

    await expect(
      intake.admitStableFile({
        path: `${BINDING_ROOT}\\code.js`,
        size: 10,
        mtimeMs: 1,
        nowMs: 200,
      }),
    ).resolves.toMatchObject({ disposition: 'QUARANTINE', reason: 'UNSUPPORTED_PROFILE' });

    await expect(
      intake.admitStableFile({
        path: `${BINDING_ROOT}\\drift.csv`,
        size: 10,
        mtimeMs: 1,
        nowMs: 200,
      }),
    ).resolves.toMatchObject({ disposition: 'QUARANTINE', reason: 'SCHEMA_DRIFT' });

    const ok = await intake.admitStableFile({
      path: `${BINDING_ROOT}\\sales.csv`,
      size: 10,
      mtimeMs: 1,
      nowMs: 200,
    });
    expect(ok).toMatchObject({ disposition: 'ADMITTED', profile: 'CSV' });
    expect(mutations).toEqual([]);
  });
});

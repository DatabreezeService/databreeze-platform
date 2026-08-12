import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../tools/fixture-validation/fixtures/dda/unified-workspace',
);

type UnifiedWorkspaceManifest = {
  readonly artifacts: Record<string, string>;
  readonly datasetVersions: number;
  readonly restrictedMemberPreset: string;
  readonly journeySteps: readonly string[];
  readonly expectations: {
    readonly providerCalls: number;
    readonly localCloudParity: boolean;
    readonly viewerCanMutateSharedCanvas: boolean;
  };
  readonly conversation: { readonly title: string };
};

describe('Desktop unified workspace journey fixture', () => {
  it('loads the golden synthetic fixture without external provider calls', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'),
    ) as UnifiedWorkspaceManifest;
    expect(manifest.expectations.providerCalls).toBe(0);
    expect(manifest.expectations.localCloudParity).toBe(true);
    expect(manifest.restrictedMemberPreset).toBe('Viewer');
    expect(manifest.datasetVersions).toBe(2);
    expect(manifest.journeySteps).toContain('folder-classify-move-undo');
    expect(manifest.journeySteps).toContain('synchronized-refresh');
  });

  it('keeps Desktop folder and OCR artifacts present for local/cloud parity', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'),
    ) as UnifiedWorkspaceManifest;
    for (const relativePath of Object.values(manifest.artifacts)) {
      const absolute = path.join(fixtureDir, relativePath);
      expect(existsSync(absolute)).toBe(true);
      const digest = createHash('sha256').update(readFileSync(absolute)).digest('hex');
      expect(digest).toMatch(/^[a-f0-9]{64}$/u);
    }
    expect(manifest.expectations.viewerCanMutateSharedCanvas).toBe(false);
    expect(manifest.conversation.title.length).toBeGreaterThan(0);
  });
});

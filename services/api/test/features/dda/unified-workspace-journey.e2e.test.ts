import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const fixtureDir = path.resolve(
  process.cwd(),
  '../../tools/fixture-validation/fixtures/dda/unified-workspace',
);

type UnifiedWorkspaceManifest = {
  readonly fixtureId: string;
  readonly localeDefault: string;
  readonly artifacts: {
    readonly csv: string;
    readonly xlsx: string;
    readonly receipt: string;
    readonly invoice: string;
    readonly table: string;
    readonly mismatch: string;
    readonly folderUpdate: string;
  };
  readonly datasetVersions: number;
  readonly restrictedMemberPreset: string;
  readonly conversation: {
    readonly title: string;
    readonly datasetVersionFrom: string;
    readonly datasetVersionTo: string;
  };
  readonly dashboard: { readonly title: string; readonly starterWidgets: readonly string[] };
  readonly journeySteps: readonly string[];
  readonly expectations: {
    readonly governedRowCount: number;
    readonly qualityState: string;
    readonly reasonCodes: readonly string[];
    readonly providerCalls: number;
    readonly localCloudParity: boolean;
    readonly viewerCanMutateSharedCanvas: boolean;
  };
};

function loadManifest(): UnifiedWorkspaceManifest {
  return JSON.parse(
    readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'),
  ) as UnifiedWorkspaceManifest;
}

void test('[UDW-JOURNEY] golden fixture declares the full cross-platform journey without providers', () => {
  const manifest = loadManifest();
  const csv = readFileSync(path.join(fixtureDir, manifest.artifacts.csv), 'utf8');
  const rows = csv.trim().split(/\r?\n/u).slice(1);

  assert.equal(manifest.fixtureId, 'unified-workspace-golden-v1');
  assert.equal(manifest.localeDefault, 'vi-VN');
  assert.equal(manifest.expectations.providerCalls, 0);
  assert.equal(manifest.expectations.governedRowCount, rows.length);
  assert.equal(manifest.expectations.qualityState, 'READY');
  assert.deepEqual(manifest.expectations.reasonCodes, []);
  assert.equal(manifest.expectations.localCloudParity, true);
  assert.equal(manifest.expectations.viewerCanMutateSharedCanvas, false);
  assert.equal(manifest.restrictedMemberPreset, 'Viewer');
  assert.equal(manifest.datasetVersions, 2);
  assert.match(csv, /an_uong/u);
  assert.match(manifest.conversation.title, /chi phí|ăn uống/iu);
  assert.notEqual(manifest.conversation.datasetVersionFrom, manifest.conversation.datasetVersionTo);
  assert.ok(manifest.dashboard.starterWidgets.includes('KPI'));
  assert.ok(manifest.journeySteps.includes('viewer-denial'));
  assert.ok(manifest.journeySteps.includes('provider-outage-fallback'));
  assert.ok(manifest.journeySteps.includes('last-good-snapshot'));
});

void test('[UDW-JOURNEY] every declared synthetic artifact exists and stays content-addressable', () => {
  const manifest = loadManifest();
  const digests = new Map<string, string>();
  for (const [key, relativePath] of Object.entries(manifest.artifacts)) {
    const absolute = path.join(fixtureDir, relativePath);
    assert.equal(existsSync(absolute), true, `missing artifact ${key}:${relativePath}`);
    const bytes = readFileSync(absolute);
    assert.ok(bytes.byteLength > 0, `empty artifact ${key}`);
    digests.set(key, createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(digests.size, Object.keys(manifest.artifacts).length);
  assert.match(digests.get('csv') ?? '', /^[a-f0-9]{64}$/u);
  assert.notEqual(digests.get('csv'), digests.get('mismatch'));
  assert.notEqual(digests.get('receipt'), digests.get('invoice'));
});

void test('[UDW-JOURNEY] Viewer restriction and provider-free gates stay fail-closed in fixture policy', () => {
  const manifest = loadManifest();
  assert.equal(manifest.restrictedMemberPreset, 'Viewer');
  assert.equal(manifest.expectations.viewerCanMutateSharedCanvas, false);
  assert.equal(manifest.expectations.providerCalls, 0);
  assert.ok(!manifest.journeySteps.includes('live-openai-call'));
});

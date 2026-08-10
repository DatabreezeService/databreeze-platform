import { describe, expect, it } from 'vitest';
import { FolderManifestService } from '../src/application/folder-manifest.service.ts';
import type { FolderBindingPort } from '../src/application/folder-binding.port.ts';
import {
  parseFolderManifestPolicy,
  type FolderManifestPolicyV1,
} from '../src/shared/folder-binding-contract-v1.ts';

const ORG = '01AAAAAAAAAAAAAAAAAAAAAAAA';
const WORKSPACE = '01BBBBBBBBBBBBBBBBBBBBBBBB';
const CAPABILITY = '01CCCCCCCCCCCCCCCCCCCCCCCC';

function validManifest(overrides: Partial<FolderManifestPolicyV1> = {}): FolderManifestPolicyV1 {
  return {
    purpose: 'sales-intake',
    supportedProfiles: ['CSV', 'XLSX'],
    schemaFingerprints: ['b'.repeat(64)],
    groupingRules: ['by-period'],
    versionBehavior: 'VERSION',
    periodOverlapPolicy: 'ALLOW_WITH_REVIEW',
    duplicateKeyFields: ['invoice_id'],
    mappingPolicyId: '01GGGGGGGGGGGGGGGGGGGGGGGG',
    stabilityDebounceMs: 2000,
    publicationProjection: {
      class: 'SELECTED_ROWS_COLUMNS',
      fieldAllowlist: ['amount', 'period', 'region'],
    },
    ...overrides,
  };
}

function createService() {
  const port: FolderBindingPort = {
    selectFolder: async () => ({ selectionToken: 'sel_1' }),
    resolveSelection: async () => ({ canonicalPath: 'D:\\Data\\Approved' }),
    assertPathInsideBinding: () => true,
    detectSymlinkEscape: async () => false,
  };
  return new FolderManifestService({
    port,
    store: { bindings: new Map() },
    nowMs: () => 1_700_000_000_000,
    resolveCapability: () => ({
      state: 'ACTIVE',
      organizationId: ORG,
      workspaceId: WORKSPACE,
    }),
  });
}

describe('DDA-013 versioned folder manifest', () => {
  it('requires every governed policy field before accepting a manifest', () => {
    expect(() =>
      parseFolderManifestPolicy({
        purpose: 'sales-intake',
        supportedProfiles: ['CSV'],
      }),
    ).toThrow('FOLDER_MANIFEST_INCOMPLETE');

    const parsed = parseFolderManifestPolicy(validManifest());
    expect(parsed).toMatchObject({
      purpose: 'sales-intake',
      supportedProfiles: ['CSV', 'XLSX'],
      versionBehavior: 'VERSION',
      periodOverlapPolicy: 'ALLOW_WITH_REVIEW',
      stabilityDebounceMs: 2000,
      publicationProjection: {
        class: 'SELECTED_ROWS_COLUMNS',
        fieldAllowlist: ['amount', 'period', 'region'],
      },
    });
  });

  it('rejects manifest updates that omit required policy or collide on revision', async () => {
    const service = createService();
    const created = await service.createBinding({
      selectionToken: 'sel_1',
      capabilityGrantId: CAPABILITY,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      displayName: 'Approved',
      manifest: validManifest(),
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;

    await expect(
      service.updateManifest({
        bindingId: created.value.bindingId,
        expectedVersion: 1,
        manifest: validManifest({ purpose: '' }),
      }),
    ).resolves.toEqual({ accepted: false, code: 'FOLDER_MANIFEST_INCOMPLETE' });

    const ok = await service.updateManifest({
      bindingId: created.value.bindingId,
      expectedVersion: 1,
      manifest: validManifest({ purpose: 'sales-intake-v2' }),
    });
    expect(ok.accepted).toBe(true);
    if (!ok.accepted) return;
    expect(ok.value.manifestVersion).toBe(2);

    await expect(
      service.updateManifest({
        bindingId: created.value.bindingId,
        expectedVersion: 1,
        manifest: validManifest({ purpose: 'stale' }),
      }),
    ).resolves.toEqual({ accepted: false, code: 'FOLDER_MANIFEST_REVISION_CONFLICT' });
  });

  it('parents immutable manifests so updates create a new version instead of mutating history', async () => {
    const service = createService();
    const created = await service.createBinding({
      selectionToken: 'sel_1',
      capabilityGrantId: CAPABILITY,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      displayName: 'Approved',
      manifest: validManifest(),
    });
    if (!created.accepted) throw new Error('expected create');

    const updated = await service.updateManifest({
      bindingId: created.value.bindingId,
      expectedVersion: 1,
      manifest: validManifest({ purpose: 'sales-intake-v2', stabilityDebounceMs: 3000 }),
    });
    if (!updated.accepted) throw new Error('expected update');

    const history = service.manifestHistory(created.value.bindingId);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ version: 1, purpose: 'sales-intake', parentVersion: null });
    expect(history[1]).toMatchObject({
      version: 2,
      purpose: 'sales-intake-v2',
      parentVersion: 1,
      stabilityDebounceMs: 3000,
    });
    expect(history[0]?.purpose).toBe('sales-intake');
  });
});

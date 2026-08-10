import { describe, expect, it, vi } from 'vitest';
import { FolderIntakeService } from '../src/application/folder-intake.service.ts';
import { StableFileDetector } from '../src/application/stable-file-detector.ts';
import type { StableFileEvent } from '../src/application/stable-file-detector.ts';
import type { FolderManifestService } from '../src/application/folder-manifest.service.ts';
import { FolderWatcherLifecycle } from '../src/main/folder-watcher-lifecycle.ts';

const BINDING = '01HHHHHHHHHHHHHHHHHHHHHHHH';
const ROOT = 'C:\\Approved';

class FakeWatcher {
  #listener: ((event: StableFileEvent) => void) | undefined;
  readonly start = vi.fn();
  readonly dispose = vi.fn();

  onEvent(listener: (event: StableFileEvent) => void): () => void {
    this.#listener = listener;
    return () => {
      this.#listener = undefined;
    };
  }

  emit(event: StableFileEvent): void {
    this.#listener?.(event);
  }
}

function watcherConfiguration() {
  return {
    bindingId: BINDING,
    canonicalPath: ROOT,
    manifest: {
      version: 1,
      parentVersion: null,
      purpose: 'sales-intake',
      supportedProfiles: ['CSV'],
      schemaFingerprints: ['a'.repeat(64)],
      groupingRules: ['by-period'],
      versionBehavior: 'APPEND' as const,
      periodOverlapPolicy: 'REJECT' as const,
      duplicateKeyFields: ['invoice_id'],
      mappingPolicyId: '01GGGGGGGGGGGGGGGGGGGGGGGG',
      stabilityDebounceMs: 250,
      publicationProjection: { class: 'METADATA_ONLY' as const, fieldAllowlist: [] },
      createdAtMs: 1,
      manifestHash: 'b'.repeat(64),
    },
  };
}

describe('DDA-014 production folder watcher lifecycle', () => {
  it('starts a watcher only for a successful active binding and disposes it on disable', async () => {
    const watcher = new FakeWatcher();
    const intake = {
      admitStableFile: vi.fn(() =>
        Promise.resolve({
          disposition: 'QUARANTINE' as const,
          reason: 'SCHEMA_DRIFT' as const,
          path: `${ROOT}\\unfamiliar.csv`,
          eventId: 'evt_1',
        }),
      ),
    };
    const folders = {
      watcherConfiguration: vi.fn(() => watcherConfiguration()),
    } as unknown as FolderManifestService;
    const lifecycle = new FolderWatcherLifecycle({
      folders,
      assertInsideBinding: (root, candidate) => candidate.startsWith(root),
      createIntake: vi.fn(() => intake),
      createWatcher: vi.fn(() => watcher),
      nowMs: () => 100,
    });

    lifecycle.attach(BINDING);
    watcher.emit({ path: `${ROOT}\\unfamiliar.csv`, size: 4, mtimeMs: 1, kind: 'write' });
    await Promise.resolve();

    expect(watcher.start).toHaveBeenCalledOnce();
    expect(intake.admitStableFile).toHaveBeenCalledWith({
      path: `${ROOT}\\unfamiliar.csv`,
      size: 4,
      mtimeMs: 1,
      nowMs: 100,
    });

    lifecycle.detach(BINDING);
    expect(watcher.dispose).toHaveBeenCalledOnce();
  });

  it('does not create a watcher when the binding is absent or inactive', () => {
    const createWatcher = vi.fn();
    const lifecycle = new FolderWatcherLifecycle({
      folders: { watcherConfiguration: () => null } as unknown as FolderManifestService,
      assertInsideBinding: () => false,
      createIntake: vi.fn(),
      createWatcher,
      nowMs: () => 100,
    });

    lifecycle.attach(BINDING);

    expect(createWatcher).not.toHaveBeenCalled();
  });

  it('routes watcher files with unfamiliar schemas into the quarantine review queue', async () => {
    const watcher = new FakeWatcher();
    let intake: FolderIntakeService | undefined;
    const lifecycle = new FolderWatcherLifecycle({
      folders: {
        watcherConfiguration,
      } as unknown as FolderManifestService,
      assertInsideBinding: (root, candidate) => candidate.startsWith(root),
      createWatcher: () => watcher,
      createIntake: (configuration) => {
        intake = new FolderIntakeService({
          detector: new StableFileDetector({ debounceMs: 250, nowMs: () => 0 }),
          bindingId: configuration.bindingId,
          bindingRoot: configuration.canonicalPath,
          manifest: configuration.manifest,
          assertInsideBinding: (candidate) => candidate.startsWith(ROOT),
          readFingerprint: () =>
            Promise.resolve({
              accepted: true,
              contentFingerprint: 'sha256:' + '11'.repeat(32),
              schemaFingerprint: 'z'.repeat(64),
              profile: 'CSV',
            }),
        });
        return intake;
      },
      nowMs: () => 100,
    });

    lifecycle.attach(BINDING);
    watcher.emit({ path: `${ROOT}\\unfamiliar.csv`, size: 4, mtimeMs: 1, kind: 'write' });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(intake?.reviewQueue()).toMatchObject([{ reason: 'SCHEMA_DRIFT' }]);
  });
});

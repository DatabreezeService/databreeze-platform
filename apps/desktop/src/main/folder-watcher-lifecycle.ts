import type { FolderIntakeService } from '../application/folder-intake.service.ts';
import type {
  FolderManifestRevision,
  FolderManifestService,
} from '../application/folder-manifest.service.ts';
import type { StableFileEvent } from '../application/stable-file-detector.ts';

export interface FolderWatcher {
  onEvent(listener: (event: StableFileEvent) => void): () => void;
  start(): void;
  dispose(): void;
}

interface WatcherConfiguration {
  readonly bindingId: string;
  readonly canonicalPath: string;
  readonly manifest: FolderManifestRevision;
}

export interface FolderWatcherLifecycleInput {
  readonly folders: FolderManifestService;
  readonly assertInsideBinding: (bindingRoot: string, candidatePath: string) => boolean;
  readonly createWatcher: (input: {
    readonly bindingRoot: string;
    readonly assertInsideBinding: (candidatePath: string) => boolean;
  }) => FolderWatcher;
  readonly createIntake: (
    input: WatcherConfiguration,
  ) => Pick<FolderIntakeService, 'admitStableFile'>;
  readonly nowMs: () => number;
}

export class FolderWatcherLifecycle {
  readonly #folders: FolderManifestService;
  readonly #assertInsideBinding: FolderWatcherLifecycleInput['assertInsideBinding'];
  readonly #createWatcher: FolderWatcherLifecycleInput['createWatcher'];
  readonly #createIntake: FolderWatcherLifecycleInput['createIntake'];
  readonly #nowMs: () => number;
  readonly #watchers = new Map<string, { watcher: FolderWatcher; unsubscribe: () => void }>();

  constructor(input: FolderWatcherLifecycleInput) {
    this.#folders = input.folders;
    this.#assertInsideBinding = input.assertInsideBinding;
    this.#createWatcher = input.createWatcher;
    this.#createIntake = input.createIntake;
    this.#nowMs = input.nowMs;
  }

  attach(bindingId: string): void {
    if (this.#watchers.has(bindingId)) return;
    const configuration = this.#folders.watcherConfiguration(bindingId);
    if (configuration === null) return;

    const watcher = this.#createWatcher({
      bindingRoot: configuration.canonicalPath,
      assertInsideBinding: (candidatePath) =>
        this.#assertInsideBinding(configuration.canonicalPath, candidatePath),
    });
    const intake = this.#createIntake(configuration);
    const unsubscribe = watcher.onEvent((event) => {
      void intake.admitStableFile({
        path: event.path,
        size: event.size,
        mtimeMs: event.mtimeMs,
        nowMs: this.#nowMs(),
      });
    });
    this.#watchers.set(bindingId, { watcher, unsubscribe });
    try {
      watcher.start();
    } catch (error) {
      this.detach(bindingId);
      throw error;
    }
  }

  detach(bindingId: string): void {
    const active = this.#watchers.get(bindingId);
    if (active === undefined) return;
    this.#watchers.delete(bindingId);
    active.unsubscribe();
    active.watcher.dispose();
  }

  dispose(): void {
    for (const bindingId of this.#watchers.keys()) this.detach(bindingId);
  }

  /** Re-check active watchers; revocation/expiry/wrong-scope detaches immediately. */
  reconcile(): void {
    for (const bindingId of [...this.#watchers.keys()]) {
      if (this.#folders.watcherConfiguration(bindingId) === null) this.detach(bindingId);
    }
  }
}

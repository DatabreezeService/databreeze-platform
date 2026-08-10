import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type {
  StableFileEvent,
  StableFileEventKind,
} from '../../application/stable-file-detector.ts';

export interface NativeFolderWatchEvent {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly kind: StableFileEventKind;
  readonly previousPath?: string;
}

export interface WindowsFolderWatcherAdapterInput {
  readonly bindingRoot: string;
  readonly assertInsideBinding: (candidatePath: string) => boolean;
  readonly watch?: (
    filename: string,
    listener: (eventType: 'rename' | 'change', relativePath: string | null) => void,
  ) => { close(): void };
  readonly stat?: (
    candidatePath: string,
  ) => Promise<{ readonly isFile: () => boolean; readonly size: number; readonly mtimeMs: number }>;
}

/**
 * Main-process adapter that normalizes native watcher events into typed
 * StableFileEvent values and drops anything outside the approved root.
 */
export class WindowsFolderWatcherAdapter {
  readonly #bindingRoot: string;
  readonly #assertInsideBinding: (candidatePath: string) => boolean;
  readonly #watch: NonNullable<WindowsFolderWatcherAdapterInput['watch']>;
  readonly #stat: NonNullable<WindowsFolderWatcherAdapterInput['stat']>;
  readonly #listeners = new Set<(event: StableFileEvent) => void>();
  #nativeWatcher: { close(): void } | undefined;

  constructor(input: WindowsFolderWatcherAdapterInput) {
    this.#bindingRoot = input.bindingRoot;
    this.#assertInsideBinding = input.assertInsideBinding;
    this.#watch =
      input.watch ??
      ((root, listener) =>
        fs.watch(root, { recursive: true }, (eventType, relativePath) => {
          listener(eventType === 'rename' ? 'rename' : 'change', relativePath?.toString() ?? null);
        }));
    this.#stat = input.stat ?? ((candidatePath) => fsp.stat(candidatePath));
  }

  bindingRoot(): string {
    return this.#bindingRoot;
  }

  onEvent(listener: (event: StableFileEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  start(): void {
    if (this.#nativeWatcher !== undefined) return;
    this.#nativeWatcher = this.#watch(this.#bindingRoot, (eventType, relativePath) => {
      if (relativePath === null || relativePath.trim() === '') return;
      void this.#ingestNativePath(eventType, path.resolve(this.#bindingRoot, relativePath));
    });
  }

  dispose(): void {
    this.#nativeWatcher?.close();
    this.#nativeWatcher = undefined;
    this.#listeners.clear();
  }

  ingestNativeEvent(native: NativeFolderWatchEvent): StableFileEvent | null {
    if (!this.#assertInsideBinding(native.path)) return null;
    if (native.previousPath !== undefined && !this.#assertInsideBinding(native.previousPath)) {
      return null;
    }
    const event: StableFileEvent = Object.freeze({
      path: native.path,
      size: native.size,
      mtimeMs: native.mtimeMs,
      kind: native.kind,
      ...(native.previousPath === undefined ? {} : { previousPath: native.previousPath }),
    });
    for (const listener of this.#listeners) listener(event);
    return event;
  }

  async #ingestNativePath(eventType: 'rename' | 'change', candidatePath: string): Promise<void> {
    if (!this.#assertInsideBinding(candidatePath)) return;
    try {
      const metadata = await this.#stat(candidatePath);
      if (!metadata.isFile()) return;
      this.ingestNativeEvent({
        path: candidatePath,
        size: metadata.size,
        mtimeMs: metadata.mtimeMs,
        kind: eventType === 'rename' ? 'rename' : 'write',
      });
    } catch {
      // Deleted, inaccessible, and transient files are never admitted from a watcher event.
    }
  }
}

import type { StableFileEvent, StableFileEventKind } from '../../application/stable-file-detector.ts';

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
}

/**
 * Main-process adapter that normalizes native watcher events into typed
 * StableFileEvent values and drops anything outside the approved root.
 */
export class WindowsFolderWatcherAdapter {
  readonly #bindingRoot: string;
  readonly #assertInsideBinding: (candidatePath: string) => boolean;
  readonly #listeners = new Set<(event: StableFileEvent) => void>();

  constructor(input: WindowsFolderWatcherAdapterInput) {
    this.#bindingRoot = input.bindingRoot;
    this.#assertInsideBinding = input.assertInsideBinding;
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

  ingestNativeEvent(native: NativeFolderWatchEvent): StableFileEvent | null {
    if (!this.#assertInsideBinding(native.path)) return null;
    if (
      native.previousPath !== undefined &&
      !this.#assertInsideBinding(native.previousPath)
    ) {
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
}

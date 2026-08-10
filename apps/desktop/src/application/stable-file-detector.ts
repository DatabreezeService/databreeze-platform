export type StableFileEventKind = 'create' | 'write' | 'rename';

export interface StableFileEvent {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly kind: StableFileEventKind;
  readonly previousPath?: string;
  readonly contentFingerprint?: string;
}

export type StableFileObservation =
  | { readonly state: 'PENDING' }
  | {
      readonly state: 'STABLE';
      readonly path: string;
      readonly size: number;
      readonly mtimeMs: number;
    }
  | {
      readonly state: 'QUARANTINE';
      readonly reason: 'PARTIAL_OR_LOCK_FILE';
    }
  | {
      readonly state: 'EXPIRED';
      readonly path: string;
      readonly reason: 'DEBOUNCE_EXPIRED';
    }
  | {
      readonly state: 'DUPLICATE_CONTENT';
      readonly path: string;
      readonly contentFingerprint: string;
    };

interface PendingEntry {
  path: string;
  size: number;
  mtimeMs: number;
  lastChangedAtMs: number;
  firstSeenAtMs: number;
  contentFingerprint?: string;
}

export interface StableFileDetectorInput {
  readonly debounceMs: number;
  readonly nowMs: () => number;
  readonly maxPendingMs?: number;
}

function isPartialOrLock(filePath: string): boolean {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
  return (
    base.startsWith('~$') ||
    base.endsWith('.partial') ||
    base.endsWith('.tmp') ||
    base.endsWith('.lock') ||
    base.endsWith('.crdownload')
  );
}

export class StableFileDetector {
  readonly #debounceMs: number;
  readonly #maxPendingMs: number;
  readonly #pending = new Map<string, PendingEntry>();
  readonly #contentIndex = new Map<string, string>();

  constructor(input: StableFileDetectorInput) {
    this.#debounceMs = input.debounceMs;
    this.#maxPendingMs = input.maxPendingMs ?? input.debounceMs * 10;
  }

  observe(event: StableFileEvent, nowMs: number): StableFileObservation {
    if (isPartialOrLock(event.path)) {
      return { state: 'QUARANTINE', reason: 'PARTIAL_OR_LOCK_FILE' };
    }

    const existing = this.#pending.get(event.path);
    if (existing === undefined) {
      const pending: PendingEntry = {
        path: event.path,
        size: event.size,
        mtimeMs: event.mtimeMs,
        lastChangedAtMs: nowMs,
        firstSeenAtMs: nowMs,
      };
      if (event.contentFingerprint !== undefined) {
        pending.contentFingerprint = event.contentFingerprint;
      }
      this.#pending.set(event.path, pending);
      return { state: 'PENDING' };
    }

    const changed = existing.size !== event.size || existing.mtimeMs !== event.mtimeMs;
    existing.size = event.size;
    existing.mtimeMs = event.mtimeMs;
    if (event.contentFingerprint !== undefined) {
      existing.contentFingerprint = event.contentFingerprint;
    }
    if (changed) {
      existing.lastChangedAtMs = nowMs;
      return { state: 'PENDING' };
    }

    if (nowMs - existing.lastChangedAtMs < this.#debounceMs) {
      return { state: 'PENDING' };
    }

    this.#pending.delete(event.path);
    if (
      existing.contentFingerprint !== undefined &&
      this.#contentIndex.has(existing.contentFingerprint)
    ) {
      return {
        state: 'DUPLICATE_CONTENT',
        path: event.path,
        contentFingerprint: existing.contentFingerprint,
      };
    }

    return {
      state: 'STABLE',
      path: event.path,
      size: event.size,
      mtimeMs: event.mtimeMs,
    };
  }

  tick(nowMs: number): Array<Extract<StableFileObservation, { state: 'EXPIRED' }>> {
    const expired: Array<Extract<StableFileObservation, { state: 'EXPIRED' }>> = [];
    for (const [path, entry] of this.#pending) {
      if (nowMs - entry.firstSeenAtMs >= this.#maxPendingMs) {
        this.#pending.delete(path);
        expired.push({ state: 'EXPIRED', path, reason: 'DEBOUNCE_EXPIRED' });
      }
    }
    return expired;
  }

  rememberContent(contentFingerprint: string, path: string): void {
    this.#contentIndex.set(contentFingerprint, path);
  }

  restartWatcher(): void {
    this.#pending.clear();
  }
}

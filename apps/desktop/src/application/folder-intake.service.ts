import { createHash, randomBytes } from 'node:crypto';
import type { FolderManifestRevision } from './folder-manifest.service.ts';
import { StableFileDetector } from './stable-file-detector.ts';
import type {
  FolderFileProfile,
  FolderIntakeDecisionV1,
  FolderReviewQueueItemV1,
} from '../shared/folder-intake-contract-v1.ts';

export type FolderFingerprintResult =
  | {
      readonly accepted: true;
      readonly contentFingerprint: string;
      readonly schemaFingerprint: string;
      readonly profile: FolderFileProfile;
      readonly periodKey?: string;
      readonly duplicateKey?: string;
    }
  | {
      readonly rejected:
        | 'PATH_ESCAPE'
        | 'UNSUPPORTED_PROFILE'
        | 'MALFORMED_CONTENT'
        | 'AMBIGUOUS_MAPPING';
    };

export interface FolderIntakeServiceInput {
  readonly detector: StableFileDetector;
  readonly bindingRoot: string;
  readonly bindingId?: string;
  readonly manifest: FolderManifestRevision;
  readonly assertInsideBinding: (candidatePath: string) => boolean;
  readonly readFingerprint: (path: string) => Promise<FolderFingerprintResult>;
  readonly mutateSource?: (path: string, action: 'rename' | 'move' | 'delete') => Promise<void>;
}

function newEventId(): string {
  return `evt_${createHash('sha256').update(randomBytes(16)).digest('hex').slice(0, 24)}`;
}

function profileFromPath(filePath: string): FolderFileProfile | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.csv')) return 'CSV';
  if (lower.endsWith('.xlsx')) return 'XLSX';
  return null;
}

export class FolderIntakeService {
  readonly #detector: StableFileDetector;
  readonly #bindingRoot: string;
  readonly #bindingId: string;
  readonly #manifest: FolderManifestRevision;
  readonly #assertInsideBinding: (candidatePath: string) => boolean;
  readonly #readFingerprint: (path: string) => Promise<FolderFingerprintResult>;
  readonly #eventLedger = new Set<string>();
  readonly #periodLedger = new Set<string>();
  readonly #duplicateKeyLedger = new Set<string>();
  readonly #reviewQueue: FolderReviewQueueItemV1[] = [];

  constructor(input: FolderIntakeServiceInput) {
    this.#detector = input.detector;
    this.#bindingRoot = input.bindingRoot;
    this.#bindingId = input.bindingId ?? '01HHHHHHHHHHHHHHHHHHHHHHHH';
    this.#manifest = input.manifest;
    this.#assertInsideBinding = input.assertInsideBinding;
    this.#readFingerprint = input.readFingerprint;
    // V1 intentionally ignores mutateSource; originals stay untouched.
    void input.mutateSource;
  }

  async admitStableFile(input: {
    readonly path: string;
    readonly size: number;
    readonly mtimeMs: number;
    readonly nowMs: number;
  }): Promise<FolderIntakeDecisionV1> {
    if (!this.#assertInsideBinding(input.path)) {
      return this.#quarantine(input.path, 'PATH_ESCAPE');
    }

    const profileHint = profileFromPath(input.path);
    if (
      profileHint === null ||
      !this.#manifest.supportedProfiles.includes(profileHint)
    ) {
      return this.#quarantine(input.path, 'UNSUPPORTED_PROFILE');
    }

    const eventKey = `${input.path}|${input.size}|${input.mtimeMs}`;
    if (this.#eventLedger.has(eventKey)) {
      return { disposition: 'DUPLICATE_EVENT', path: input.path };
    }

    const fingerprint = await this.#readFingerprint(input.path);
    if ('rejected' in fingerprint) {
      return this.#quarantine(input.path, fingerprint.rejected);
    }

    if (!this.#manifest.schemaFingerprints.includes(fingerprint.schemaFingerprint)) {
      return this.#quarantine(input.path, 'SCHEMA_DRIFT');
    }

    if (fingerprint.periodKey !== undefined && this.#periodLedger.has(fingerprint.periodKey)) {
      return this.#quarantine(input.path, 'PERIOD_OVERLAP');
    }

    if (
      fingerprint.duplicateKey !== undefined &&
      this.#duplicateKeyLedger.has(fingerprint.duplicateKey)
    ) {
      return this.#quarantine(input.path, 'DUPLICATE_KEY');
    }

    const observation = this.#detector.observe(
      {
        path: input.path,
        size: input.size,
        mtimeMs: input.mtimeMs,
        kind: 'write',
        contentFingerprint: fingerprint.contentFingerprint,
      },
      input.nowMs,
    );

    if (observation.state === 'PENDING') {
      // Force stability when caller already waited; second observe with same stamp.
      const stable = this.#detector.observe(
        {
          path: input.path,
          size: input.size,
          mtimeMs: input.mtimeMs,
          kind: 'write',
          contentFingerprint: fingerprint.contentFingerprint,
        },
        input.nowMs + this.#manifest.stabilityDebounceMs,
      );
      if (stable.state === 'DUPLICATE_CONTENT') {
        return this.#quarantine(input.path, 'DUPLICATE_KEY');
      }
      if (stable.state !== 'STABLE') {
        return { disposition: 'PENDING', path: input.path };
      }
    } else if (observation.state === 'DUPLICATE_CONTENT') {
      return this.#quarantine(input.path, 'DUPLICATE_KEY');
    } else if (observation.state === 'QUARANTINE') {
      return this.#quarantine(input.path, observation.reason);
    } else if (observation.state !== 'STABLE') {
      return { disposition: 'PENDING', path: input.path };
    }

    this.#eventLedger.add(eventKey);
    this.#detector.rememberContent(fingerprint.contentFingerprint, input.path);
    if (fingerprint.periodKey !== undefined) this.#periodLedger.add(fingerprint.periodKey);
    if (fingerprint.duplicateKey !== undefined) {
      this.#duplicateKeyLedger.add(fingerprint.duplicateKey);
    }

    return {
      disposition: 'ADMITTED',
      path: input.path,
      profile: fingerprint.profile,
      contentFingerprint: fingerprint.contentFingerprint,
      eventId: newEventId(),
    };
  }

  reviewQueue(): readonly FolderReviewQueueItemV1[] {
    return this.#reviewQueue;
  }

  bindingRoot(): string {
    return this.#bindingRoot;
  }

  #quarantine(
    path: string,
    reason: Exclude<FolderIntakeDecisionV1['reason'], undefined>,
  ): FolderIntakeDecisionV1 {
    const eventId = newEventId();
    this.#reviewQueue.push({
      eventId,
      bindingId: this.#bindingId,
      reason,
      profileHint: profileFromPath(path) ?? 'UNKNOWN',
      observedAtMs: Date.now(),
    });
    return { disposition: 'QUARANTINE', reason, path, eventId };
  }
}

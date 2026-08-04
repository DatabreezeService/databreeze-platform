import { createHash } from 'node:crypto';

// This adapter buffers the file before hashing; keep the bound below a
// practical single-buffer limit instead of advertising an unsafe 10 GiB read.
const MAX_FILE_BYTES = 512 * 1024 * 1024;
const NANOSECOND_TIMESTAMP = /^\d{1,32}$/u;

export type StableFileCode =
  | 'FILE_CHANGED_DURING_READ'
  | 'FILE_STILL_IN_USE'
  | 'INVALID_OBSERVATION'
  | 'NOT_REGULAR_FILE'
  | 'PATH_REPARSE_POINT'
  | 'RESOURCE_LIMIT';

export class StableFileError extends Error {
  readonly code: StableFileCode;

  constructor(code: StableFileCode) {
    super(code);
    this.name = 'StableFileError';
    this.code = code;
  }
}

export interface StableFileStat {
  readonly isFile: boolean;
  readonly isSymbolicLink: boolean;
  readonly sizeBytes: number;
  /** JSON-safe decimal epoch nanoseconds; never coerce a bigint to Number. */
  readonly modifiedAtNs: string;
}

export interface StableFileOptions {
  readonly maxAttempts?: number;
  readonly intervalMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface LocalFileObservation {
  readonly observationId: string;
  readonly displayName: string;
  readonly sizeBytes: number;
  readonly modifiedAtNs: string;
  readonly contentSha256: string;
  readonly stableExecutionKey: string;
}

interface CaptureStableObservationInput extends StableFileOptions {
  readonly observationId: string;
  readonly displayName: string;
  readonly readStat: () => Promise<StableFileStat>;
  readonly readBytes: () => Promise<Uint8Array>;
}

function reject(code: StableFileCode): never {
  throw new StableFileError(code);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validateStat(stat: StableFileStat): StableFileStat {
  if (
    typeof stat !== 'object' ||
    stat === null ||
    typeof stat.isFile !== 'boolean' ||
    typeof stat.isSymbolicLink !== 'boolean' ||
    !Number.isSafeInteger(stat.sizeBytes) ||
    stat.sizeBytes < 0 ||
    stat.sizeBytes > MAX_FILE_BYTES ||
    typeof stat.modifiedAtNs !== 'string' ||
    !NANOSECOND_TIMESTAMP.test(stat.modifiedAtNs)
  ) {
    return reject('INVALID_OBSERVATION');
  }
  if (stat.isSymbolicLink) return reject('PATH_REPARSE_POINT');
  if (!stat.isFile) return reject('NOT_REGULAR_FILE');
  return stat;
}

function sameStat(first: StableFileStat, second: StableFileStat): boolean {
  return (
    first.isFile === second.isFile &&
    first.isSymbolicLink === second.isSymbolicLink &&
    first.sizeBytes === second.sizeBytes &&
    first.modifiedAtNs === second.modifiedAtNs
  );
}

export async function waitForStableFile(
  readStat: () => Promise<StableFileStat>,
  { maxAttempts = 5, intervalMs = 250, sleep = defaultSleep }: StableFileOptions = {},
): Promise<StableFileStat> {
  if (
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 2 ||
    maxAttempts > 20 ||
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 0 ||
    intervalMs > 5_000
  ) {
    return reject('RESOURCE_LIMIT');
  }

  let previous: StableFileStat | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let current: StableFileStat;
    try {
      current = validateStat(await readStat());
    } catch (error) {
      if (error instanceof StableFileError && error.code !== 'FILE_STILL_IN_USE') throw error;
      if (attempt === maxAttempts - 1) return reject('FILE_STILL_IN_USE');
      await sleep(intervalMs);
      continue;
    }
    if (previous !== undefined && sameStat(previous, current)) return current;
    previous = current;
    if (attempt < maxAttempts - 1) await sleep(intervalMs);
  }
  return reject('FILE_STILL_IN_USE');
}

function isByteArray(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]'
  );
}

export function fingerprintBytes(bytes: Uint8Array): string {
  if (!isByteArray(bytes)) return reject('INVALID_OBSERVATION');
  return createHash('sha256').update(bytes).digest('hex');
}

function stableExecutionKey(observation: Omit<LocalFileObservation, 'stableExecutionKey'>): string {
  const canonical = JSON.stringify({
    contentSha256: observation.contentSha256,
    displayName: observation.displayName,
    modifiedAtNs: observation.modifiedAtNs,
    observationId: observation.observationId,
    sizeBytes: observation.sizeBytes,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function validateDisplayName(displayName: string): string {
  if (
    typeof displayName !== 'string' ||
    displayName.length === 0 ||
    displayName.length > 255 ||
    displayName === '.' ||
    displayName === '..' ||
    displayName.includes('/') ||
    displayName.includes('\\') ||
    [...displayName].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    return reject('INVALID_OBSERVATION');
  }
  return displayName;
}

function validateObservationId(observationId: string): string {
  if (
    typeof observationId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(observationId)
  ) {
    return reject('INVALID_OBSERVATION');
  }
  return observationId;
}

export async function captureStableObservation({
  observationId,
  displayName,
  readStat,
  readBytes,
  maxAttempts,
  intervalMs,
  sleep,
}: CaptureStableObservationInput): Promise<LocalFileObservation> {
  const options: StableFileOptions = {
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
    ...(intervalMs === undefined ? {} : { intervalMs }),
    ...(sleep === undefined ? {} : { sleep }),
  };
  const first = await waitForStableFile(readStat, options);
  let bytes: Uint8Array;
  try {
    bytes = await readBytes();
  } catch {
    return reject('FILE_STILL_IN_USE');
  }
  if (!isByteArray(bytes) || bytes.byteLength !== first.sizeBytes) {
    return reject('FILE_CHANGED_DURING_READ');
  }
  let after: StableFileStat;
  try {
    after = validateStat(await readStat());
  } catch {
    return reject('FILE_CHANGED_DURING_READ');
  }
  if (!sameStat(first, after)) return reject('FILE_CHANGED_DURING_READ');
  const observation: Omit<LocalFileObservation, 'stableExecutionKey'> = {
    observationId: validateObservationId(observationId),
    displayName: validateDisplayName(displayName),
    sizeBytes: first.sizeBytes,
    modifiedAtNs: first.modifiedAtNs,
    contentSha256: fingerprintBytes(bytes),
  };
  return Object.freeze({ ...observation, stableExecutionKey: stableExecutionKey(observation) });
}

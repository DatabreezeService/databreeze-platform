export type FolderIntakeDisposition = 'ADMITTED' | 'QUARANTINE' | 'DUPLICATE_EVENT' | 'PENDING';

export type FolderIntakeReason =
  | 'PATH_ESCAPE'
  | 'UNSUPPORTED_PROFILE'
  | 'SCHEMA_DRIFT'
  | 'PERIOD_OVERLAP'
  | 'DUPLICATE_KEY'
  | 'AMBIGUOUS_MAPPING'
  | 'MALFORMED_CONTENT'
  | 'PARTIAL_OR_LOCK_FILE'
  | 'MACRO_ENABLED'
  | 'EXTERNAL_LINK'
  | 'PROTECTED_CONTENT';

export type FolderFileProfile = 'CSV' | 'XLSX';

export interface FolderIntakeDecisionV1 {
  readonly disposition: FolderIntakeDisposition;
  readonly reason?: FolderIntakeReason;
  readonly path?: string;
  readonly profile?: FolderFileProfile;
  readonly contentFingerprint?: string;
  readonly eventId?: string;
}

export interface FolderReviewQueueItemV1 {
  readonly eventId: string;
  readonly bindingId: string;
  readonly reason: FolderIntakeReason;
  readonly profileHint: string;
  readonly observedAtMs: number;
}

const SAFE_RESULT_MAX_BYTES = 64 * 1024;
const EVENT_ID_PATTERN = /^evt_[0-9a-f]{24}$/;
const BINDING_ID_PATTERN = /^01[0-9A-HJKMNP-TV-Z]{24}$/;
const PROFILE_HINT_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
const INTAKE_REASONS = [
  'PATH_ESCAPE',
  'UNSUPPORTED_PROFILE',
  'SCHEMA_DRIFT',
  'PERIOD_OVERLAP',
  'DUPLICATE_KEY',
  'AMBIGUOUS_MAPPING',
  'MALFORMED_CONTENT',
  'PARTIAL_OR_LOCK_FILE',
  'MACRO_ENABLED',
  'EXTERNAL_LINK',
  'PROTECTED_CONTENT',
] as const satisfies readonly FolderIntakeReason[];

function exactDataRecord<Key extends string>(
  value: unknown,
  keys: readonly Key[],
): Record<Key, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('FOLDER_RESULT_REJECTED');
  let prototype: object | null;
  let ownKeys: (string | symbol)[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    ownKeys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new Error('FOLDER_RESULT_REJECTED');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('FOLDER_RESULT_REJECTED');
  }
  if (ownKeys.some((key) => typeof key !== 'string')) throw new Error('FOLDER_RESULT_REJECTED');
  const actualKeys = ownKeys as string[];
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key) => !(keys as readonly string[]).includes(key)) ||
    keys.some((key) => !actualKeys.includes(key))
  ) {
    throw new Error('FOLDER_RESULT_REJECTED');
  }
  const record = {} as Record<Key, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new Error('FOLDER_RESULT_REJECTED');
    }
    record[key] = descriptor.value as unknown;
  }
  return record;
}

function withinResultBudget(value: unknown): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > SAFE_RESULT_MAX_BYTES) {
    throw new Error('FOLDER_RESULT_REJECTED');
  }
}

/** Path-free quarantine queue for renderer IPC [DDA-037]. */
export function parseFolderReviewQueue(value: unknown): readonly FolderReviewQueueItemV1[] {
  if (!Array.isArray(value) || value.length > 256) throw new Error('FOLDER_RESULT_REJECTED');
  const items = value.map((entry) => {
    const record = exactDataRecord(entry, [
      'eventId',
      'bindingId',
      'reason',
      'profileHint',
      'observedAtMs',
    ]);
    if (typeof record.eventId !== 'string' || !EVENT_ID_PATTERN.test(record.eventId)) {
      throw new Error('FOLDER_RESULT_REJECTED');
    }
    if (typeof record.bindingId !== 'string' || !BINDING_ID_PATTERN.test(record.bindingId)) {
      throw new Error('FOLDER_RESULT_REJECTED');
    }
    if (
      typeof record.reason !== 'string' ||
      !(INTAKE_REASONS as readonly string[]).includes(record.reason)
    ) {
      throw new Error('FOLDER_RESULT_REJECTED');
    }
    if (typeof record.profileHint !== 'string' || !PROFILE_HINT_PATTERN.test(record.profileHint)) {
      throw new Error('FOLDER_RESULT_REJECTED');
    }
    if (
      typeof record.observedAtMs !== 'number' ||
      !Number.isSafeInteger(record.observedAtMs) ||
      record.observedAtMs < 0
    ) {
      throw new Error('FOLDER_RESULT_REJECTED');
    }
    return Object.freeze({
      eventId: record.eventId,
      bindingId: record.bindingId,
      reason: record.reason as FolderIntakeReason,
      profileHint: record.profileHint,
      observedAtMs: record.observedAtMs,
    });
  });
  const result = Object.freeze([...items]);
  withinResultBudget(result);
  return result;
}

import type { FolderReviewQueueItemV1 } from './folder-intake-contract-v1.ts';

export const FOLDER_IPC_CHANNELS = Object.freeze({
  select: 'desktop:v1:folder:select',
  create: 'desktop:v1:folder:create',
  readStatus: 'desktop:v1:folder:read-status',
  updateManifest: 'desktop:v1:folder:update-manifest',
  disable: 'desktop:v1:folder:disable',
  listReviewQueue: 'desktop:v1:folder:list-review-queue',
} as const);

export type FolderIpcChannel = (typeof FOLDER_IPC_CHANNELS)[keyof typeof FOLDER_IPC_CHANNELS];

export type FolderCapabilityState = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'WRONG_SCOPE';
export type FolderBindingLifecycle = 'ACTIVE' | 'DISABLED';
export type FolderVersionBehavior = 'APPEND' | 'REPLACE' | 'VERSION';
export type FolderPeriodOverlapPolicy = 'REJECT' | 'ALLOW_WITH_REVIEW' | 'REPLACE_PERIOD';
export type FolderProjectionClass =
  | 'METADATA_ONLY'
  | 'DASHBOARD_AGGREGATES'
  | 'SELECTED_ROWS_COLUMNS'
  | 'EVIDENCE_DERIVATIVES'
  | 'ORIGINAL_CONTENT';

export interface FolderPublicationProjectionV1 {
  readonly class: FolderProjectionClass;
  readonly fieldAllowlist: readonly string[];
}

export interface FolderManifestPolicyV1 {
  readonly purpose: string;
  readonly supportedProfiles: readonly string[];
  readonly schemaFingerprints: readonly string[];
  readonly groupingRules: readonly string[];
  readonly versionBehavior: FolderVersionBehavior;
  readonly periodOverlapPolicy: FolderPeriodOverlapPolicy;
  readonly duplicateKeyFields: readonly string[];
  readonly mappingPolicyId: string;
  readonly stabilityDebounceMs: number;
  readonly publicationProjection: FolderPublicationProjectionV1;
}

export interface FolderSelectResultV1 {
  readonly selectionToken: string;
}

export interface FolderCreateRequestV1 {
  readonly selectionToken: string;
  readonly capabilityGrantId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly displayName: string;
  readonly manifest: FolderManifestPolicyV1;
}

export interface FolderBindingIdRequestV1 {
  readonly bindingId: string;
}

export interface FolderManifestUpdateRequestV1 {
  readonly bindingId: string;
  readonly expectedVersion: number;
  readonly manifest: FolderManifestPolicyV1;
}

export interface FolderBindingSafeStatusV1 {
  readonly bindingId: string;
  readonly capabilityGrantId: string;
  readonly capabilityState: FolderCapabilityState;
  readonly lifecycle: FolderBindingLifecycle;
  readonly manifestVersion: number;
  readonly purpose: string;
  readonly supportedProfiles: readonly string[];
}

export interface FolderBridgeV1 {
  readonly select: () => Promise<FolderSelectResultV1>;
  readonly create: (request: FolderCreateRequestV1) => Promise<FolderBindingSafeStatusV1>;
  readonly readStatus: (request: FolderBindingIdRequestV1) => Promise<FolderBindingSafeStatusV1>;
  readonly updateManifest: (
    request: FolderManifestUpdateRequestV1,
  ) => Promise<FolderBindingSafeStatusV1>;
  readonly disable: (request: FolderBindingIdRequestV1) => Promise<FolderBindingSafeStatusV1>;
  readonly listReviewQueue: () => Promise<readonly FolderReviewQueueItemV1[]>;
}

const SAFE_RESULT_MAX_BYTES = 64 * 1024;
const ID_PATTERN = /^01[0-9A-HJKMNP-TV-Z]{24}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PURPOSE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PROFILE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
const TOKEN_PATTERN = /^sel_[A-Za-z0-9_-]{1,128}$/;
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,63}$/u;

function exactDataRecord<Key extends string>(
  value: unknown,
  keys: readonly Key[],
): Record<Key, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('FOLDER_REQUEST_REJECTED');
  let prototype: object | null;
  let ownKeys: (string | symbol)[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    ownKeys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new Error('FOLDER_REQUEST_REJECTED');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('FOLDER_REQUEST_REJECTED');
  }
  if (ownKeys.some((key) => typeof key !== 'string')) throw new Error('FOLDER_REQUEST_REJECTED');
  const actualKeys = ownKeys as string[];
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key) => !(keys as readonly string[]).includes(key)) ||
    keys.some((key) => !actualKeys.includes(key))
  ) {
    throw new Error('FOLDER_REQUEST_REJECTED');
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
      throw new Error('FOLDER_REQUEST_REJECTED');
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

function parseIdentifier(value: unknown, errorCode = 'FOLDER_REQUEST_REJECTED'): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error(errorCode);
  return value;
}

function parseStringArray(
  value: unknown,
  itemPattern: RegExp,
  min: number,
  max: number,
  errorCode: string,
): readonly string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(errorCode);
  }
  const items = value.map((item) => {
    if (typeof item !== 'string' || !itemPattern.test(item)) throw new Error(errorCode);
    return item;
  });
  return Object.freeze([...items]);
}

function parseEnum<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  errorCode: string,
): Value {
  if (typeof value !== 'string' || !allowed.includes(value as Value)) throw new Error(errorCode);
  return value as Value;
}

export function parseFolderManifestPolicy(value: unknown): FolderManifestPolicyV1 {
  if (typeof value !== 'object' || value === null) throw new Error('FOLDER_MANIFEST_INCOMPLETE');
  const requiredKeys = [
    'purpose',
    'supportedProfiles',
    'schemaFingerprints',
    'groupingRules',
    'versionBehavior',
    'periodOverlapPolicy',
    'duplicateKeyFields',
    'mappingPolicyId',
    'stabilityDebounceMs',
    'publicationProjection',
  ] as const;
  let record: Record<(typeof requiredKeys)[number], unknown>;
  try {
    record = exactDataRecord(value, requiredKeys);
  } catch {
    throw new Error('FOLDER_MANIFEST_INCOMPLETE');
  }

  if (typeof record.purpose !== 'string' || !PURPOSE_PATTERN.test(record.purpose)) {
    throw new Error('FOLDER_MANIFEST_INCOMPLETE');
  }
  const supportedProfiles = parseStringArray(
    record.supportedProfiles,
    PROFILE_PATTERN,
    1,
    16,
    'FOLDER_MANIFEST_INCOMPLETE',
  );
  const schemaFingerprints = parseStringArray(
    record.schemaFingerprints,
    HASH_PATTERN,
    1,
    32,
    'FOLDER_MANIFEST_INCOMPLETE',
  );
  const groupingRules = parseStringArray(
    record.groupingRules,
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
    1,
    16,
    'FOLDER_MANIFEST_INCOMPLETE',
  );
  const versionBehavior = parseEnum(
    record.versionBehavior,
    ['APPEND', 'REPLACE', 'VERSION'] as const,
    'FOLDER_MANIFEST_INCOMPLETE',
  );
  const periodOverlapPolicy = parseEnum(
    record.periodOverlapPolicy,
    ['REJECT', 'ALLOW_WITH_REVIEW', 'REPLACE_PERIOD'] as const,
    'FOLDER_MANIFEST_INCOMPLETE',
  );
  const duplicateKeyFields = parseStringArray(
    record.duplicateKeyFields,
    /^[A-Za-z0-9_]{1,64}$/,
    1,
    16,
    'FOLDER_MANIFEST_INCOMPLETE',
  );
  const mappingPolicyId = parseIdentifier(record.mappingPolicyId, 'FOLDER_MANIFEST_INCOMPLETE');
  if (
    typeof record.stabilityDebounceMs !== 'number' ||
    !Number.isSafeInteger(record.stabilityDebounceMs) ||
    record.stabilityDebounceMs < 250 ||
    record.stabilityDebounceMs > 60_000
  ) {
    throw new Error('FOLDER_MANIFEST_INCOMPLETE');
  }
  const projectionRecord = exactDataRecord(record.publicationProjection, [
    'class',
    'fieldAllowlist',
  ]);
  const projectionClass = parseEnum(
    projectionRecord.class,
    [
      'METADATA_ONLY',
      'DASHBOARD_AGGREGATES',
      'SELECTED_ROWS_COLUMNS',
      'EVIDENCE_DERIVATIVES',
      'ORIGINAL_CONTENT',
    ] as const,
    'FOLDER_MANIFEST_INCOMPLETE',
  );
  const fieldAllowlist = parseStringArray(
    projectionRecord.fieldAllowlist,
    /^[A-Za-z0-9_]{1,64}$/,
    0,
    64,
    'FOLDER_MANIFEST_INCOMPLETE',
  );

  return Object.freeze({
    purpose: record.purpose,
    supportedProfiles,
    schemaFingerprints,
    groupingRules,
    versionBehavior,
    periodOverlapPolicy,
    duplicateKeyFields,
    mappingPolicyId,
    stabilityDebounceMs: record.stabilityDebounceMs,
    publicationProjection: Object.freeze({
      class: projectionClass,
      fieldAllowlist,
    }),
  });
}

export function parseFolderSelectResult(value: unknown): FolderSelectResultV1 {
  const record = exactDataRecord(value, ['selectionToken']);
  if (typeof record.selectionToken !== 'string' || !TOKEN_PATTERN.test(record.selectionToken)) {
    throw new Error('FOLDER_RESULT_REJECTED');
  }
  const result = Object.freeze({ selectionToken: record.selectionToken });
  withinResultBudget(result);
  return result;
}

export function parseFolderCreateRequest(value: unknown): FolderCreateRequestV1 {
  const record = exactDataRecord(value, [
    'selectionToken',
    'capabilityGrantId',
    'organizationId',
    'workspaceId',
    'displayName',
    'manifest',
  ]);
  if (typeof record.selectionToken !== 'string' || !TOKEN_PATTERN.test(record.selectionToken)) {
    throw new Error('FOLDER_REQUEST_REJECTED');
  }
  if (typeof record.displayName !== 'string' || !DISPLAY_NAME_PATTERN.test(record.displayName)) {
    throw new Error('FOLDER_REQUEST_REJECTED');
  }
  return Object.freeze({
    selectionToken: record.selectionToken,
    capabilityGrantId: parseIdentifier(record.capabilityGrantId),
    organizationId: parseIdentifier(record.organizationId),
    workspaceId: parseIdentifier(record.workspaceId),
    displayName: record.displayName,
    manifest: parseFolderManifestPolicy(record.manifest),
  });
}

export function parseFolderBindingIdRequest(value: unknown): FolderBindingIdRequestV1 {
  const record = exactDataRecord(value, ['bindingId']);
  return Object.freeze({ bindingId: parseIdentifier(record.bindingId) });
}

export function parseFolderManifestUpdateRequest(value: unknown): FolderManifestUpdateRequestV1 {
  const record = exactDataRecord(value, ['bindingId', 'expectedVersion', 'manifest']);
  if (
    typeof record.expectedVersion !== 'number' ||
    !Number.isSafeInteger(record.expectedVersion) ||
    record.expectedVersion < 1
  ) {
    throw new Error('FOLDER_REQUEST_REJECTED');
  }
  return Object.freeze({
    bindingId: parseIdentifier(record.bindingId),
    expectedVersion: record.expectedVersion,
    manifest: parseFolderManifestPolicy(record.manifest),
  });
}

export function parseFolderBindingSafeStatus(value: unknown): FolderBindingSafeStatusV1 {
  const record = exactDataRecord(value, [
    'bindingId',
    'capabilityGrantId',
    'capabilityState',
    'lifecycle',
    'manifestVersion',
    'purpose',
    'supportedProfiles',
  ]);
  if (
    typeof record.manifestVersion !== 'number' ||
    !Number.isSafeInteger(record.manifestVersion) ||
    record.manifestVersion < 1
  ) {
    throw new Error('FOLDER_RESULT_REJECTED');
  }
  if (typeof record.purpose !== 'string' || !PURPOSE_PATTERN.test(record.purpose)) {
    throw new Error('FOLDER_RESULT_REJECTED');
  }
  const result = Object.freeze({
    bindingId: parseIdentifier(record.bindingId, 'FOLDER_RESULT_REJECTED'),
    capabilityGrantId: parseIdentifier(record.capabilityGrantId, 'FOLDER_RESULT_REJECTED'),
    capabilityState: parseEnum(
      record.capabilityState,
      ['ACTIVE', 'EXPIRED', 'REVOKED', 'WRONG_SCOPE'] as const,
      'FOLDER_RESULT_REJECTED',
    ),
    lifecycle: parseEnum(
      record.lifecycle,
      ['ACTIVE', 'DISABLED'] as const,
      'FOLDER_RESULT_REJECTED',
    ),
    manifestVersion: record.manifestVersion,
    purpose: record.purpose,
    supportedProfiles: parseStringArray(
      record.supportedProfiles,
      PROFILE_PATTERN,
      1,
      16,
      'FOLDER_RESULT_REJECTED',
    ),
  });
  withinResultBudget(result);
  return result;
}

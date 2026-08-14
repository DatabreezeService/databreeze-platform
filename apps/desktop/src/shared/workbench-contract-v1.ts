const SAFE_RESULT_MAX_BYTES = 64 * 1024;
const SAFE_LABEL_MAX = 128;
const SAFE_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const WORKBENCH_IPC_CHANNELS = Object.freeze({
  sessionRead: 'desktop:v1:workbench:session:read',
  catalogPage: 'desktop:v1:workbench:catalog:page',
  originalDescriptor: 'desktop:v1:workbench:original:read',
  folderReviewDecide: 'desktop:v1:workbench:folder-review:decide',
  agentTurn: 'desktop:v1:workbench:agent:turn',
  syncStatus: 'desktop:v1:workbench:sync:status',
  importSource: 'desktop:v1:workbench:import',
  signInPassword: 'desktop:v1:workbench:auth:password',
  verifyOtp: 'desktop:v1:workbench:auth:otp',
  startGoogleOidc: 'desktop:v1:workbench:auth:google-oidc',
} as const);

export type WorkbenchIpcChannel =
  (typeof WORKBENCH_IPC_CHANNELS)[keyof typeof WORKBENCH_IPC_CHANNELS];

export type WorkbenchActivity = 'dashboard' | 'analysis' | 'data' | 'reviews' | 'settings';
export type WorkbenchImportProfile = 'CSV' | 'XLSX' | 'IMAGE' | 'PDF';
export type WorkbenchDatasetHealth = 'READY' | 'ATTENTION' | 'BLOCKED';
export type WorkbenchReviewKind = 'OCR_REVIEW_REQUIRED' | 'SOURCE_MISMATCH' | 'PREPARATION_BLOCKED';

export interface WorkbenchSessionSnapshot {
  readonly signedIn: boolean;
  readonly accountLabel: string | null;
  readonly workspaceLabel: string | null;
}

export interface WorkbenchFolderRecord {
  readonly bindingId: string;
  readonly displayName: string;
  readonly pendingReviewCount: number;
}

export interface WorkbenchDatasetRecord {
  readonly datasetId: string;
  readonly displayName: string;
  readonly health: WorkbenchDatasetHealth;
}

export interface WorkbenchReviewRecord {
  readonly reviewId: string;
  readonly label: string;
  readonly kind: WorkbenchReviewKind;
}

export interface WorkbenchAnalysisRecord {
  readonly conversationId: string;
  readonly title: string;
}

export interface WorkbenchCatalogPage {
  readonly folders: readonly WorkbenchFolderRecord[];
  readonly datasets: readonly WorkbenchDatasetRecord[];
  readonly reviewItems: readonly WorkbenchReviewRecord[];
  readonly recentAnalyses: readonly WorkbenchAnalysisRecord[];
}

export interface WorkbenchOriginalDescriptor {
  readonly descriptorId: string;
  readonly label: string;
  readonly mediaKind: 'IMAGE' | 'PDF' | 'TABULAR';
}

export interface WorkbenchSyncStatus {
  readonly folderMonitoring: 'watching' | 'paused' | 'unavailable';
  readonly syncQueue: number;
  readonly engineHealth: 'ready' | 'starting' | 'failed' | 'not-installed';
  readonly pendingReviewCount: number;
}

export interface WorkbenchCatalogPageRequest {
  readonly cursor: string | null;
}

export interface WorkbenchBridgeV1 {
  readonly readSession: () => Promise<WorkbenchSessionSnapshot>;
  readonly listCatalogPage: (
    request?: WorkbenchCatalogPageRequest,
  ) => Promise<WorkbenchCatalogPage>;
  readonly readOriginalDescriptor: (request: {
    readonly descriptorId: string;
  }) => Promise<WorkbenchOriginalDescriptor>;
  readonly decideFolderReview: (request: {
    readonly reviewId: string;
    readonly decision: 'approve' | 'reject';
  }) => Promise<{ readonly accepted: true }>;
  readonly runAgentTurn: (request: {
    readonly message: string;
  }) => Promise<{ readonly accepted: true }>;
  readonly getSyncStatus: () => Promise<WorkbenchSyncStatus>;
  readonly importSource: (request: {
    readonly profile: WorkbenchImportProfile;
  }) => Promise<{ readonly accepted: true }>;
  readonly signInWithPassword: (request: {
    readonly email: string;
    readonly password: string;
  }) => Promise<WorkbenchSessionSnapshot>;
  readonly verifyOtp: (request: { readonly code: string }) => Promise<WorkbenchSessionSnapshot>;
  readonly startGoogleOidc: () => Promise<{ readonly accepted: true }>;
}

function exactDataRecord<Key extends string>(
  value: unknown,
  keys: readonly Key[],
): Record<Key, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('INVALID_RECORD');

  let prototype: object | null;
  let ownKeys: (string | symbol)[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    ownKeys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new Error('INVALID_RECORD');
  }
  if (prototype !== Object.prototype && prototype !== null) throw new Error('INVALID_RECORD');
  if (ownKeys.some((key) => typeof key !== 'string')) throw new Error('INVALID_RECORD');
  const actualKeys = ownKeys as string[];
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key) => !(keys as readonly string[]).includes(key)) ||
    keys.some((key) => !actualKeys.includes(key))
  ) {
    throw new Error('INVALID_RECORD');
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
      throw new Error('INVALID_RECORD');
    }
    record[key] = descriptor.value as unknown;
  }
  return record;
}

function withinResultBudget(value: unknown): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > SAFE_RESULT_MAX_BYTES) {
    throw new Error('RESULT_TOO_LARGE');
  }
}

function boundedLabel(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > SAFE_LABEL_MAX) {
    throw new Error('INVALID_LABEL');
  }
  if (/[\\/]|\.\./.test(value)) throw new Error('INVALID_LABEL');
  return value;
}

function boundedId(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value)) {
    throw new Error('INVALID_ID');
  }
  return value;
}

function primitiveEnum<Value extends string>(
  value: unknown,
  allowedValues: readonly Value[],
  errorCode: string,
): Value {
  if (typeof value !== 'string' || !allowedValues.includes(value as Value)) {
    throw new Error(errorCode);
  }
  return value as Value;
}

function boundedCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error('INVALID_COUNT');
  }
  return value;
}

function nullableLabel(value: unknown): string | null {
  if (value === null) return null;
  return boundedLabel(value);
}

export function parseWorkbenchSessionSnapshot(value: unknown): WorkbenchSessionSnapshot {
  const record = exactDataRecord(value, ['accountLabel', 'signedIn', 'workspaceLabel']);
  if (typeof record.signedIn !== 'boolean') throw new Error('INVALID_SESSION');
  const result: WorkbenchSessionSnapshot = Object.freeze({
    accountLabel: nullableLabel(record.accountLabel),
    signedIn: record.signedIn,
    workspaceLabel: nullableLabel(record.workspaceLabel),
  });
  withinResultBudget(result);
  return result;
}

function parseFolderRecord(value: unknown): WorkbenchFolderRecord {
  const record = exactDataRecord(value, ['bindingId', 'displayName', 'pendingReviewCount']);
  return Object.freeze({
    bindingId: boundedId(record.bindingId),
    displayName: boundedLabel(record.displayName),
    pendingReviewCount: boundedCount(record.pendingReviewCount),
  });
}

function parseDatasetRecord(value: unknown): WorkbenchDatasetRecord {
  const record = exactDataRecord(value, ['datasetId', 'displayName', 'health']);
  return Object.freeze({
    datasetId: boundedId(record.datasetId),
    displayName: boundedLabel(record.displayName),
    health: primitiveEnum(
      record.health,
      ['READY', 'ATTENTION', 'BLOCKED'] as const,
      'INVALID_HEALTH',
    ),
  });
}

function parseReviewRecord(value: unknown): WorkbenchReviewRecord {
  const record = exactDataRecord(value, ['kind', 'label', 'reviewId']);
  return Object.freeze({
    kind: primitiveEnum(
      record.kind,
      ['OCR_REVIEW_REQUIRED', 'SOURCE_MISMATCH', 'PREPARATION_BLOCKED'] as const,
      'INVALID_REVIEW_KIND',
    ),
    label: boundedLabel(record.label),
    reviewId: boundedId(record.reviewId),
  });
}

function parseAnalysisRecord(value: unknown): WorkbenchAnalysisRecord {
  const record = exactDataRecord(value, ['conversationId', 'title']);
  return Object.freeze({
    conversationId: boundedId(record.conversationId),
    title: boundedLabel(record.title),
  });
}

function parseArray<T>(value: unknown, parseItem: (item: unknown) => T, max = 100): readonly T[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('INVALID_ARRAY');
  return Object.freeze(value.map(parseItem));
}

export function parseWorkbenchCatalogPage(value: unknown): WorkbenchCatalogPage {
  const record = exactDataRecord(value, ['datasets', 'folders', 'recentAnalyses', 'reviewItems']);
  const result: WorkbenchCatalogPage = Object.freeze({
    datasets: parseArray(record.datasets, parseDatasetRecord),
    folders: parseArray(record.folders, parseFolderRecord),
    recentAnalyses: parseArray(record.recentAnalyses, parseAnalysisRecord),
    reviewItems: parseArray(record.reviewItems, parseReviewRecord),
  });
  withinResultBudget(result);
  return result;
}

export function parseWorkbenchCatalogPageRequest(value: unknown): WorkbenchCatalogPageRequest {
  if (value === undefined) return Object.freeze({ cursor: null });
  const record = exactDataRecord(value, ['cursor']);
  if (record.cursor !== null) {
    if (
      typeof record.cursor !== 'string' ||
      record.cursor.length === 0 ||
      record.cursor.length > 128
    ) {
      throw new Error('INVALID_CURSOR');
    }
  }
  return Object.freeze({ cursor: record.cursor });
}

export function parseWorkbenchOriginalDescriptor(value: unknown): WorkbenchOriginalDescriptor {
  const record = exactDataRecord(value, ['descriptorId', 'label', 'mediaKind']);
  const result: WorkbenchOriginalDescriptor = Object.freeze({
    descriptorId: boundedId(record.descriptorId),
    label: boundedLabel(record.label),
    mediaKind: primitiveEnum(
      record.mediaKind,
      ['IMAGE', 'PDF', 'TABULAR'] as const,
      'INVALID_MEDIA',
    ),
  });
  withinResultBudget(result);
  return result;
}

export function parseWorkbenchSyncStatus(value: unknown): WorkbenchSyncStatus {
  const record = exactDataRecord(value, [
    'engineHealth',
    'folderMonitoring',
    'pendingReviewCount',
    'syncQueue',
  ]);
  const result: WorkbenchSyncStatus = Object.freeze({
    engineHealth: primitiveEnum(
      record.engineHealth,
      ['ready', 'starting', 'failed', 'not-installed'] as const,
      'INVALID_ENGINE',
    ),
    folderMonitoring: primitiveEnum(
      record.folderMonitoring,
      ['watching', 'paused', 'unavailable'] as const,
      'INVALID_MONITORING',
    ),
    pendingReviewCount: boundedCount(record.pendingReviewCount),
    syncQueue: boundedCount(record.syncQueue),
  });
  withinResultBudget(result);
  return result;
}

export function parseWorkbenchImportRequest(value: unknown): {
  readonly profile: WorkbenchImportProfile;
} {
  const record = exactDataRecord(value, ['profile']);
  return Object.freeze({
    profile: primitiveEnum(
      record.profile,
      ['CSV', 'XLSX', 'IMAGE', 'PDF'] as const,
      'INVALID_PROFILE',
    ),
  });
}

export function parseWorkbenchAccepted(value: unknown): { readonly accepted: true } {
  const record = exactDataRecord(value, ['accepted']);
  if (record.accepted !== true) throw new Error('INVALID_ACCEPTED');
  return Object.freeze({ accepted: true as const });
}

export function parseWorkbenchPasswordSignInRequest(value: unknown): {
  readonly email: string;
  readonly password: string;
} {
  const record = exactDataRecord(value, ['email', 'password']);
  if (typeof record.email !== 'string' || record.email.length === 0 || record.email.length > 320) {
    throw new Error('INVALID_EMAIL');
  }
  if (
    typeof record.password !== 'string' ||
    record.password.length === 0 ||
    record.password.length > 256
  ) {
    throw new Error('INVALID_PASSWORD');
  }
  return Object.freeze({ email: record.email, password: record.password });
}

export function parseWorkbenchOtpRequest(value: unknown): { readonly code: string } {
  const record = exactDataRecord(value, ['code']);
  if (typeof record.code !== 'string' || !/^[0-9]{6}$/.test(record.code)) {
    throw new Error('INVALID_OTP');
  }
  return Object.freeze({ code: record.code });
}

export function parseWorkbenchAgentTurnRequest(value: unknown): { readonly message: string } {
  const record = exactDataRecord(value, ['message']);
  if (
    typeof record.message !== 'string' ||
    record.message.length === 0 ||
    record.message.length > 4000
  ) {
    throw new Error('INVALID_MESSAGE');
  }
  return Object.freeze({ message: record.message });
}

export function parseWorkbenchFolderReviewDecision(value: unknown): {
  readonly reviewId: string;
  readonly decision: 'approve' | 'reject';
} {
  const record = exactDataRecord(value, ['decision', 'reviewId']);
  return Object.freeze({
    decision: primitiveEnum(record.decision, ['approve', 'reject'] as const, 'INVALID_DECISION'),
    reviewId: boundedId(record.reviewId),
  });
}

export function parseWorkbenchOriginalRequest(value: unknown): { readonly descriptorId: string } {
  const record = exactDataRecord(value, ['descriptorId']);
  return Object.freeze({ descriptorId: boundedId(record.descriptorId) });
}

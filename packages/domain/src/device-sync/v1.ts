import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** DSO-001..DSO-025: device-bound synchronization and strict-Local handoff primitives. */
export const DEVICE_SYNC_SCHEMA_VERSION_V1 = 1 as const;
export const DEVICE_SYNC_MAX_DEPENDENCIES_V1 = 64;
export const DEVICE_SYNC_MAX_DIGEST_LENGTH_V1 = 128;
export const DEVICE_SYNC_MAX_BATCH_CHANGES_V1 = 256;
export const DEVICE_SYNC_MAX_PROTOCOL_LENGTH_V1 = 32;

export type SyncPayloadClassV1 =
  | 'CONTROL_METADATA'
  | 'APPROVED_DERIVED_RESULT'
  | 'RECONSTRUCTABLE_DERIVED_CONTENT';
export type SyncOperationKindV1 = 'UPSERT' | 'DELETE' | 'ACKNOWLEDGE';
export type SyncOperationStatusV1 =
  | 'QUEUED'
  | 'ACCEPTED'
  | 'APPLIED'
  | 'CONFLICT'
  | 'QUARANTINED'
  | 'REJECTED';
export type SyncConflictReasonV1 =
  | 'REVISION_MISMATCH'
  | 'POLICY_CHANGED'
  | 'DUPLICATE_EFFECT'
  | 'REVOKED_DEVICE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'PAYLOAD_NOT_ALLOWED';
export type SyncConflictStatusV1 = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export interface DeviceSyncOperationV1 {
  readonly schemaVersion: typeof DEVICE_SYNC_SCHEMA_VERSION_V1;
  readonly operationId: StableIdentifierV1;
  readonly deviceId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly entityType: string;
  readonly entityId: StableIdentifierV1;
  readonly kind: SyncOperationKindV1;
  readonly payloadClass: SyncPayloadClassV1;
  readonly payloadDigest: string;
  readonly encryptedPayload?: string;
  readonly dependencyIds: readonly StableIdentifierV1[];
  readonly baseRevision?: number;
  readonly status: SyncOperationStatusV1;
  readonly revision: number;
  readonly createdAt: StrictUtcTimestampV1;
  readonly acknowledgedAt?: StrictUtcTimestampV1;
}

export interface DeviceSyncConflictV1 {
  readonly schemaVersion: typeof DEVICE_SYNC_SCHEMA_VERSION_V1;
  readonly conflictId: StableIdentifierV1;
  readonly operationId: StableIdentifierV1;
  readonly deviceId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly entityType: string;
  readonly entityId: StableIdentifierV1;
  readonly reason: SyncConflictReasonV1;
  readonly status: SyncConflictStatusV1;
  readonly expectedRevision?: number;
  readonly actualRevision?: number;
  readonly detectedAt: StrictUtcTimestampV1;
  readonly resolvedAt?: StrictUtcTimestampV1;
}

export interface StrictLocalPackageManifestV1 {
  readonly schemaVersion: typeof DEVICE_SYNC_SCHEMA_VERSION_V1;
  readonly packageId: StableIdentifierV1;
  readonly deviceId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly purpose: string;
  readonly destinationClass: string;
  readonly itemDigests: readonly string[];
  readonly packageDigest: string;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly status: 'ISSUED' | 'RECEIVED' | 'EXPIRED' | 'QUARANTINED';
  readonly revision: number;
}

export interface DeviceTransferReceiptV1 {
  readonly schemaVersion: typeof DEVICE_SYNC_SCHEMA_VERSION_V1;
  readonly receiptId: StableIdentifierV1;
  readonly packageId: StableIdentifierV1;
  readonly deviceId: StableIdentifierV1;
  readonly destinationClass: string;
  readonly packageDigest: string;
  readonly receivedAt: StrictUtcTimestampV1;
  readonly manifestVerified: boolean;
  readonly status: 'ACCEPTED' | 'REJECTED' | 'QUARANTINED';
}

export interface DeviceSyncCursorV1 {
  readonly schemaVersion: typeof DEVICE_SYNC_SCHEMA_VERSION_V1;
  readonly cursorId: StableIdentifierV1;
  readonly deviceId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly authorizationEpoch: number;
  readonly changeRevision: number;
  readonly policyVersionId?: StableIdentifierV1;
  readonly policyDigest?: string;
  readonly dataMode: 'Local' | 'Hybrid' | 'Cloud';
  readonly protocolVersion: string;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly payload: string;
  readonly signature: string;
}

export interface DeviceSyncCursorSignerV1 {
  sign(payload: string): string;
  verify(payload: string, signature: string): boolean;
}

export interface DeviceSyncChangeV1 {
  readonly schemaVersion: typeof DEVICE_SYNC_SCHEMA_VERSION_V1;
  readonly changeId: StableIdentifierV1;
  readonly operationId: StableIdentifierV1;
  readonly deviceId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly entityType: string;
  readonly entityId: StableIdentifierV1;
  readonly kind: SyncOperationKindV1;
  readonly payloadClass: SyncPayloadClassV1;
  readonly payloadDigest: string;
  readonly dependencyIds: readonly StableIdentifierV1[];
  readonly entityRevision: number;
  readonly createdAt: StrictUtcTimestampV1;
}

export interface DeviceSyncBatchV1 {
  readonly schemaVersion: typeof DEVICE_SYNC_SCHEMA_VERSION_V1;
  readonly deviceId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly cursor: DeviceSyncCursorV1;
  readonly nextCursor?: DeviceSyncCursorV1;
  readonly changes: readonly DeviceSyncChangeV1[];
}

export type DeviceSyncErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TEXT'
  | 'INVALID_DIGEST'
  | 'INVALID_COLLECTION'
  | 'INVALID_REVISION'
  | 'INVALID_OPERATION'
  | 'INVALID_PAYLOAD_CLASS'
  | 'INVALID_STATE'
  | 'INVALID_LIFETIME'
  | 'LOCAL_CONTENT_FORBIDDEN'
  | 'INVALID_CURSOR'
  | 'CURSOR_STALE'
  | 'CURSOR_EXPIRED'
  | 'SIGNATURE_INVALID'
  | 'INVALID_BATCH'
  | 'DUPLICATE_CHANGE'
  | 'DEPENDENCY_ORDER_INVALID'
  | 'CHANGE_SCOPE_MISMATCH';

export type DeviceSyncResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DeviceSyncErrorCodeV1 };

function rejected(code: DeviceSyncErrorCodeV1): DeviceSyncResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function scope(input: unknown): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const value = input.normalize('NFC').trim();
  return value.length > 0 && value.length <= maxLength ? value : undefined;
}

function digest(input: unknown): string | undefined {
  const value = text(input, DEVICE_SYNC_MAX_DIGEST_LENGTH_V1);
  return value && /^[a-f0-9]{64,128}$/u.test(value) ? value : undefined;
}

function positiveRevision(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

function nonNegativeRevision(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 ? input : undefined;
}

function lifetimeWithin(issuedAt: StrictUtcTimestampV1, expiresAt: StrictUtcTimestampV1): boolean {
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  return (
    Number.isFinite(issued) &&
    Number.isFinite(expires) &&
    expires > issued &&
    expires - issued <= 24 * 60 * 60 * 1_000
  );
}

function protocol(input: unknown): string | undefined {
  const value = text(input, DEVICE_SYNC_MAX_PROTOCOL_LENGTH_V1);
  return value && /^[a-z][a-z0-9._-]*$/u.test(value) ? value : undefined;
}

function dataMode(input: unknown): 'Local' | 'Hybrid' | 'Cloud' | undefined {
  return input === 'Local' || input === 'Hybrid' || input === 'Cloud' ? input : undefined;
}

function canonicalCursor(
  input: Omit<DeviceSyncCursorV1, 'payload' | 'signature'>,
): string {
  return JSON.stringify({
    schemaVersion: input.schemaVersion,
    cursorId: input.cursorId,
    deviceId: input.deviceId,
    tenantScope: input.tenantScope,
    authorizationEpoch: input.authorizationEpoch,
    changeRevision: input.changeRevision,
    ...(input.policyVersionId === undefined ? {} : { policyVersionId: input.policyVersionId }),
    ...(input.policyDigest === undefined ? {} : { policyDigest: input.policyDigest }),
    dataMode: input.dataMode,
    protocolVersion: input.protocolVersion,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
}

function cursorShape(input: unknown): input is DeviceSyncCursorV1 {
  if (!input || typeof input !== 'object') return false;
  const cursor = input as Partial<DeviceSyncCursorV1>;
  return (
    cursor.schemaVersion === DEVICE_SYNC_SCHEMA_VERSION_V1 &&
    typeof cursor.cursorId === 'string' &&
    typeof cursor.deviceId === 'string' &&
    typeof cursor.tenantScope === 'object' &&
    typeof cursor.authorizationEpoch === 'number' &&
    typeof cursor.changeRevision === 'number' &&
    typeof cursor.dataMode === 'string' &&
    typeof cursor.protocolVersion === 'string' &&
    typeof cursor.issuedAt === 'string' &&
    typeof cursor.expiresAt === 'string' &&
    typeof cursor.payload === 'string' &&
    typeof cursor.signature === 'string'
  );
}

function uniqueStableIds(input: unknown): readonly StableIdentifierV1[] | undefined {
  if (!Array.isArray(input) || input.length > DEVICE_SYNC_MAX_DEPENDENCIES_V1) return undefined;
  const values = input.map(stable);
  return values.every((value): value is StableIdentifierV1 => value !== undefined)
    ? Object.freeze([...new Set(values)])
    : undefined;
}

function accepted<TValue>(value: TValue): DeviceSyncResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function isSyncOperationKind(value: unknown): value is SyncOperationKindV1 {
  return value === 'UPSERT' || value === 'DELETE' || value === 'ACKNOWLEDGE';
}

function isSyncPayloadClass(value: unknown): value is SyncPayloadClassV1 {
  return (
    value === 'CONTROL_METADATA' ||
    value === 'APPROVED_DERIVED_RESULT' ||
    value === 'RECONSTRUCTABLE_DERIVED_CONTENT'
  );
}

function isSyncConflictReason(value: unknown): value is SyncConflictReasonV1 {
  return (
    value === 'REVISION_MISMATCH' ||
    value === 'POLICY_CHANGED' ||
    value === 'DUPLICATE_EFFECT' ||
    value === 'REVOKED_DEVICE' ||
    value === 'DEPENDENCY_UNAVAILABLE' ||
    value === 'PAYLOAD_NOT_ALLOWED'
  );
}

export function createDeviceSyncOperationV1(input: {
  readonly operationId: unknown;
  readonly deviceId: unknown;
  readonly tenantScope: unknown;
  readonly entityType: unknown;
  readonly entityId: unknown;
  readonly kind: unknown;
  readonly payloadClass: unknown;
  readonly payloadDigest: unknown;
  readonly encryptedPayload?: unknown;
  readonly dependencyIds?: unknown;
  readonly baseRevision?: unknown;
  readonly createdAt: unknown;
}): DeviceSyncResultV1<DeviceSyncOperationV1> {
  const operationId = stable(input.operationId);
  const deviceId = stable(input.deviceId);
  const tenantScope = scope(input.tenantScope);
  const entityType = text(input.entityType, 64);
  const entityId = stable(input.entityId);
  const payloadDigest = digest(input.payloadDigest);
  const dependencyIds = uniqueStableIds(input.dependencyIds ?? []);
  const createdAt = timestamp(input.createdAt);
  const baseRevision =
    input.baseRevision === undefined ? undefined : positiveRevision(input.baseRevision);
  if (!operationId || !deviceId || !entityId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!entityType) return rejected('INVALID_TEXT');
  if (!payloadDigest) return rejected('INVALID_DIGEST');
  if (!dependencyIds) return rejected('INVALID_COLLECTION');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (input.baseRevision !== undefined && baseRevision === undefined)
    return rejected('INVALID_REVISION');
  if (!isSyncOperationKind(input.kind)) return rejected('INVALID_OPERATION');
  if (!isSyncPayloadClass(input.payloadClass)) return rejected('INVALID_PAYLOAD_CLASS');
  const encryptedPayload =
    input.encryptedPayload === undefined ? undefined : text(input.encryptedPayload, 16_384);
  if (input.encryptedPayload !== undefined && !encryptedPayload)
    return rejected('LOCAL_CONTENT_FORBIDDEN');
  return accepted(
    Object.freeze({
      schemaVersion: DEVICE_SYNC_SCHEMA_VERSION_V1,
      operationId,
      deviceId,
      tenantScope,
      entityType,
      entityId,
      kind: input.kind,
      payloadClass: input.payloadClass,
      payloadDigest,
      ...(encryptedPayload === undefined ? {} : { encryptedPayload }),
      dependencyIds,
      ...(baseRevision === undefined ? {} : { baseRevision }),
      status: 'QUEUED' as const,
      revision: 1,
      createdAt,
    }),
  );
}

export function transitionDeviceSyncOperationV1(
  operation: DeviceSyncOperationV1,
  transition: 'ACCEPT' | 'APPLY' | 'CONFLICT' | 'QUARANTINE' | 'REJECT',
  at: unknown,
): DeviceSyncResultV1<DeviceSyncOperationV1> {
  const timestampValue = timestamp(at);
  if (!timestampValue) return rejected('INVALID_TIMESTAMP');
  const nextStatus: Record<typeof transition, SyncOperationStatusV1> = {
    ACCEPT: 'ACCEPTED',
    APPLY: 'APPLIED',
    CONFLICT: 'CONFLICT',
    QUARANTINE: 'QUARANTINED',
    REJECT: 'REJECTED',
  };
  const target = nextStatus[transition];
  const allowed =
    (operation.status === 'QUEUED' && transition === 'ACCEPT') ||
    (operation.status === 'ACCEPTED' &&
      (transition === 'APPLY' ||
        transition === 'CONFLICT' ||
        transition === 'QUARANTINE' ||
        transition === 'REJECT'));
  if (!allowed) return rejected('INVALID_STATE');
  return accepted(
    Object.freeze({
      ...operation,
      status: target,
      revision: operation.revision + 1,
      ...(transition === 'APPLY' ? { acknowledgedAt: timestampValue } : {}),
    }),
  );
}

export function createDeviceSyncConflictV1(input: {
  readonly conflictId: unknown;
  readonly operationId: unknown;
  readonly deviceId: unknown;
  readonly tenantScope: unknown;
  readonly entityType: unknown;
  readonly entityId: unknown;
  readonly reason: unknown;
  readonly expectedRevision?: unknown;
  readonly actualRevision?: unknown;
  readonly detectedAt: unknown;
}): DeviceSyncResultV1<DeviceSyncConflictV1> {
  const conflictId = stable(input.conflictId);
  const operationId = stable(input.operationId);
  const deviceId = stable(input.deviceId);
  const tenantScope = scope(input.tenantScope);
  const entityType = text(input.entityType, 64);
  const entityId = stable(input.entityId);
  const detectedAt = timestamp(input.detectedAt);
  const expectedRevision =
    input.expectedRevision === undefined ? undefined : positiveRevision(input.expectedRevision);
  const actualRevision =
    input.actualRevision === undefined ? undefined : positiveRevision(input.actualRevision);
  if (!conflictId || !operationId || !deviceId || !entityId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!entityType) return rejected('INVALID_TEXT');
  if (!detectedAt) return rejected('INVALID_TIMESTAMP');
  if (!isSyncConflictReason(input.reason)) return rejected('INVALID_STATE');
  if (input.expectedRevision !== undefined && expectedRevision === undefined)
    return rejected('INVALID_REVISION');
  if (input.actualRevision !== undefined && actualRevision === undefined)
    return rejected('INVALID_REVISION');
  return accepted(
    Object.freeze({
      schemaVersion: DEVICE_SYNC_SCHEMA_VERSION_V1,
      conflictId,
      operationId,
      deviceId,
      tenantScope,
      entityType,
      entityId,
      reason: input.reason,
      status: 'OPEN' as const,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
      ...(actualRevision === undefined ? {} : { actualRevision }),
      detectedAt,
    }),
  );
}

export function createDeviceSyncCursorV1(
  input: {
    readonly cursorId: unknown;
    readonly deviceId: unknown;
    readonly tenantScope: unknown;
    readonly authorizationEpoch: unknown;
    readonly changeRevision: unknown;
    readonly policyVersionId?: unknown;
    readonly policyDigest?: unknown;
    readonly dataMode: unknown;
    readonly protocolVersion: unknown;
    readonly issuedAt: unknown;
    readonly expiresAt: unknown;
  },
  signer: DeviceSyncCursorSignerV1,
): DeviceSyncResultV1<DeviceSyncCursorV1> {
  const cursorId = stable(input.cursorId);
  const deviceId = stable(input.deviceId);
  const tenantScope = scope(input.tenantScope);
  const authorizationEpoch = positiveRevision(input.authorizationEpoch);
  const changeRevision = nonNegativeRevision(input.changeRevision);
  const policyVersionId =
    input.policyVersionId === undefined ? undefined : stable(input.policyVersionId);
  const policyDigest =
    input.policyDigest === undefined ? undefined : digest(input.policyDigest);
  const mode = dataMode(input.dataMode);
  const protocolVersion = protocol(input.protocolVersion);
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = timestamp(input.expiresAt);
  if (!cursorId || !deviceId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!authorizationEpoch) return rejected('INVALID_REVISION');
  if (changeRevision === undefined) return rejected('INVALID_REVISION');
  if (input.policyVersionId !== undefined && !policyVersionId)
    return rejected('INVALID_IDENTIFIER');
  if (input.policyDigest !== undefined && !policyDigest) return rejected('INVALID_DIGEST');
  if (!mode || !protocolVersion) return rejected('INVALID_TEXT');
  if (!issuedAt || !expiresAt) return rejected('INVALID_TIMESTAMP');
  if (!lifetimeWithin(issuedAt, expiresAt)) return rejected('INVALID_LIFETIME');
  const unsigned: Omit<DeviceSyncCursorV1, 'payload' | 'signature'> = {
    schemaVersion: DEVICE_SYNC_SCHEMA_VERSION_V1,
    cursorId,
    deviceId,
    tenantScope,
    authorizationEpoch,
    changeRevision,
    ...(policyVersionId === undefined ? {} : { policyVersionId }),
    ...(policyDigest === undefined ? {} : { policyDigest }),
    dataMode: mode,
    protocolVersion,
    issuedAt,
    expiresAt,
  };
  const payload = canonicalCursor(unsigned);
  const signature = text(signer.sign(payload), 2048);
  if (!signature) return rejected('SIGNATURE_INVALID');
  return accepted(Object.freeze({ ...unsigned, payload, signature }));
}

export function verifyDeviceSyncCursorV1(
  cursor: DeviceSyncCursorV1,
  input: {
    readonly now: unknown;
    readonly deviceId: unknown;
    readonly tenantScope: unknown;
    readonly authorizationEpoch: unknown;
    readonly minimumRevision: unknown;
    readonly policyVersionId?: unknown;
    readonly policyDigest?: unknown;
    readonly dataMode?: unknown;
    readonly protocolVersion?: unknown;
  },
  signer: DeviceSyncCursorSignerV1,
): DeviceSyncResultV1<true> {
  if (!cursorShape(cursor)) return rejected('INVALID_CURSOR');
  const now = timestamp(input.now);
  const deviceId = stable(input.deviceId);
  const tenantScope = scope(input.tenantScope);
  const authorizationEpoch = positiveRevision(input.authorizationEpoch);
  const minimumRevision = nonNegativeRevision(input.minimumRevision);
  if (!now) return rejected('INVALID_TIMESTAMP');
  if (!deviceId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!authorizationEpoch || minimumRevision === undefined) return rejected('INVALID_REVISION');
  const policyVersionId =
    input.policyVersionId === undefined ? undefined : stable(input.policyVersionId);
  const policyDigest =
    input.policyDigest === undefined ? undefined : digest(input.policyDigest);
  if (input.policyVersionId !== undefined && !policyVersionId)
    return rejected('INVALID_IDENTIFIER');
  if (input.policyDigest !== undefined && !policyDigest) return rejected('INVALID_DIGEST');
  if (input.dataMode !== undefined && !dataMode(input.dataMode)) return rejected('INVALID_TEXT');
  if (input.protocolVersion !== undefined && !protocol(input.protocolVersion))
    return rejected('INVALID_TEXT');
  if (
    cursor.deviceId !== deviceId ||
    !tenantScopesEqualV1(cursor.tenantScope, tenantScope) ||
    cursor.authorizationEpoch !== authorizationEpoch ||
    cursor.changeRevision < minimumRevision ||
    (policyVersionId !== undefined && cursor.policyVersionId !== policyVersionId) ||
    (policyDigest !== undefined && cursor.policyDigest !== policyDigest) ||
    (input.dataMode !== undefined && cursor.dataMode !== input.dataMode) ||
    (input.protocolVersion !== undefined && cursor.protocolVersion !== input.protocolVersion)
  )
    return rejected('CURSOR_STALE');
  if (Date.parse(now) < Date.parse(cursor.issuedAt)) return rejected('CURSOR_STALE');
  if (Date.parse(now) >= Date.parse(cursor.expiresAt)) return rejected('CURSOR_EXPIRED');
  const { payload, signature, ...unsigned } = cursor;
  if (canonicalCursor(unsigned) !== payload || !signer.verify(payload, signature))
    return rejected('SIGNATURE_INVALID');
  return accepted(true);
}

export function createDeviceSyncChangeV1(input: {
  readonly changeId: unknown;
  readonly operationId: unknown;
  readonly deviceId: unknown;
  readonly tenantScope: unknown;
  readonly entityType: unknown;
  readonly entityId: unknown;
  readonly kind: unknown;
  readonly payloadClass: unknown;
  readonly payloadDigest: unknown;
  readonly dependencyIds?: unknown;
  readonly entityRevision: unknown;
  readonly createdAt: unknown;
}): DeviceSyncResultV1<DeviceSyncChangeV1> {
  const changeId = stable(input.changeId);
  const operationId = stable(input.operationId);
  const deviceId = stable(input.deviceId);
  const tenantScope = scope(input.tenantScope);
  const entityType = text(input.entityType, 64);
  const entityId = stable(input.entityId);
  const payloadDigest = digest(input.payloadDigest);
  const dependencyIds = uniqueStableIds(input.dependencyIds ?? []);
  const entityRevision = positiveRevision(input.entityRevision);
  const createdAt = timestamp(input.createdAt);
  if (!changeId || !operationId || !deviceId || !entityId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!entityType) return rejected('INVALID_TEXT');
  if (!payloadDigest) return rejected('INVALID_DIGEST');
  if (!dependencyIds) return rejected('INVALID_COLLECTION');
  if (!entityRevision) return rejected('INVALID_REVISION');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  if (!isSyncOperationKind(input.kind)) return rejected('INVALID_OPERATION');
  if (!isSyncPayloadClass(input.payloadClass)) return rejected('INVALID_PAYLOAD_CLASS');
  return accepted(
    Object.freeze({
      schemaVersion: DEVICE_SYNC_SCHEMA_VERSION_V1,
      changeId,
      operationId,
      deviceId,
      tenantScope,
      entityType,
      entityId,
      kind: input.kind,
      payloadClass: input.payloadClass,
      payloadDigest,
      dependencyIds,
      entityRevision,
      createdAt,
    }),
  );
}

export function createDeviceSyncBatchV1(input: {
  readonly deviceId: unknown;
  readonly tenantScope: unknown;
  readonly cursor: unknown;
  readonly nextCursor?: unknown;
  readonly changes: unknown;
}): DeviceSyncResultV1<DeviceSyncBatchV1> {
  const deviceId = stable(input.deviceId);
  const tenantScope = scope(input.tenantScope);
  if (!deviceId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!cursorShape(input.cursor)) return rejected('INVALID_CURSOR');
  if (
    input.cursor.deviceId !== deviceId ||
    !tenantScopesEqualV1(input.cursor.tenantScope, tenantScope)
  )
    return rejected('CHANGE_SCOPE_MISMATCH');
  if (input.nextCursor !== undefined && !cursorShape(input.nextCursor))
    return rejected('INVALID_CURSOR');
  if (
    input.nextCursor !== undefined &&
    (input.nextCursor.deviceId !== deviceId ||
      !tenantScopesEqualV1(input.nextCursor.tenantScope, tenantScope) ||
      input.nextCursor.authorizationEpoch !== input.cursor.authorizationEpoch ||
      input.nextCursor.changeRevision < input.cursor.changeRevision)
  )
    return rejected('INVALID_CURSOR');
  if (!Array.isArray(input.changes) || input.changes.length > DEVICE_SYNC_MAX_BATCH_CHANGES_V1)
    return rejected('INVALID_BATCH');
  const changes: DeviceSyncChangeV1[] = [];
  const changeIds = new Set<string>();
  const operationIndexes = new Map<string, number>();
  const parsedChanges: DeviceSyncChangeV1[] = [];
  for (const raw of input.changes) {
    if (!raw || typeof raw !== 'object') return rejected('INVALID_BATCH');
    const created = createDeviceSyncChangeV1(raw as Parameters<typeof createDeviceSyncChangeV1>[0]);
    if (!created.accepted) return created;
    if (
      created.value.deviceId !== deviceId ||
      !tenantScopesEqualV1(created.value.tenantScope, tenantScope)
    )
      return rejected('CHANGE_SCOPE_MISMATCH');
    if (changeIds.has(created.value.changeId) || operationIndexes.has(created.value.operationId))
      return rejected('DUPLICATE_CHANGE');
    changeIds.add(created.value.changeId);
    operationIndexes.set(created.value.operationId, parsedChanges.length);
    parsedChanges.push(created.value);
  }
  for (const [index, change] of parsedChanges.entries()) {
    for (const dependencyId of change.dependencyIds) {
      const dependencyIndex = operationIndexes.get(dependencyId);
      if (dependencyIndex !== undefined && dependencyIndex >= index)
        return rejected('DEPENDENCY_ORDER_INVALID');
    }
    changes.push(change);
  }
  return accepted(
    Object.freeze({
      schemaVersion: DEVICE_SYNC_SCHEMA_VERSION_V1,
      deviceId,
      tenantScope,
      cursor: input.cursor,
      ...(input.nextCursor === undefined ? {} : { nextCursor: input.nextCursor }),
      changes: Object.freeze(changes),
    }),
  );
}

export function createStrictLocalPackageManifestV1(input: {
  readonly packageId: unknown;
  readonly deviceId: unknown;
  readonly tenantScope: unknown;
  readonly purpose: unknown;
  readonly destinationClass: unknown;
  readonly itemDigests: unknown;
  readonly packageDigest: unknown;
  readonly issuedAt: unknown;
  readonly expiresAt: unknown;
}): DeviceSyncResultV1<StrictLocalPackageManifestV1> {
  const packageId = stable(input.packageId);
  const deviceId = stable(input.deviceId);
  const tenantScope = scope(input.tenantScope);
  const purpose = text(input.purpose, 200);
  const destinationClass = text(input.destinationClass, 64);
  const itemDigests = Array.isArray(input.itemDigests) ? input.itemDigests.map(digest) : undefined;
  const packageDigest = digest(input.packageDigest);
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = timestamp(input.expiresAt);
  if (!packageId || !deviceId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!purpose || !destinationClass) return rejected('INVALID_TEXT');
  if (!itemDigests || itemDigests.length === 0 || itemDigests.some((item) => item === undefined))
    return rejected('INVALID_COLLECTION');
  if (!packageDigest) return rejected('INVALID_DIGEST');
  if (!issuedAt || !expiresAt) return rejected('INVALID_TIMESTAMP');
  if (!lifetimeWithin(issuedAt, expiresAt)) return rejected('INVALID_LIFETIME');
  return accepted(
    Object.freeze({
      schemaVersion: DEVICE_SYNC_SCHEMA_VERSION_V1,
      packageId,
      deviceId,
      tenantScope,
      purpose,
      destinationClass,
      itemDigests: Object.freeze(itemDigests as string[]),
      packageDigest,
      issuedAt,
      expiresAt,
      status: 'ISSUED' as const,
      revision: 1,
    }),
  );
}

export function createDeviceTransferReceiptV1(input: {
  readonly receiptId: unknown;
  readonly packageId: unknown;
  readonly deviceId: unknown;
  readonly destinationClass: unknown;
  readonly packageDigest: unknown;
  readonly receivedAt: unknown;
  readonly manifestVerified: unknown;
  readonly status: unknown;
}): DeviceSyncResultV1<DeviceTransferReceiptV1> {
  const receiptId = stable(input.receiptId);
  const packageId = stable(input.packageId);
  const deviceId = stable(input.deviceId);
  const destinationClass = text(input.destinationClass, 64);
  const packageDigest = digest(input.packageDigest);
  const receivedAt = timestamp(input.receivedAt);
  if (!receiptId || !packageId || !deviceId) return rejected('INVALID_IDENTIFIER');
  if (!destinationClass) return rejected('INVALID_TEXT');
  if (!packageDigest) return rejected('INVALID_DIGEST');
  if (!receivedAt) return rejected('INVALID_TIMESTAMP');
  if (typeof input.manifestVerified !== 'boolean') return rejected('INVALID_STATE');
  if (input.status !== 'ACCEPTED' && input.status !== 'REJECTED' && input.status !== 'QUARANTINED')
    return rejected('INVALID_STATE');
  return accepted(
    Object.freeze({
      schemaVersion: DEVICE_SYNC_SCHEMA_VERSION_V1,
      receiptId,
      packageId,
      deviceId,
      destinationClass,
      packageDigest,
      receivedAt,
      manifestVerified: input.manifestVerified,
      status: input.status,
    }),
  );
}

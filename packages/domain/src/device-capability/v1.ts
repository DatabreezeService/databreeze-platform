import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '../tenant-scope/v1.js';

export const DEVICE_CAPABILITY_SCHEMA_VERSION_V1 = 1 as const;
export const DEVICE_CAPABILITY_MAX_LIST_ITEMS_V1 = 64;
export const DEVICE_CAPABILITY_MAX_GRANT_SECONDS_V1 = 24 * 60 * 60;

export type DeviceCapabilityTypeV1 =
  | 'APPROVED_FOLDER'
  | 'LOCAL_PROCESSOR'
  | 'CAPTURE'
  | 'EVIDENCE_RENDER'
  | 'LOCAL_NOTIFICATION';
export type DeviceCapabilityStatusV1 = 'ACTIVE' | 'PAUSED' | 'REVOKED' | 'EXPIRED';
export type DeviceGrantStatusV1 = 'ACTIVE' | 'REVOKED' | 'EXPIRED';
export type DeviceDataClassificationV1 = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type DeviceSynchronizationPayloadClassV1 =
  | 'CONTROL_METADATA'
  | 'APPROVED_DERIVED_RESULT'
  | 'RECONSTRUCTABLE_DERIVED_CONTENT'
  | 'ORIGINAL_CONTENT';

export interface DeviceCapabilityV1 {
  readonly schemaVersion: typeof DEVICE_CAPABILITY_SCHEMA_VERSION_V1;
  readonly capabilityId: StableIdentifierV1;
  readonly deviceId: StableIdentifierV1;
  readonly organizationId: StableIdentifierV1;
  readonly type: DeviceCapabilityTypeV1;
  readonly opaqueLocalHandle?: string;
  readonly constraintDigest: string;
  readonly status: DeviceCapabilityStatusV1;
  readonly reportedAt: StrictUtcTimestampV1;
  readonly revision: number;
}

export interface DeviceGrantV1 {
  readonly schemaVersion: typeof DEVICE_CAPABILITY_SCHEMA_VERSION_V1;
  readonly grantId: StableIdentifierV1;
  readonly deviceId: StableIdentifierV1;
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly capabilityId: StableIdentifierV1;
  readonly authorizationEpoch: number;
  readonly allowedActionTypes: readonly string[];
  readonly allowedDataClassifications: readonly DeviceDataClassificationV1[];
  readonly synchronizationPayloadClasses: readonly DeviceSynchronizationPayloadClassV1[];
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt?: StrictUtcTimestampV1;
  readonly status: DeviceGrantStatusV1;
  readonly revision: number;
}

export type DeviceCapabilityErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_TEXT'
  | 'INVALID_DIGEST'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TYPE'
  | 'INVALID_OPAQUE_HANDLE'
  | 'INVALID_ACTION'
  | 'INVALID_COLLECTION'
  | 'INVALID_CLASSIFICATION'
  | 'INVALID_PAYLOAD_CLASS'
  | 'INVALID_EPOCH'
  | 'INVALID_LIFETIME'
  | 'INVALID_REVISION'
  | 'INVALID_STATE';

export type DeviceCapabilityResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DeviceCapabilityErrorCodeV1 };

function rejected<TValue>(code: DeviceCapabilityErrorCodeV1): DeviceCapabilityResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function digest(input: unknown): string | undefined {
  return typeof input === 'string' && /^[a-f0-9]{64,128}$/u.test(input) ? input : undefined;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function opaqueHandle(input: unknown): string | undefined {
  const value = text(input, 512);
  if (!value || /[\\/:]/u.test(value) || value.includes('..')) return undefined;
  return value;
}

function positive(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

function list<T>(
  input: unknown,
  predicate: (value: unknown) => value is T,
): readonly T[] | undefined {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > DEVICE_CAPABILITY_MAX_LIST_ITEMS_V1
  )
    return undefined;
  const values = input.filter(predicate);
  return values.length === input.length ? Object.freeze([...new Set(values)]) : undefined;
}

function withinGrantLifetime(
  issuedAt: StrictUtcTimestampV1,
  expiresAt: StrictUtcTimestampV1,
): boolean {
  const start = Date.parse(issuedAt);
  const end = Date.parse(expiresAt);
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    end - start <= DEVICE_CAPABILITY_MAX_GRANT_SECONDS_V1 * 1_000
  );
}

function capabilityType(input: unknown): input is DeviceCapabilityTypeV1 {
  return (
    input === 'APPROVED_FOLDER' ||
    input === 'LOCAL_PROCESSOR' ||
    input === 'CAPTURE' ||
    input === 'EVIDENCE_RENDER' ||
    input === 'LOCAL_NOTIFICATION'
  );
}

function classification(input: unknown): input is DeviceDataClassificationV1 {
  return (
    input === 'PUBLIC' || input === 'INTERNAL' || input === 'CONFIDENTIAL' || input === 'RESTRICTED'
  );
}

function payloadClass(input: unknown): input is DeviceSynchronizationPayloadClassV1 {
  return (
    input === 'CONTROL_METADATA' ||
    input === 'APPROVED_DERIVED_RESULT' ||
    input === 'RECONSTRUCTABLE_DERIVED_CONTENT' ||
    input === 'ORIGINAL_CONTENT'
  );
}

function action(input: unknown): input is string {
  return typeof input === 'string' && /^[A-Z][A-Z0-9._-]{0,63}$/u.test(input) && input !== '*';
}

export function createDeviceCapabilityV1(input: {
  readonly capabilityId: unknown;
  readonly deviceId: unknown;
  readonly organizationId: unknown;
  readonly type: unknown;
  readonly opaqueLocalHandle?: unknown;
  readonly constraintDigest: unknown;
  readonly reportedAt: unknown;
}): DeviceCapabilityResultV1<DeviceCapabilityV1> {
  const capabilityId = stable(input.capabilityId);
  const deviceId = stable(input.deviceId);
  const organizationId = stable(input.organizationId);
  const constraintDigest = digest(input.constraintDigest);
  const reportedAt = timestamp(input.reportedAt);
  if (!capabilityId || !deviceId || !organizationId) return rejected('INVALID_IDENTIFIER');
  if (!capabilityType(input.type)) return rejected('INVALID_TYPE');
  if (!constraintDigest) return rejected('INVALID_DIGEST');
  if (!reportedAt) return rejected('INVALID_TIMESTAMP');
  const opaqueLocalHandle =
    input.opaqueLocalHandle === undefined ? undefined : opaqueHandle(input.opaqueLocalHandle);
  if (input.opaqueLocalHandle !== undefined && !opaqueLocalHandle)
    return rejected('INVALID_OPAQUE_HANDLE');
  return {
    accepted: true,
    value: Object.freeze({
      schemaVersion: DEVICE_CAPABILITY_SCHEMA_VERSION_V1,
      capabilityId,
      deviceId,
      organizationId,
      type: input.type,
      ...(opaqueLocalHandle ? { opaqueLocalHandle } : {}),
      constraintDigest,
      status: 'ACTIVE' as const,
      reportedAt,
      revision: 1,
    }),
  };
}

export function transitionDeviceCapabilityV1(
  capability: DeviceCapabilityV1,
  transition: 'PAUSE' | 'RESUME' | 'REVOKE',
  at: unknown,
): DeviceCapabilityResultV1<DeviceCapabilityV1> {
  const reportedAt = timestamp(at);
  if (!reportedAt) return rejected('INVALID_TIMESTAMP');
  if (capability.status === 'REVOKED' || capability.status === 'EXPIRED')
    return rejected('INVALID_STATE');
  const status = transition === 'PAUSE' ? 'PAUSED' : transition === 'RESUME' ? 'ACTIVE' : 'REVOKED';
  if (transition === 'RESUME' && capability.status !== 'PAUSED') return rejected('INVALID_STATE');
  if (transition === 'PAUSE' && capability.status !== 'ACTIVE') return rejected('INVALID_STATE');
  return {
    accepted: true,
    value: Object.freeze({ ...capability, status, reportedAt, revision: capability.revision + 1 }),
  };
}

export function createDeviceGrantV1(input: {
  readonly grantId: unknown;
  readonly deviceId: unknown;
  readonly organizationId: unknown;
  readonly workspaceId: unknown;
  readonly capabilityId: unknown;
  readonly authorizationEpoch: unknown;
  readonly allowedActionTypes: unknown;
  readonly allowedDataClassifications: unknown;
  readonly synchronizationPayloadClasses: unknown;
  readonly issuedAt: unknown;
  readonly expiresAt?: unknown;
}): DeviceCapabilityResultV1<DeviceGrantV1> {
  const grantId = stable(input.grantId);
  const deviceId = stable(input.deviceId);
  const organizationId = stable(input.organizationId);
  const workspaceId = stable(input.workspaceId);
  const capabilityId = stable(input.capabilityId);
  const authorizationEpoch = positive(input.authorizationEpoch);
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = input.expiresAt === undefined ? undefined : timestamp(input.expiresAt);
  const allowedActionTypes = list(input.allowedActionTypes, action);
  const allowedDataClassifications = list(input.allowedDataClassifications, classification);
  const synchronizationPayloadClasses = list(input.synchronizationPayloadClasses, payloadClass);
  if (!grantId || !deviceId || !organizationId || !workspaceId || !capabilityId)
    return rejected('INVALID_IDENTIFIER');
  if (!authorizationEpoch) return rejected('INVALID_EPOCH');
  if (!issuedAt) return rejected('INVALID_TIMESTAMP');
  if (input.expiresAt !== undefined && !expiresAt) return rejected('INVALID_TIMESTAMP');
  if (expiresAt && !withinGrantLifetime(issuedAt, expiresAt)) return rejected('INVALID_LIFETIME');
  if (!allowedActionTypes) return rejected('INVALID_ACTION');
  if (!allowedDataClassifications) return rejected('INVALID_CLASSIFICATION');
  if (!synchronizationPayloadClasses) return rejected('INVALID_PAYLOAD_CLASS');
  return {
    accepted: true,
    value: Object.freeze({
      schemaVersion: DEVICE_CAPABILITY_SCHEMA_VERSION_V1,
      grantId,
      deviceId,
      organizationId,
      workspaceId,
      capabilityId,
      authorizationEpoch,
      allowedActionTypes,
      allowedDataClassifications,
      synchronizationPayloadClasses,
      issuedAt,
      ...(expiresAt ? { expiresAt } : {}),
      status: 'ACTIVE' as const,
      revision: 1,
    }),
  };
}

export function transitionDeviceGrantV1(
  grant: DeviceGrantV1,
  transition: 'REVOKE' | 'EXPIRE',
): DeviceCapabilityResultV1<DeviceGrantV1> {
  if (grant.status !== 'ACTIVE') return rejected('INVALID_STATE');
  return {
    accepted: true,
    value: Object.freeze({
      ...grant,
      status: transition === 'REVOKE' ? ('REVOKED' as const) : ('EXPIRED' as const),
      revision: grant.revision + 1,
    }),
  };
}

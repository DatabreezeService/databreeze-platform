export const DESKTOP_BRIDGE_GLOBAL = 'databreezeDesktop';

export const DESKTOP_IPC_CHANNELS = Object.freeze({
  folderGrant: 'desktop:v1:folder:grant',
  sessionGetSafeState: 'desktop:v1:session:get-safe-state',
  sidecarGetStatus: 'desktop:v1:sidecar:get-status',
} as const);

export type DesktopIpcChannel = (typeof DESKTOP_IPC_CHANNELS)[keyof typeof DESKTOP_IPC_CHANNELS];
export type DesktopLocale = 'vi-VN' | 'en';
export type DesktopDataMode = 'LOCAL' | 'CLOUD' | 'HYBRID';
export type DesktopEnrollmentState = 'not-enrolled' | 'locked';
export type DesktopDeviceState = 'unavailable' | 'locked';
export type SidecarLifecycleState = 'not-installed' | 'stopped' | 'starting' | 'ready' | 'failed';

export interface DesktopSafeState {
  readonly applicationVersion: string;
  readonly locale: DesktopLocale;
  readonly dataMode: DesktopDataMode;
  readonly enrollmentState: DesktopEnrollmentState;
  readonly deviceState: DesktopDeviceState;
}

export interface SidecarSafeStatus {
  readonly lifecycle: SidecarLifecycleState;
  readonly protocolVersion: string | null;
  readonly engineVersion: string | null;
}

export type FolderGrantStatus = 'not-granted' | 'granted';

export interface FolderGrantState {
  readonly fileCount: number;
  readonly lastScanAt: string | null;
  readonly status: FolderGrantStatus;
}

export interface DesktopBridgeV1 {
  readonly v1: {
    readonly folder: {
      readonly grant: () => Promise<FolderGrantState>;
    };
    readonly session: {
      readonly getSafeState: () => Promise<DesktopSafeState>;
    };
    readonly sidecar: {
      readonly getStatus: () => Promise<SidecarSafeStatus>;
    };
  };
}

export function parseFolderGrantState(value: unknown): FolderGrantState {
  const record = exactDataRecord(value, ['fileCount', 'lastScanAt', 'status']);
  if (
    typeof record.fileCount !== 'number' ||
    !Number.isSafeInteger(record.fileCount) ||
    record.fileCount < 0 ||
    record.fileCount > 10_000
  ) {
    throw new Error('INVALID_FOLDER_GRANT');
  }
  if (record.lastScanAt !== null) {
    if (
      typeof record.lastScanAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.lastScanAt)
    ) {
      throw new Error('INVALID_FOLDER_GRANT');
    }
  }
  if (record.status !== 'not-granted' && record.status !== 'granted')
    throw new Error('INVALID_FOLDER_GRANT');
  if (record.status === 'not-granted' && (record.fileCount !== 0 || record.lastScanAt !== null))
    throw new Error('INVALID_FOLDER_GRANT');
  return Object.freeze({
    fileCount: record.fileCount,
    lastScanAt: record.lastScanAt,
    status: record.status,
  });
}

const SAFE_RESULT_MAX_BYTES = 64 * 1024;

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

function boundedVersion(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(value)) {
    throw new Error('INVALID_VERSION');
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

function withinResultBudget(value: unknown): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > SAFE_RESULT_MAX_BYTES) {
    throw new Error('RESULT_TOO_LARGE');
  }
}

export function parseDesktopSafeState(value: unknown): DesktopSafeState {
  const record = exactDataRecord(value, [
    'applicationVersion',
    'dataMode',
    'deviceState',
    'enrollmentState',
    'locale',
  ]);
  const applicationVersion = boundedVersion(record.applicationVersion);
  if (applicationVersion === null) throw new Error('INVALID_VERSION');
  const dataMode = primitiveEnum(
    record.dataMode,
    ['LOCAL', 'CLOUD', 'HYBRID'] as const,
    'INVALID_DATA_MODE',
  );
  const deviceState = primitiveEnum(
    record.deviceState,
    ['unavailable', 'locked'] as const,
    'INVALID_DEVICE_STATE',
  );
  const enrollmentState = primitiveEnum(
    record.enrollmentState,
    ['not-enrolled', 'locked'] as const,
    'INVALID_ENROLLMENT_STATE',
  );
  const locale = primitiveEnum(record.locale, ['vi-VN', 'en'] as const, 'INVALID_LOCALE');

  const result: DesktopSafeState = Object.freeze({
    applicationVersion,
    dataMode,
    deviceState,
    enrollmentState,
    locale,
  });
  withinResultBudget(result);
  return result;
}

export function parseSidecarSafeStatus(value: unknown): SidecarSafeStatus {
  const record = exactDataRecord(value, ['engineVersion', 'lifecycle', 'protocolVersion']);
  const lifecycle = primitiveEnum(
    record.lifecycle,
    ['not-installed', 'stopped', 'starting', 'ready', 'failed'] as const,
    'INVALID_LIFECYCLE',
  );
  const result: SidecarSafeStatus = Object.freeze({
    engineVersion: boundedVersion(record.engineVersion),
    lifecycle,
    protocolVersion: boundedVersion(record.protocolVersion),
  });
  withinResultBudget(result);
  return result;
}

export const DESKTOP_BRIDGE_GLOBAL = 'databreezeDesktop';

export const DESKTOP_IPC_CHANNELS = Object.freeze({
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

export interface DesktopBridgeV1 {
  readonly v1: {
    readonly session: {
      readonly getSafeState: () => Promise<DesktopSafeState>;
    };
    readonly sidecar: {
      readonly getStatus: () => Promise<SidecarSafeStatus>;
    };
  };
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
  if (!['LOCAL', 'CLOUD', 'HYBRID'].includes(String(record.dataMode))) {
    throw new Error('INVALID_DATA_MODE');
  }
  if (!['unavailable', 'locked'].includes(String(record.deviceState))) {
    throw new Error('INVALID_DEVICE_STATE');
  }
  if (!['not-enrolled', 'locked'].includes(String(record.enrollmentState))) {
    throw new Error('INVALID_ENROLLMENT_STATE');
  }
  if (!['vi-VN', 'en'].includes(String(record.locale))) throw new Error('INVALID_LOCALE');

  const result: DesktopSafeState = Object.freeze({
    applicationVersion,
    dataMode: record.dataMode as DesktopDataMode,
    deviceState: record.deviceState as DesktopDeviceState,
    enrollmentState: record.enrollmentState as DesktopEnrollmentState,
    locale: record.locale as DesktopLocale,
  });
  withinResultBudget(result);
  return result;
}

export function parseSidecarSafeStatus(value: unknown): SidecarSafeStatus {
  const record = exactDataRecord(value, ['engineVersion', 'lifecycle', 'protocolVersion']);
  if (
    !['not-installed', 'stopped', 'starting', 'ready', 'failed'].includes(String(record.lifecycle))
  ) {
    throw new Error('INVALID_LIFECYCLE');
  }
  const result: SidecarSafeStatus = Object.freeze({
    engineVersion: boundedVersion(record.engineVersion),
    lifecycle: record.lifecycle as SidecarLifecycleState,
    protocolVersion: boundedVersion(record.protocolVersion),
  });
  withinResultBudget(result);
  return result;
}

export interface SidecarLifecyclePort {
  getStatus(): Promise<unknown>;
}

export type SidecarEnvironmentName =
  | 'LANG'
  | 'LC_ALL'
  | 'PYTHONIOENCODING'
  | 'PYTHONUTF8'
  | 'TEMP'
  | 'TMP';

export interface SidecarLaunchPlanInput {
  readonly executable: { readonly path: string; readonly sha256: string };
  readonly argv: readonly string[];
  readonly environment: readonly {
    readonly name: SidecarEnvironmentName;
    readonly value: string;
  }[];
  readonly attemptDirectoryHandle: string;
  readonly workDirectoryHandle: string;
  readonly protocol: { readonly version: string; readonly maxFrameBytes: number };
  readonly resources: {
    readonly timeoutMs: number;
    readonly maxMemoryMiB: number;
    readonly maxStderrBytes: number;
  };
}

export interface SidecarLaunchPlan {
  readonly executable: Readonly<{ path: string; sha256: string }>;
  readonly argv: readonly string[];
  readonly shell: false;
  readonly environment: Readonly<Partial<Record<SidecarEnvironmentName, string>>>;
  readonly attemptDirectoryHandle: string;
  readonly workDirectoryHandle: string;
  readonly protocol: Readonly<{ version: string; maxFrameBytes: number }>;
  readonly resources: Readonly<{
    timeoutMs: number;
    maxMemoryMiB: number;
    maxStderrBytes: number;
  }>;
}

const allowedInputKeys = [
  'argv',
  'attemptDirectoryHandle',
  'environment',
  'executable',
  'protocol',
  'resources',
  'workDirectoryHandle',
] as const;
const allowedEnvironmentNames = new Set<SidecarEnvironmentName>([
  'LANG',
  'LC_ALL',
  'PYTHONIOENCODING',
  'PYTHONUTF8',
  'TEMP',
  'TMP',
]);

function reject(): never {
  throw new Error('SIDECAR_PLAN_REJECTED');
}

function plainDataRecord<Key extends string>(
  value: unknown,
  allowedKeys: readonly Key[],
): Record<Key, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return reject();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== 'string') ||
    keys.length !== allowedKeys.length ||
    keys.some((key) => typeof key !== 'string' || !(allowedKeys as readonly string[]).includes(key))
  ) {
    return reject();
  }
  const result = {} as Record<Key, unknown>;
  for (const key of allowedKeys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      return reject();
    }
    result[key] = descriptor.value as unknown;
  }
  return result;
}

function boundedString(value: unknown, maximum: number, pattern?: RegExp): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.includes('\0') ||
    value.includes('\r') ||
    value.includes('\n') ||
    (pattern !== undefined && !pattern.test(value))
  ) {
    return reject();
  }
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    return reject();
  }
  return value as number;
}

export function createSidecarLaunchPlan(input: SidecarLaunchPlanInput): SidecarLaunchPlan {
  const source = plainDataRecord(input, allowedInputKeys);
  const executable = plainDataRecord(source.executable, ['path', 'sha256']);
  const executablePath = boundedString(
    executable.path,
    1024,
    /^[A-Za-z]:\\(?!\\)(?!.*(?:^|\\)\.\.(?:\\|$)).+\.exe$/i,
  );
  const sha256 = boundedString(executable.sha256, 64, /^[a-fA-F0-9]{64}$/).toLowerCase();

  if (!Array.isArray(source.argv) || source.argv.length > 64) return reject();
  const argv = Object.freeze(source.argv.map((argument) => boundedString(argument, 1024)));

  if (!Array.isArray(source.environment) || source.environment.length > 6) return reject();
  const environment: Partial<Record<SidecarEnvironmentName, string>> = {};
  for (const entry of source.environment) {
    const pair = plainDataRecord(entry, ['name', 'value']);
    if (
      typeof pair.name !== 'string' ||
      !allowedEnvironmentNames.has(pair.name as SidecarEnvironmentName)
    ) {
      return reject();
    }
    const name = pair.name as SidecarEnvironmentName;
    if (Object.prototype.hasOwnProperty.call(environment, name)) return reject();
    environment[name] = boundedString(pair.value, 1024);
  }

  const protocol = plainDataRecord(source.protocol, ['maxFrameBytes', 'version']);
  const resources = plainDataRecord(source.resources, [
    'maxMemoryMiB',
    'maxStderrBytes',
    'timeoutMs',
  ]);
  const handlePattern = /^[A-Za-z][A-Za-z0-9_-]{7,127}$/;

  return Object.freeze({
    argv,
    attemptDirectoryHandle: boundedString(source.attemptDirectoryHandle, 128, handlePattern),
    environment: Object.freeze(environment),
    executable: Object.freeze({ path: executablePath, sha256 }),
    protocol: Object.freeze({
      maxFrameBytes: boundedInteger(protocol.maxFrameBytes, 1024, 16 * 1024 * 1024),
      version: boundedString(protocol.version, 32, /^[0-9A-Za-z][0-9A-Za-z.-]*$/),
    }),
    resources: Object.freeze({
      maxMemoryMiB: boundedInteger(resources.maxMemoryMiB, 64, 16_384),
      maxStderrBytes: boundedInteger(resources.maxStderrBytes, 1024, 1024 * 1024),
      timeoutMs: boundedInteger(resources.timeoutMs, 1_000, 24 * 60 * 60 * 1000),
    }),
    shell: false,
    workDirectoryHandle: boundedString(source.workDirectoryHandle, 128, handlePattern),
  });
}

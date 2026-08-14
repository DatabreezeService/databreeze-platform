import { createHash } from 'node:crypto';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

const HASH = /^[0-9a-f]{64}$/u;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u;
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const LOCALES = new Set(['vi-VN', 'en']);
const SIDE_EFFECT_CLASSES = new Set(['NONE', 'REVERSIBLE', 'EXTERNAL', 'DESTRUCTIVE']);
const RISK_CLASSES = new Set(['READ_ONLY', 'LOW', 'CONSEQUENTIAL', 'RESTRICTED']);
const BLOCKED_PARAMETER_KEY =
  /^(?:secret|password|passphrase|credentials?|apiKey|api_key|token|authorization|cookie|command|script|shell|path|filePath|file_path|url|uri|dsn|connectionString|connection_string|bytes|base64|binary|content|payload)$/iu;
const BLOCKED_PARAMETER_VALUE =
  /(?:[a-z][a-z0-9+.-]*:\/\/|^[A-Za-z]:[\\/]|^\\\\|^\/|\b(?:cmd|powershell|bash|sh|python|node)(?:\.exe)?\b|-----BEGIN|\bsk-[A-Za-z0-9_-]{8,})/iu;
const MAX_INPUT_OBJECTS = 128;
const MAX_CAPABILITIES = 64;
const MAX_PARAMETER_KEYS = 128;
const MAX_PARAMETER_DEPTH = 8;
const MAX_PARAMETER_JSON_BYTES = 65_536;
const MAX_OUTPUT_BYTES = 1_073_741_824;
const MAX_DESCRIPTOR_LIFETIME_MS = 24 * 60 * 60 * 1_000;

type JsonPrimitive = string | number | boolean | null;
export interface ExecutionRequestParameterObjectV1 {
  readonly [key: string]: ExecutionRequestParameterValueV1;
}
export type ExecutionRequestParameterValueV1 =
  | JsonPrimitive
  | readonly ExecutionRequestParameterValueV1[]
  | ExecutionRequestParameterObjectV1;

export interface ExecutionRequestDescriptorActionV1 {
  readonly type: string;
  readonly version: number;
  readonly inputSchemaId: string;
  readonly outputSchemaId: string;
  readonly handlerDigest: string;
  readonly requiredCapabilities: readonly string[];
  readonly sideEffectClass: 'NONE' | 'REVERSIBLE' | 'EXTERNAL' | 'DESTRUCTIVE';
  readonly riskClass: 'READ_ONLY' | 'LOW' | 'CONSEQUENTIAL' | 'RESTRICTED';
}

export interface ExecutionRequestOutputPolicyV1 {
  readonly outputObjectId: string;
  readonly maxBytes: number;
  readonly mediaType: string;
}

export interface ExecutionRequestDescriptorV1 {
  readonly schemaVersion: 1;
  readonly descriptorId: StableIdentifierV1;
  /** JRA-032/BUA-023: opaque BUA authority; no meter, formula, reservation or quantity data. */
  readonly resultUsageSettlementBindingId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly jobId: StableIdentifierV1;
  readonly stepId: StableIdentifierV1;
  readonly action: ExecutionRequestDescriptorActionV1;
  readonly inputObjectIds: readonly string[];
  readonly inputManifestHash: string;
  readonly parameters: Readonly<Record<string, ExecutionRequestParameterValueV1>>;
  readonly outputPolicy: ExecutionRequestOutputPolicyV1;
  readonly deadline: StrictUtcTimestampV1;
  readonly locale: 'vi-VN' | 'en';
  readonly createdAt: StrictUtcTimestampV1;
  readonly canonicalHash: string;
}

export type ExecutionRequestDescriptorResultV1 =
  | { readonly accepted: true; readonly value: ExecutionRequestDescriptorV1 }
  | { readonly accepted: false; readonly code: 'JRA_EXECUTION_REQUEST_INVALID' };

export interface ExecutionRequestDescriptorVerifierPortV1 {
  /** Cross-module owner verifies the exact immutable IAE input references before JRA persists. */
  verify(descriptor: ExecutionRequestDescriptorV1): Promise<boolean>;
}

export class UnavailableExecutionRequestDescriptorVerifier
  implements ExecutionRequestDescriptorVerifierPortV1
{
  public verify(_descriptor: ExecutionRequestDescriptorV1): Promise<boolean> {
    void _descriptor;
    return Promise.resolve(false);
  }
}

function rejected(): ExecutionRequestDescriptorResultV1 {
  return Object.freeze({ accepted: false, code: 'JRA_EXECUTION_REQUEST_INVALID' });
}

function canonicalJson(value: ExecutionRequestParameterValueV1): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_FINITE_PARAMETER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as ExecutionRequestParameterObjectV1;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key]!)}`)
    .join(',')}}`;
}

function safeParameterValue(
  value: unknown,
  depth: number,
  keyCount: { value: number },
): value is ExecutionRequestParameterValueV1 {
  if (depth > MAX_PARAMETER_DEPTH) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    return value.length <= 4_096 && !BLOCKED_PARAMETER_VALUE.test(value);
  }
  if (Array.isArray(value)) {
    return (
      value.length <= MAX_PARAMETER_KEYS &&
      value.every((entry) => safeParameterValue(entry, depth + 1, keyCount))
    );
  }
  if (typeof value !== 'object') return false;
  const prototype: unknown = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  keyCount.value += keys.length;
  return (
    keyCount.value <= MAX_PARAMETER_KEYS &&
    keys.every(
      (key) =>
        SAFE_NAME.test(key) &&
        !BLOCKED_PARAMETER_KEY.test(key) &&
        safeParameterValue(record[key], depth + 1, keyCount),
    )
  );
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function cloneAndFreezeParameter(
  value: ExecutionRequestParameterValueV1,
): ExecutionRequestParameterValueV1 {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(cloneAndFreezeParameter));
  const record = value as ExecutionRequestParameterObjectV1;
  return Object.freeze(
    Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [key, cloneAndFreezeParameter(entry)]),
    ),
  );
}

function safeReferences(value: unknown, maximum: number): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= maximum &&
    value.every((entry: unknown) => typeof entry === 'string' && SAFE_REFERENCE.test(entry)) &&
    new Set(value).size === value.length
  );
}

function canonicalDescriptorInput(
  value: Omit<ExecutionRequestDescriptorV1, 'canonicalHash'>,
): ExecutionRequestParameterValueV1 {
  return {
    schemaVersion: value.schemaVersion,
    descriptorId: value.descriptorId,
    resultUsageSettlementBindingId: value.resultUsageSettlementBindingId,
    tenantScope: value.tenantScope as unknown as Readonly<
      Record<string, ExecutionRequestParameterValueV1>
    >,
    jobId: value.jobId,
    stepId: value.stepId,
    action: value.action as unknown as Readonly<Record<string, ExecutionRequestParameterValueV1>>,
    inputObjectIds: value.inputObjectIds,
    inputManifestHash: value.inputManifestHash,
    parameters: value.parameters,
    outputPolicy: value.outputPolicy as unknown as Readonly<
      Record<string, ExecutionRequestParameterValueV1>
    >,
    deadline: value.deadline,
    locale: value.locale,
    createdAt: value.createdAt,
  };
}

export function executionRequestDescriptorCanonicalHashV1(
  descriptor: Omit<ExecutionRequestDescriptorV1, 'canonicalHash'>,
): string {
  return createHash('sha256')
    .update(canonicalJson(canonicalDescriptorInput(descriptor)), 'utf8')
    .digest('hex');
}

export function createExecutionRequestDescriptorV1(
  input: unknown,
): ExecutionRequestDescriptorResultV1 {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return rejected();
  const value = input as Record<string, unknown>;
  if (
    !exactKeys(value, [
      'schemaVersion',
      'descriptorId',
      'resultUsageSettlementBindingId',
      'tenantScope',
      'jobId',
      'stepId',
      'action',
      'inputObjectIds',
      'inputManifestHash',
      'parameters',
      'outputPolicy',
      'deadline',
      'locale',
      'createdAt',
    ]) ||
    value['schemaVersion'] !== 1
  )
    return rejected();

  const descriptorId = parseStableIdentifierV1(value['descriptorId']);
  const resultUsageSettlementBindingId = parseStableIdentifierV1(
    value['resultUsageSettlementBindingId'],
  );
  const tenantScope = parseTenantScopeV1(value['tenantScope']);
  const jobId = parseStableIdentifierV1(value['jobId']);
  const stepId = parseStableIdentifierV1(value['stepId']);
  const deadline = parseStrictUtcTimestampV1(value['deadline']);
  const createdAt = parseStrictUtcTimestampV1(value['createdAt']);
  if (
    !descriptorId.accepted ||
    !resultUsageSettlementBindingId.accepted ||
    !tenantScope.accepted ||
    !jobId.accepted ||
    !stepId.accepted ||
    !deadline.accepted ||
    !createdAt.accepted ||
    !LOCALES.has(value['locale'] as string) ||
    Date.parse(deadline.value) <= Date.parse(createdAt.value) ||
    Date.parse(deadline.value) - Date.parse(createdAt.value) > MAX_DESCRIPTOR_LIFETIME_MS ||
    !safeReferences(value['inputObjectIds'], MAX_INPUT_OBJECTS) ||
    typeof value['inputManifestHash'] !== 'string' ||
    !HASH.test(value['inputManifestHash'])
  )
    return rejected();

  const actionValue = value['action'];
  if (
    typeof actionValue !== 'object' ||
    actionValue === null ||
    Array.isArray(actionValue) ||
    !exactKeys(actionValue, [
      'type',
      'version',
      'inputSchemaId',
      'outputSchemaId',
      'handlerDigest',
      'requiredCapabilities',
      'sideEffectClass',
      'riskClass',
    ])
  )
    return rejected();
  const action = actionValue as Record<string, unknown>;
  if (
    typeof action['type'] !== 'string' ||
    !SAFE_NAME.test(action['type']) ||
    !Number.isSafeInteger(action['version']) ||
    (action['version'] as number) < 1 ||
    typeof action['inputSchemaId'] !== 'string' ||
    !SAFE_NAME.test(action['inputSchemaId']) ||
    typeof action['outputSchemaId'] !== 'string' ||
    !SAFE_NAME.test(action['outputSchemaId']) ||
    typeof action['handlerDigest'] !== 'string' ||
    !HASH.test(action['handlerDigest']) ||
    !safeReferences(action['requiredCapabilities'], MAX_CAPABILITIES) ||
    !SIDE_EFFECT_CLASSES.has(action['sideEffectClass'] as string) ||
    !RISK_CLASSES.has(action['riskClass'] as string)
  )
    return rejected();

  const outputValue = value['outputPolicy'];
  if (
    typeof outputValue !== 'object' ||
    outputValue === null ||
    Array.isArray(outputValue) ||
    !exactKeys(outputValue, ['outputObjectId', 'maxBytes', 'mediaType'])
  )
    return rejected();
  const output = outputValue as Record<string, unknown>;
  if (
    typeof output['outputObjectId'] !== 'string' ||
    !SAFE_REFERENCE.test(output['outputObjectId']) ||
    !Number.isSafeInteger(output['maxBytes']) ||
    (output['maxBytes'] as number) < 1 ||
    (output['maxBytes'] as number) > MAX_OUTPUT_BYTES ||
    typeof output['mediaType'] !== 'string' ||
    !/^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/u.test(output['mediaType'])
  )
    return rejected();

  const parameters = value['parameters'];
  if (
    typeof parameters !== 'object' ||
    parameters === null ||
    Array.isArray(parameters) ||
    !safeParameterValue(parameters, 0, { value: 0 })
  )
    return rejected();
  const parameterRecord = parameters as Readonly<Record<string, ExecutionRequestParameterValueV1>>;
  if (Buffer.byteLength(canonicalJson(parameterRecord), 'utf8') > MAX_PARAMETER_JSON_BYTES)
    return rejected();

  const descriptorWithoutHash = Object.freeze({
    schemaVersion: 1 as const,
    descriptorId: descriptorId.value,
    resultUsageSettlementBindingId: resultUsageSettlementBindingId.value,
    tenantScope: tenantScope.value,
    jobId: jobId.value,
    stepId: stepId.value,
    action: Object.freeze({
      type: action['type'],
      version: action['version'] as number,
      inputSchemaId: action['inputSchemaId'],
      outputSchemaId: action['outputSchemaId'],
      handlerDigest: action['handlerDigest'],
      requiredCapabilities: Object.freeze([...(action['requiredCapabilities'] as string[])]),
      sideEffectClass: action[
        'sideEffectClass'
      ] as ExecutionRequestDescriptorActionV1['sideEffectClass'],
      riskClass: action['riskClass'] as ExecutionRequestDescriptorActionV1['riskClass'],
    }),
    inputObjectIds: Object.freeze([...(value['inputObjectIds'] as string[])]),
    inputManifestHash: value['inputManifestHash'],
    parameters: cloneAndFreezeParameter(parameterRecord) as Readonly<
      Record<string, ExecutionRequestParameterValueV1>
    >,
    outputPolicy: Object.freeze({
      outputObjectId: output['outputObjectId'],
      maxBytes: output['maxBytes'] as number,
      mediaType: output['mediaType'],
    }),
    deadline: deadline.value,
    locale: value['locale'] as 'vi-VN' | 'en',
    createdAt: createdAt.value,
  });
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      ...descriptorWithoutHash,
      canonicalHash: executionRequestDescriptorCanonicalHashV1(descriptorWithoutHash),
    }),
  });
}

export function executionRequestDescriptorMatchesJobV1(
  descriptor: ExecutionRequestDescriptorV1,
  job: {
    readonly jobId: StableIdentifierV1;
    readonly tenantScope: TenantScopeV1;
    readonly inputManifestHash: string;
    readonly action: {
      readonly actionType: string;
      readonly version: number;
      readonly inputSchemaId: string;
      readonly outputSchemaId: string;
      readonly handlerDigest: string;
      readonly requiredCapabilities: readonly string[];
      readonly sideEffectClass: string;
      readonly riskClass: string;
    };
  },
): boolean {
  return (
    descriptor.jobId === job.jobId &&
    tenantScopesEqualV1(descriptor.tenantScope, job.tenantScope) &&
    descriptor.inputManifestHash === job.inputManifestHash &&
    descriptor.action.type === job.action.actionType &&
    descriptor.action.version === job.action.version &&
    descriptor.action.inputSchemaId === job.action.inputSchemaId &&
    descriptor.action.outputSchemaId === job.action.outputSchemaId &&
    descriptor.action.handlerDigest === job.action.handlerDigest &&
    JSON.stringify(descriptor.action.requiredCapabilities) ===
      JSON.stringify(job.action.requiredCapabilities) &&
    descriptor.action.sideEffectClass === job.action.sideEffectClass &&
    descriptor.action.riskClass === job.action.riskClass
  );
}

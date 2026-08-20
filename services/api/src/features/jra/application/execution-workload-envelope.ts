import { createHash } from 'node:crypto';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { WorkerIdentityV1 } from '../worker/worker-ports.js';
import {
  executionRequestDescriptorCanonicalHashV1,
  type ExecutionRequestDescriptorActionV1,
  type ExecutionRequestDescriptorV1,
  type ExecutionRequestOutputPolicyV1,
  type ExecutionRequestParameterValueV1,
} from './execution-request-descriptor.js';

const HASH = /^[0-9a-f]{64}$/u;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u;
const SAFE_SCHEMA = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const SAFE_TIMEZONE = /^(?:UTC|[A-Za-z][A-Za-z0-9_+./:-]{0,63})$/u;
const MAX_INPUT_BYTES = 20 * 1024 * 1024 * 1024;
const MAX_SUBJECT_BINDINGS = 32;
const MAX_SUBJECT_VALUE_LENGTH = 512;

export interface ExecutionWorkloadInputHandleV1 {
  readonly objectId: string;
  readonly schemaId: string;
  readonly contentSha256: string;
  readonly byteLength: number;
}

/**
 * Worker-facing action metadata uses the same `sha256:<hex>` digest form as
 * the engine registry. The persisted execution descriptor deliberately stores
 * the canonical bare hex digest, so the envelope is the normalization boundary
 * between the two protocols.
 */
export interface ExecutionWorkloadActionV1
  extends Omit<ExecutionRequestDescriptorActionV1, 'handlerDigest'> {
  readonly handlerDigest: `sha256:${string}`;
}

export interface ExecutionWorkloadEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly workloadId: StableIdentifierV1;
  readonly descriptorId: StableIdentifierV1;
  readonly descriptorHash: string;
  readonly attemptId: StableIdentifierV1;
  readonly attemptBindingHash: string;
  readonly tenantScope: TenantScopeV1;
  readonly jobId: StableIdentifierV1;
  readonly action: ExecutionWorkloadActionV1;
  readonly inputHandles: readonly ExecutionWorkloadInputHandleV1[];
  readonly inputManifestHash: string;
  readonly parameters: Readonly<Record<string, ExecutionRequestParameterValueV1>>;
  readonly outputPolicy: ExecutionRequestOutputPolicyV1;
  readonly deadline: StrictUtcTimestampV1;
  readonly locale: 'vi-VN' | 'en';
  readonly timezone: string;
  /** Server-owned bindings used by result verification; never supplied by a worker. */
  readonly subjectBindings: Readonly<Record<string, string>>;
  readonly createdAt: StrictUtcTimestampV1;
  readonly canonicalHash: string;
}

export type ExecutionWorkloadEnvelopeResultV1 =
  | { readonly accepted: true; readonly value: ExecutionWorkloadEnvelopeV1 }
  | {
      readonly accepted: false;
      readonly code:
        | 'JRA_WORKLOAD_ENVELOPE_INVALID'
        | 'JRA_WORKLOAD_DESCRIPTOR_MISMATCH'
        | 'JRA_WORKLOAD_INPUTS_UNAVAILABLE';
    };

export interface ExecutionWorkloadEnvelopeResolverInputV1 {
  readonly identity: WorkerIdentityV1;
  readonly attemptId: StableIdentifierV1;
  readonly descriptorId: StableIdentifierV1;
  readonly descriptorHash: string;
  readonly attemptBindingHash: string;
  readonly now: string;
}

export interface ExecutionWorkloadEnvelopeResolverPortV1 {
  /** Resolves only the immutable server-owned envelope for the exact authenticated attempt. */
  resolve(
    input: ExecutionWorkloadEnvelopeResolverInputV1,
  ): Promise<ExecutionWorkloadEnvelopeResultV1>;
}

export const EXECUTION_WORKLOAD_ENVELOPE_RESOLVER_PORT = Symbol(
  'EXECUTION_WORKLOAD_ENVELOPE_RESOLVER_PORT',
);

export class UnavailableExecutionWorkloadEnvelopeResolver
  implements ExecutionWorkloadEnvelopeResolverPortV1
{
  public resolve(
    _input: ExecutionWorkloadEnvelopeResolverInputV1,
  ): Promise<ExecutionWorkloadEnvelopeResultV1> {
    void _input;
    return Promise.resolve({ accepted: false, code: 'JRA_WORKLOAD_INPUTS_UNAVAILABLE' });
  }
}

export type ExecutionWorkloadEnvelopePersistenceResultV1 = 'SAVED' | 'REPLAYED' | 'CONFLICT';

/** JRA-033: durable storage is intentionally narrower than the worker resolver. */
export interface ExecutionWorkloadEnvelopePersistencePortV1 {
  save(
    envelope: ExecutionWorkloadEnvelopeV1,
  ): Promise<ExecutionWorkloadEnvelopePersistenceResultV1>;
  find(input: {
    readonly identity: WorkerIdentityV1;
    readonly attemptId: StableIdentifierV1;
    readonly descriptorId: StableIdentifierV1;
    readonly descriptorHash: string;
    readonly attemptBindingHash: string;
    readonly now: string;
  }): Promise<ExecutionWorkloadEnvelopeV1 | undefined>;
}

export const EXECUTION_WORKLOAD_ENVELOPE_PERSISTENCE_PORT = Symbol(
  'EXECUTION_WORKLOAD_ENVELOPE_PERSISTENCE_PORT',
);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_FINITE_WORKLOAD_VALUE');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error('INVALID_WORKLOAD_VALUE');
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function rejected(
  code: Extract<
    ExecutionWorkloadEnvelopeResultV1,
    { readonly accepted: false }
  >['code'] = 'JRA_WORKLOAD_ENVELOPE_INVALID',
): ExecutionWorkloadEnvelopeResultV1 {
  return Object.freeze({ accepted: false, code });
}

function safeSubjectBindings(value: unknown): value is Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return (
    keys.length > 0 &&
    keys.length <= MAX_SUBJECT_BINDINGS &&
    keys.every((key) => {
      const child = record[key];
      return (
        SAFE_REFERENCE.test(key) &&
        typeof child === 'string' &&
        child.length <= MAX_SUBJECT_VALUE_LENGTH &&
        !/[\r\n]/u.test(child)
      );
    })
  );
}

function safeInputHandles(value: unknown): value is readonly ExecutionWorkloadInputHandleV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 128) return false;
  return value.every((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
    const row = entry as Record<string, unknown>;
    if (!exactKeys(row, ['objectId', 'schemaId', 'contentSha256', 'byteLength'])) return false;
    return (
      typeof row['objectId'] === 'string' &&
      SAFE_REFERENCE.test(row['objectId']) &&
      typeof row['schemaId'] === 'string' &&
      SAFE_SCHEMA.test(row['schemaId']) &&
      typeof row['contentSha256'] === 'string' &&
      HASH.test(row['contentSha256']) &&
      Number.isSafeInteger(row['byteLength']) &&
      (row['byteLength'] as number) >= 0 &&
      (row['byteLength'] as number) <= MAX_INPUT_BYTES
    );
  });
}

function canonicalEnvelopeInput(
  envelope: Omit<ExecutionWorkloadEnvelopeV1, 'canonicalHash'>,
): unknown {
  return {
    schemaVersion: envelope.schemaVersion,
    workloadId: envelope.workloadId,
    descriptorId: envelope.descriptorId,
    descriptorHash: envelope.descriptorHash,
    attemptId: envelope.attemptId,
    attemptBindingHash: envelope.attemptBindingHash,
    tenantScope: envelope.tenantScope,
    jobId: envelope.jobId,
    action: envelope.action,
    inputHandles: envelope.inputHandles,
    inputManifestHash: envelope.inputManifestHash,
    parameters: envelope.parameters,
    outputPolicy: envelope.outputPolicy,
    deadline: envelope.deadline,
    locale: envelope.locale,
    timezone: envelope.timezone,
    subjectBindings: envelope.subjectBindings,
    createdAt: envelope.createdAt,
  };
}

export function executionWorkloadEnvelopeCanonicalHashV1(
  envelope: Omit<ExecutionWorkloadEnvelopeV1, 'canonicalHash'>,
): string {
  return createHash('sha256')
    .update(canonicalJson(canonicalEnvelopeInput(envelope)))
    .digest('hex');
}

export interface CreateExecutionWorkloadEnvelopeInputV1 {
  readonly workloadId: StableIdentifierV1;
  readonly descriptor: ExecutionRequestDescriptorV1;
  readonly attemptId: StableIdentifierV1;
  readonly attemptBindingHash: string;
  readonly inputHandles: readonly ExecutionWorkloadInputHandleV1[];
  readonly timezone: string;
  readonly subjectBindings: Readonly<Record<string, string>>;
}

/**
 * Builds the only worker workload representation accepted by the execution path.
 * Input metadata and subject bindings must already have been resolved by IAE/root
 * authority; this function deliberately does not accept worker-provided values.
 */
export function createExecutionWorkloadEnvelopeV1(
  input: CreateExecutionWorkloadEnvelopeInputV1,
): ExecutionWorkloadEnvelopeResultV1 {
  const descriptor = input.descriptor;
  if (
    executionRequestDescriptorCanonicalHashV1(descriptor) !== descriptor.canonicalHash ||
    !HASH.test(input.attemptBindingHash) ||
    !SAFE_TIMEZONE.test(input.timezone) ||
    !safeSubjectBindings(input.subjectBindings) ||
    !safeInputHandles(input.inputHandles) ||
    input.inputHandles.length !== descriptor.inputObjectIds.length ||
    input.inputHandles.some(
      (handle, index) => handle.objectId !== descriptor.inputObjectIds[index],
    ) ||
    input.inputHandles.reduce((total, handle) => total + handle.byteLength, 0) > MAX_INPUT_BYTES
  )
    return rejected('JRA_WORKLOAD_DESCRIPTOR_MISMATCH');

  const descriptorId = parseStableIdentifierV1(descriptor.descriptorId);
  const workloadId = parseStableIdentifierV1(input.workloadId);
  const attemptId = parseStableIdentifierV1(input.attemptId);
  const deadline = parseStrictUtcTimestampV1(descriptor.deadline);
  const createdAt = parseStrictUtcTimestampV1(descriptor.createdAt);
  if (!descriptorId.accepted || !workloadId.accepted || !attemptId.accepted) {
    return rejected();
  }
  if (!deadline.accepted || !createdAt.accepted) return rejected();

  const withoutHash = Object.freeze({
    schemaVersion: 1 as const,
    workloadId: workloadId.value,
    descriptorId: descriptorId.value,
    descriptorHash: descriptor.canonicalHash,
    attemptId: attemptId.value,
    attemptBindingHash: input.attemptBindingHash,
    tenantScope: descriptor.tenantScope,
    jobId: descriptor.jobId,
    action: Object.freeze({
      ...descriptor.action,
      handlerDigest: `sha256:${descriptor.action.handlerDigest}`,
    }),
    inputHandles: Object.freeze(input.inputHandles.map((handle) => Object.freeze({ ...handle }))),
    inputManifestHash: descriptor.inputManifestHash,
    parameters: descriptor.parameters,
    outputPolicy: descriptor.outputPolicy,
    deadline: deadline.value,
    locale: descriptor.locale,
    timezone: input.timezone,
    subjectBindings: Object.freeze({ ...input.subjectBindings }),
    createdAt: createdAt.value,
  });
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      ...withoutHash,
      canonicalHash: executionWorkloadEnvelopeCanonicalHashV1(withoutHash),
    }),
  });
}

export function verifyExecutionWorkloadEnvelopeV1(
  envelope: ExecutionWorkloadEnvelopeV1,
  expected: {
    readonly identity: WorkerIdentityV1;
    readonly descriptorId: StableIdentifierV1;
    readonly descriptorHash: string;
    readonly attemptId: StableIdentifierV1;
    readonly attemptBindingHash: string;
    readonly now: string;
  },
): boolean {
  const now = Date.parse(expected.now);
  return (
    envelope.schemaVersion === 1 &&
    /^sha256:[0-9a-f]{64}$/u.test(envelope.action.handlerDigest) &&
    envelope.descriptorId === expected.descriptorId &&
    envelope.descriptorHash === expected.descriptorHash &&
    envelope.attemptId === expected.attemptId &&
    envelope.attemptBindingHash === expected.attemptBindingHash &&
    tenantScopesEqualV1(envelope.tenantScope, expected.identity.tenantScope) &&
    executionWorkloadEnvelopeCanonicalHashV1(envelope) === envelope.canonicalHash &&
    Number.isFinite(now) &&
    now <= Date.parse(envelope.deadline)
  );
}

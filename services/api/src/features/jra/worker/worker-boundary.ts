import { createHash } from 'node:crypto';

import type { ExecutionAttemptV1 } from '@databreeze/domain/execution-attempt/v1';
import type { JobV1 } from '@databreeze/domain/jobs/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  createIamTenantContextV1,
  type IamTenantContextV1,
} from '../../iam/application/tenant-context.js';
import { workerAttemptDescriptorBindingHashV1 } from './execution-descriptor-binding.js';
import {
  verifyExecutionWorkloadEnvelopeV1,
  type ExecutionWorkloadEnvelopeResultV1,
  type ExecutionWorkloadEnvelopeV1,
  type ExecutionWorkloadEnvelopeResolverInputV1,
} from '../application/execution-workload-envelope.js';
import type {
  WorkerPreparedResultResponseV1,
  WorkerResultPreparationPortV1,
  WorkerResultWriteCapabilityAuthorityPortV1,
} from './worker-result-preparation.port.js';
import type {
  WorkerResolvedResultAttestationV1,
  WorkerResultAttestationResolverPortV1,
  WorkerResultFinalizeResponseV1,
  WorkerResultFinalizationPortV1,
  WorkerResultBindingEchoV1,
  WorkerResultAttestationReferenceV1,
} from './worker-result-finalization.port.js';
import {
  type WorkerAttemptAuthorizationV1,
  type WorkerAttemptAuthorityPortV1,
  type WorkerAttemptMutationPortV1,
  type WorkerAssignmentPortV1,
  type WorkerAssignmentV1,
  type WorkerAuthenticatorPortV1,
  type WorkerCompletionTransactionPortV1,
  type WorkerCompletionReplayLookupV1,
  type WorkerCompletionV1,
  type WorkerIdentityV1,
  type WorkerInputGrantV1,
  type WorkerObjectGrantAuthorityPortV1,
  type WorkerOperationV1,
  type WorkerOutputGrantV1,
  type WorkerWorkloadEnvelopeAuthorityPortV1,
} from './worker-ports.js';

const MAX_TOKEN_LENGTH = 512;
const MAX_RESULT_REFERENCES = 128;
const MAX_INPUT_OBJECTS = 128;
const MAX_LEASE_SECONDS = 15 * 60;
const MAX_ATTESTATIONS = 32;
const STRICT_UTC_TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u;
const SAFE_NAME = /^[a-z][a-z0-9_.-]{0,127}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

function localWorkerDiagnostic(message: string): void {
  if (process.env['DATABREEZE_RUNTIME_PROFILE'] === 'local')
    console.error(`worker result diagnostic: ${message.slice(0, 240)}`);
}

export type WorkerProblemStatus = 400 | 401 | 403 | 409 | 413 | 503;

export class WorkerProblemError extends Error {
  public constructor(
    readonly code: string,
    readonly status: WorkerProblemStatus,
  ) {
    super(code);
    this.name = 'WorkerProblemError';
  }
}

function stableIdentifier(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function requestId(input: unknown): StableIdentifierV1 {
  const parsed = stableIdentifier(input);
  if (!parsed) throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
  return parsed;
}

function strictTimestamp(input: unknown): string | undefined {
  if (typeof input !== 'string' || !STRICT_UTC_TIMESTAMP.test(input)) return undefined;
  return parseStrictUtcTimestampV1(input).accepted ? input : undefined;
}

function tokenHash(input: unknown): string {
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > MAX_TOKEN_LENGTH ||
    /[\p{Cc}]/u.test(input)
  )
    throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function revision(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1)
    throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
  return input;
}

function sha256(input: unknown): string {
  if (typeof input !== 'string' || !/^[0-9a-f]{64}$/u.test(input))
    throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
  return input;
}

function safeIdempotencyKey(input: unknown): string {
  if (typeof input !== 'string' || !IDEMPOTENCY_KEY.test(input))
    throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
  return input;
}

function resultBindingEcho(input: unknown): WorkerResultBindingEchoV1 {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
  const value = input as Record<string, unknown>;
  if (
    !exactKeys(value, ['kind', 'outputSchemaId', 'outputNames']) ||
    value['kind'] !== 'OUTPUT_SET' ||
    typeof value['outputSchemaId'] !== 'string' ||
    !SAFE_NAME.test(value['outputSchemaId']) ||
    !Array.isArray(value['outputNames']) ||
    value['outputNames'].length === 0 ||
    value['outputNames'].length > 32 ||
    value['outputNames'].some((name) => typeof name !== 'string' || !SAFE_NAME.test(name)) ||
    new Set(value['outputNames']).size !== value['outputNames'].length
  )
    throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
  return Object.freeze({
    kind: 'OUTPUT_SET',
    outputSchemaId: value['outputSchemaId'],
    outputNames: Object.freeze([...(value['outputNames'] as string[])]),
  });
}

function declaredOutputs(
  input: unknown,
): readonly import('./worker-result-preparation.port.js').WorkerDeclaredOutputV1[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 32)
    throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
  const names = new Set<string>();
  return Object.freeze(
    input.map((candidate) => {
      if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
        throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
      const value = candidate as Record<string, unknown>;
      if (
        !exactKeys(value, [
          'kind',
          'outputName',
          'schemaId',
          'mediaType',
          'contentSha256',
          'byteLength',
          'sourceLineageHash',
        ]) ||
        !['JSON_RESULT', 'BINARY_RESULT'].includes(value['kind'] as string) ||
        typeof value['outputName'] !== 'string' ||
        !SAFE_NAME.test(value['outputName']) ||
        names.has(value['outputName']) ||
        typeof value['schemaId'] !== 'string' ||
        !SAFE_NAME.test(value['schemaId']) ||
        typeof value['mediaType'] !== 'string' ||
        !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(value['mediaType']) ||
        !Number.isSafeInteger(value['byteLength']) ||
        (value['byteLength'] as number) < 1 ||
        (value['byteLength'] as number) > 1_073_741_824
      )
        throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
      names.add(value['outputName']);
      return Object.freeze({
        kind: value['kind'] as 'JSON_RESULT' | 'BINARY_RESULT',
        outputName: value['outputName'],
        schemaId: value['schemaId'],
        mediaType: value['mediaType'],
        contentSha256: sha256(value['contentSha256']),
        byteLength: value['byteLength'] as number,
        sourceLineageHash: sha256(value['sourceLineageHash']),
      });
    }),
  );
}

function attestationReferences(input: unknown): readonly WorkerResultAttestationReferenceV1[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 32)
    throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
  const names = new Set<string>();
  return Object.freeze(
    input.map((candidate) => {
      if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
        throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
      const value = candidate as Record<string, unknown>;
      if (
        !exactKeys(value, ['outputName', 'attestationId']) ||
        typeof value['outputName'] !== 'string' ||
        !SAFE_NAME.test(value['outputName']) ||
        names.has(value['outputName'])
      )
        throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
      names.add(value['outputName']);
      return Object.freeze({
        outputName: value['outputName'],
        attestationId: requestId(value['attestationId']),
      });
    }),
  );
}

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...keys].sort());
}

function validRequiredCapabilities(input: unknown): input is readonly string[] {
  return (
    Array.isArray(input) &&
    input.length > 0 &&
    input.length <= 64 &&
    input.every((capability: unknown) =>
      typeof capability === 'string' ? SAFE_NAME.test(capability) : false,
    ) &&
    new Set(input).size === input.length
  );
}

function exactTenantScope(input: unknown): TenantScopeV1 | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const value = input as Record<string, unknown>;
  const keys =
    value['scopeType'] === 'organization'
      ? ['scopeType', 'organizationId']
      : value['scopeType'] === 'workspace'
        ? ['scopeType', 'organizationId', 'workspaceId']
        : value['scopeType'] === 'project'
          ? ['scopeType', 'organizationId', 'workspaceId', 'projectId']
          : undefined;
  if (keys === undefined || !exactKeys(value, keys)) return undefined;
  try {
    const parsed = parseTenantScopeV1(value);
    return parsed.accepted ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

function tenantScopeEqual(left: TenantScopeV1, right: TenantScopeV1): boolean {
  return tenantScopeContainsV1(left, right) && tenantScopeContainsV1(right, left);
}

function safeOpaqueReference(input: unknown): input is string {
  return typeof input === 'string' && OPAQUE_REFERENCE.test(input) && !input.includes('..');
}

function safeCapabilityToken(input: unknown): input is string {
  return (
    typeof input === 'string' &&
    input.length > 0 &&
    input.length <= 4096 &&
    !/[\p{Cc}]/u.test(input) &&
    !/^file:/iu.test(input) &&
    !/^[a-z]:[\\/]/iu.test(input) &&
    !input.startsWith('\\\\')
  );
}

function capabilityExtension(
  value: object,
  kind: 'INPUT' | 'OUTPUT',
  now: string,
  expiresAt: string,
): boolean {
  const keys = Object.keys(value);
  const extensionKeys =
    kind === 'INPUT'
      ? ['capabilityId', 'actions', 'maxBytes', 'issuedAt', 'signedCapability']
      : ['capabilityId', 'action', 'maxBytes', 'issuedAt', 'signedCapability'];
  const hasExtension = extensionKeys.some((key) => Object.hasOwn(value, key));
  if (!hasExtension) return true;
  if (!extensionKeys.every((key) => Object.hasOwn(value, key))) return false;
  const capabilityId = stableIdentifier((value as Record<string, unknown>)['capabilityId']);
  const maxBytes = (value as Record<string, unknown>)['maxBytes'];
  const issuedAt = strictTimestamp((value as Record<string, unknown>)['issuedAt']);
  const signedCapability = (value as Record<string, unknown>)['signedCapability'];
  if (
    !capabilityId ||
    !Number.isSafeInteger(maxBytes) ||
    (maxBytes as number) < 1 ||
    (maxBytes as number) > 10 * 1024 * 1024 * 1024 ||
    !issuedAt ||
    Date.parse(issuedAt) > Date.parse(now) ||
    Date.parse(issuedAt) >= Date.parse(expiresAt) ||
    !safeCapabilityToken(signedCapability)
  )
    return false;
  if (kind === 'INPUT') {
    const actions = (value as Record<string, unknown>)['actions'];
    return (
      Array.isArray(actions) && actions.length === 1 && actions[0] === 'READ' && keys.length === 13
    );
  }
  return (value as Record<string, unknown>)['action'] === 'WRITE' && keys.length === 13;
}

function isStringArray(input: unknown): input is readonly string[] {
  return Array.isArray(input) && input.every((value) => typeof value === 'string');
}

function resultReferences(input: unknown): readonly string[] {
  if (!Array.isArray(input) || input.length > MAX_RESULT_REFERENCES)
    throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 413);
  const references: string[] = [];
  for (const value of input) {
    if (!safeOpaqueReference(value)) throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 413);
    references.push(value);
  }
  return Object.freeze(references);
}

function boundedInitialLease(expiresAt: string, now: string): void {
  const nowMs = Date.parse(now);
  const expiryMs = Date.parse(expiresAt);
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(expiryMs) ||
    expiryMs <= nowMs ||
    expiryMs - nowMs > MAX_LEASE_SECONDS * 1000
  )
    throw new WorkerProblemError('WORKER_INVALID_LEASE', 409);
}

function boundedExtendedLease(input: unknown, now: string, current: string): string {
  const next = strictTimestamp(input);
  if (!next) throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
  const nowMs = Date.parse(now);
  const currentMs = Date.parse(current);
  const nextMs = Date.parse(next);
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(currentMs) ||
    !Number.isFinite(nextMs) ||
    nextMs <= currentMs ||
    nextMs > nowMs + MAX_LEASE_SECONDS * 1000
  )
    throw new WorkerProblemError('WORKER_INVALID_LEASE', 409);
  return next;
}

function context(identity: WorkerIdentityV1, attemptId: StableIdentifierV1): IamTenantContextV1 {
  const result = createIamTenantContextV1({
    tenantScope: identity.tenantScope,
    actorId: identity.workerId,
    correlationId: identity.correlationId,
    idempotencyKey: `worker:${attemptId}`,
    authorizationEpoch: identity.securityEpoch,
    mfaReenrollmentRequired: false,
  });
  if (!result.accepted) throw new WorkerProblemError('WORKER_AUTHENTICATION_FAILED', 401);
  return result.value;
}

function activeAttempt(attempt: ExecutionAttemptV1): boolean {
  return attempt.state === 'CLAIMED' || attempt.state === 'RUNNING';
}

function terminalJob(job: JobV1): boolean {
  return (
    job.state === 'SUCCEEDED' ||
    job.state === 'PARTIALLY_SUCCEEDED' ||
    job.state === 'FAILED' ||
    job.state === 'CANCELLED' ||
    job.state === 'EXPIRED'
  );
}

function mapAttemptMutationFailure(code: string): WorkerProblemError {
  if (code === 'LEASE_EXPIRED') return new WorkerProblemError('WORKER_LEASE_EXPIRED', 409);
  if (code === 'INVALID_REVISION') return new WorkerProblemError('WORKER_STALE_LEASE', 409);
  if (code === 'INVALID_LEASE') return new WorkerProblemError('WORKER_ATTEMPT_REJECTED', 409);
  return new WorkerProblemError('WORKER_ATTEMPT_REJECTED', 409);
}

function mapCompletionFailure(code: string): WorkerProblemError {
  if (code === 'LEASE_EXPIRED') return new WorkerProblemError('WORKER_LEASE_EXPIRED', 409);
  if (code === 'STALE_ATTEMPT') return new WorkerProblemError('WORKER_STALE_LEASE', 409);
  if (code === 'OBJECT_GRANT_REJECTED')
    return new WorkerProblemError('WORKER_OBJECT_GRANT_REJECTED', 403);
  if (code === 'OBJECT_GRANT_UNAVAILABLE')
    return new WorkerProblemError('WORKER_OBJECT_GRANT_UNAVAILABLE', 503);
  if (code === 'COMPLETION_UNAVAILABLE')
    return new WorkerProblemError('WORKER_COMPLETION_UNAVAILABLE', 503);
  return new WorkerProblemError('WORKER_ATTEMPT_REJECTED', 409);
}

function validateIdentity(value: WorkerIdentityV1 | undefined): WorkerIdentityV1 {
  const workerId = stableIdentifier(value?.workerId);
  const correlationId = stableIdentifier(value?.correlationId);
  const tenantScope = exactTenantScope(value?.tenantScope);
  if (
    !value ||
    !workerId ||
    !correlationId ||
    !tenantScope ||
    !Number.isSafeInteger(value.securityEpoch) ||
    value.securityEpoch < 1
  )
    throw new WorkerProblemError('WORKER_AUTHENTICATION_FAILED', 401);
  return Object.freeze({ ...value, workerId, correlationId, tenantScope });
}

function validateInputGrant(
  grant: WorkerInputGrantV1,
  identity: WorkerIdentityV1,
  authorization: WorkerAttemptAuthorizationV1,
  attempt: ExecutionAttemptV1,
  now: string,
): WorkerInputGrantV1 {
  const tenantScope = exactTenantScope(grant?.tenantScope);
  if (
    typeof grant !== 'object' ||
    grant === null ||
    (!exactKeys(grant, [
      'grantType',
      'attemptId',
      'jobId',
      'workerId',
      'securityEpoch',
      'tenantScope',
      'objectIds',
      'expiresAt',
    ]) &&
      !exactKeys(grant, [
        'grantType',
        'attemptId',
        'jobId',
        'workerId',
        'securityEpoch',
        'tenantScope',
        'objectIds',
        'expiresAt',
        'capabilityId',
        'actions',
        'maxBytes',
        'issuedAt',
        'signedCapability',
      ])) ||
    grant.grantType !== 'JOB_INPUT' ||
    grant.attemptId !== authorization.attempt.attemptId ||
    grant.jobId !== authorization.job.jobId ||
    grant.workerId !== identity.workerId ||
    grant.securityEpoch !== identity.securityEpoch ||
    !tenantScope ||
    !tenantScopeEqual(tenantScope, identity.tenantScope) ||
    !isStringArray(grant.objectIds) ||
    grant.objectIds.length > MAX_INPUT_OBJECTS ||
    grant.objectIds.some((objectId) => !safeOpaqueReference(objectId))
  )
    throw new WorkerProblemError('WORKER_OBJECT_GRANT_REJECTED', 503);

  const expiresAt = strictTimestamp(grant.expiresAt);
  if (!expiresAt || Date.parse(expiresAt) <= Date.parse(now))
    throw new WorkerProblemError('WORKER_OBJECT_GRANT_REJECTED', 503);
  if (Date.parse(expiresAt) > Date.parse(attempt.leaseExpiresAt))
    throw new WorkerProblemError('WORKER_OBJECT_GRANT_REJECTED', 503);
  if (!capabilityExtension(grant, 'INPUT', now, expiresAt))
    throw new WorkerProblemError('WORKER_OBJECT_GRANT_REJECTED', 503);
  return Object.freeze({
    ...grant,
    tenantScope,
    objectIds: Object.freeze([...grant.objectIds]),
  });
}

function validateOutputGrants(
  grants: unknown,
  identity: WorkerIdentityV1,
  authorization: WorkerAttemptAuthorizationV1,
  expectedReferences: readonly string[],
  now: string,
): void {
  if (!Array.isArray(grants) || grants.length !== expectedReferences.length)
    throw new WorkerProblemError('WORKER_OBJECT_GRANT_REJECTED', 503);
  const references = (grants as readonly unknown[]).map((candidate) => {
    if (typeof candidate !== 'object' || candidate === null)
      throw new WorkerProblemError('WORKER_OBJECT_GRANT_REJECTED', 503);
    const grant = candidate as WorkerOutputGrantV1;
    const tenantScope = exactTenantScope(grant.tenantScope);
    if (
      typeof grant !== 'object' ||
      grant === null ||
      (!exactKeys(grant, [
        'grantType',
        'attemptId',
        'jobId',
        'workerId',
        'securityEpoch',
        'tenantScope',
        'objectId',
        'expiresAt',
      ]) &&
        !exactKeys(grant, [
          'grantType',
          'attemptId',
          'jobId',
          'workerId',
          'securityEpoch',
          'tenantScope',
          'objectId',
          'expiresAt',
          'capabilityId',
          'action',
          'maxBytes',
          'issuedAt',
          'signedCapability',
        ])) ||
      grant.grantType !== 'JOB_OUTPUT' ||
      grant.attemptId !== authorization.attempt.attemptId ||
      grant.jobId !== authorization.job.jobId ||
      grant.workerId !== identity.workerId ||
      grant.securityEpoch !== identity.securityEpoch ||
      !tenantScope ||
      !tenantScopeEqual(tenantScope, identity.tenantScope) ||
      !safeOpaqueReference(grant.objectId)
    )
      throw new WorkerProblemError('WORKER_OBJECT_GRANT_REJECTED', 503);
    const expiresAt = strictTimestamp(grant.expiresAt);
    if (
      !expiresAt ||
      Date.parse(expiresAt) <= Date.parse(now) ||
      Date.parse(expiresAt) > Date.parse(authorization.attempt.leaseExpiresAt)
    )
      throw new WorkerProblemError('WORKER_OBJECT_GRANT_REJECTED', 503);
    if (!capabilityExtension(grant, 'OUTPUT', now, expiresAt))
      throw new WorkerProblemError('WORKER_OBJECT_GRANT_REJECTED', 503);
    return grant.objectId;
  });
  if (JSON.stringify(references) !== JSON.stringify(expectedReferences))
    throw new WorkerProblemError('WORKER_OBJECT_GRANT_REJECTED', 503);
}

function validateCompletion(completion: WorkerCompletionV1, expectedAttemptId: StableIdentifierV1) {
  if (
    typeof completion !== 'object' ||
    completion === null ||
    (completion.resultManifestHash === undefined
      ? !exactKeys(completion, ['attemptId', 'revision', 'outcome', 'resultReferences'])
      : !exactKeys(completion, [
          'attemptId',
          'revision',
          'outcome',
          'resultManifestHash',
          'resultReferences',
        ])) ||
    completion.attemptId !== expectedAttemptId ||
    !Number.isSafeInteger(completion.revision) ||
    completion.revision < 1 ||
    (completion.outcome !== 'SUCCEEDED' &&
      completion.outcome !== 'FAILED' &&
      completion.outcome !== 'CANCELLED') ||
    (completion.resultManifestHash !== undefined &&
      !/^[0-9a-f]{64}$/u.test(completion.resultManifestHash))
  )
    throw new WorkerProblemError('WORKER_COMPLETION_UNAVAILABLE', 503);
  let references: readonly string[];
  try {
    references = resultReferences(completion.resultReferences);
  } catch {
    throw new WorkerProblemError('WORKER_COMPLETION_UNAVAILABLE', 503);
  }
  return Object.freeze({ ...completion, resultReferences: references });
}

function validateMutationAttempt(
  value: ExecutionAttemptV1,
  identity: WorkerIdentityV1,
  authorization: WorkerAttemptAuthorizationV1,
  expectedRevision: number,
  now: string,
  expectedLeaseExpiresAt?: string,
  allowSameRevision = false,
): ExecutionAttemptV1 {
  const isObject = typeof value === 'object' && value !== null;
  const leaseExpiresAt = isObject ? strictTimestamp(value.leaseExpiresAt) : undefined;
  const tenantScope = isObject ? exactTenantScope(value.tenantScope) : undefined;
  const nowMs = Date.parse(now);
  const leaseMs = leaseExpiresAt === undefined ? Number.NaN : Date.parse(leaseExpiresAt);
  const revisionAccepted =
    isObject &&
    (value.revision === expectedRevision + 1 ||
      (allowSameRevision && value.revision === expectedRevision));
  if (
    !isObject ||
    value.attemptId !== authorization.attempt.attemptId ||
    value.jobId !== authorization.job.jobId ||
    value.executorId !== identity.workerId ||
    value.leaseTokenHash !== authorization.attempt.leaseTokenHash ||
    !tenantScope ||
    !tenantScopeEqual(tenantScope, identity.tenantScope) ||
    !activeAttempt(value) ||
    !revisionAccepted ||
    leaseExpiresAt === undefined ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(leaseMs) ||
    leaseMs <= nowMs ||
    leaseMs > nowMs + MAX_LEASE_SECONDS * 1000 ||
    (expectedLeaseExpiresAt !== undefined && leaseExpiresAt !== expectedLeaseExpiresAt)
  )
    throw new WorkerProblemError('WORKER_ATTEMPT_AUTHORITY_UNAVAILABLE', 503);
  return value;
}

function validateCompletionBinding(
  completion: WorkerCompletionV1,
  attemptId: StableIdentifierV1,
  expectedRevision: number,
  outcome: WorkerCompletionV1['outcome'],
  resultManifestHash: string | undefined,
  resultReferences: readonly string[],
): WorkerCompletionV1 {
  const validated = validateCompletion(completion, attemptId);
  if (
    expectedRevision >= Number.MAX_SAFE_INTEGER ||
    validated.revision !== expectedRevision + 1 ||
    validated.outcome !== outcome ||
    validated.resultManifestHash !== resultManifestHash ||
    JSON.stringify(validated.resultReferences) !== JSON.stringify(resultReferences)
  )
    throw new WorkerProblemError('WORKER_COMPLETION_UNAVAILABLE', 503);
  return validated;
}

export interface WorkerLeaseResponseV1 {
  readonly attemptId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly leaseExpiresAt: string;
  readonly revision: number;
  readonly inputGrant: WorkerInputGrantV1;
  /** JRA-033: immutable attempt-bound workload identity, never workload contents. */
  readonly workloadEnvelopeId?: StableIdentifierV1;
  readonly workloadEnvelopeHash?: string;
}

export interface WorkerHeartbeatResponseV1 {
  readonly attemptId: StableIdentifierV1;
  readonly leaseExpiresAt: string;
  readonly revision: number;
}

export interface WorkerBoundaryPortV1 {
  assignment(request: unknown): Promise<WorkerAssignmentV1 | undefined>;
  claim(
    request: unknown,
    input: {
      readonly attemptId: unknown;
      readonly leaseToken: unknown;
      readonly expectedRevision: unknown;
      readonly descriptorId: unknown;
      readonly descriptorHash: unknown;
      readonly attemptBindingHash: unknown;
    },
  ): Promise<WorkerLeaseResponseV1>;
  workload(
    request: unknown,
    input: {
      readonly attemptId: unknown;
      readonly leaseToken: unknown;
      readonly expectedRevision: unknown;
      readonly descriptorId: unknown;
      readonly descriptorHash: unknown;
      readonly attemptBindingHash: unknown;
    },
  ): Promise<ExecutionWorkloadEnvelopeV1>;
  heartbeat(
    request: unknown,
    input: {
      readonly attemptId: unknown;
      readonly leaseToken: unknown;
      readonly expectedRevision: unknown;
      readonly nextLeaseExpiresAt: unknown;
    },
  ): Promise<WorkerHeartbeatResponseV1>;
  prepareResult(
    request: unknown,
    input: {
      readonly attemptId: unknown;
      readonly leaseToken: unknown;
      readonly expectedRevision: unknown;
      readonly idempotencyKey: unknown;
      readonly outputs: unknown;
    },
  ): Promise<WorkerPreparedResultResponseV1>;
  finalizeResult(
    request: unknown,
    input: {
      readonly attemptId: unknown;
      readonly leaseToken: unknown;
      readonly expectedRevision: unknown;
      readonly submissionId: unknown;
      readonly descriptorBindingHash: unknown;
      readonly idempotencyKey: unknown;
      readonly attestations: unknown;
      readonly resultBinding: unknown;
    },
  ): Promise<WorkerResultFinalizeResponseV1>;
  complete(
    request: unknown,
    input: {
      readonly attemptId: unknown;
      readonly leaseToken: unknown;
      readonly expectedRevision: unknown;
      readonly outcome: unknown;
      readonly resultManifestHash?: unknown;
      readonly resultReferences: unknown;
    },
  ): Promise<WorkerCompletionV1>;
}

export interface WorkerBoundaryDependenciesV1 {
  readonly assignment?: WorkerAssignmentPortV1;
  readonly attempts: WorkerAttemptMutationPortV1;
  readonly authority: WorkerAttemptAuthorityPortV1;
  readonly authenticator: WorkerAuthenticatorPortV1;
  readonly grants: WorkerObjectGrantAuthorityPortV1;
  readonly completion: WorkerCompletionTransactionPortV1;
  readonly workloadEnvelope?: WorkerWorkloadEnvelopeAuthorityPortV1;
  readonly preparation?: WorkerResultPreparationPortV1;
  readonly resultCapabilities?: WorkerResultWriteCapabilityAuthorityPortV1;
  readonly finalization?: WorkerResultFinalizationPortV1;
  readonly attestations?: WorkerResultAttestationResolverPortV1;
  readonly now?: () => string;
}

export class WorkerBoundary implements WorkerBoundaryPortV1 {
  private readonly now: () => string;

  public constructor(private readonly dependencies: WorkerBoundaryDependenciesV1) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
    if (!dependencies.attempts || !dependencies.authority || !dependencies.authenticator)
      throw new WorkerProblemError('WORKER_BOUNDARY_UNAVAILABLE', 503);
    if (!dependencies.grants)
      throw new WorkerProblemError('WORKER_OBJECT_GRANT_AUTHORITY_UNAVAILABLE', 503);
    if (!dependencies.completion)
      throw new WorkerProblemError('WORKER_COMPLETION_TRANSACTION_UNAVAILABLE', 503);
  }

  private async identity(request: unknown): Promise<WorkerIdentityV1> {
    let value: WorkerIdentityV1 | undefined;
    try {
      value = await this.dependencies.authenticator.authenticate(request);
    } catch {
      value = undefined;
    }
    return validateIdentity(value);
  }

  public async assignment(request: unknown): Promise<WorkerAssignmentV1 | undefined> {
    const identity = await this.identity(request);
    if (!this.dependencies.assignment)
      throw new WorkerProblemError('WORKER_ASSIGNMENT_UNAVAILABLE', 503);
    const now = this.now();
    if (!strictTimestamp(now)) throw new WorkerProblemError('WORKER_BOUNDARY_UNAVAILABLE', 503);
    let value: WorkerAssignmentV1 | undefined;
    try {
      value = await this.dependencies.assignment.assign(identity, now);
    } catch (error: unknown) {
      // Local diagnostics must make an unavailable assignment actionable while
      // keeping the public problem response generic and never logging tokens or
      // request payloads. Production retains the fail-closed response only.
      if (process.env['DATABREEZE_RUNTIME_PROFILE'] === 'local') {
        const detail = error instanceof Error ? `${error.name}:${error.message}` : typeof error;
        console.error(`worker assignment failed: ${detail.slice(0, 240)}`);
      }
      throw new WorkerProblemError('WORKER_ASSIGNMENT_UNAVAILABLE', 503);
    }
    if (value === undefined) return undefined;
    const attemptId = stableIdentifier(value.attemptId);
    const jobId = stableIdentifier(value.jobId);
    const expiresAt = strictTimestamp(value.leaseExpiresAt);
    const descriptorId = stableIdentifier(value.descriptorId);
    const action = value.action;
    if (
      !attemptId ||
      !jobId ||
      !expiresAt ||
      !descriptorId ||
      typeof value.descriptorHash !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value.descriptorHash) ||
      typeof value.attemptBindingHash !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value.attemptBindingHash) ||
      !Number.isSafeInteger(value.expectedRevision) ||
      value.expectedRevision < 1 ||
      typeof action !== 'object' ||
      action === null ||
      !exactKeys(action, [
        'type',
        'version',
        'handlerDigest',
        'inputSchemaId',
        'outputSchemaId',
        'requiredCapabilities',
        'sideEffectClass',
        'riskClass',
      ]) ||
      !SAFE_NAME.test(action.type) ||
      !Number.isSafeInteger(action.version) ||
      action.version < 1 ||
      !/^sha256:[0-9a-f]{64}$/u.test(action.handlerDigest) ||
      !SAFE_NAME.test(action.inputSchemaId) ||
      !SAFE_NAME.test(action.outputSchemaId) ||
      !validRequiredCapabilities(action.requiredCapabilities) ||
      !['NONE', 'REVERSIBLE', 'EXTERNAL', 'DESTRUCTIVE'].includes(action.sideEffectClass) ||
      !['READ_ONLY', 'LOW', 'CONSEQUENTIAL', 'RESTRICTED'].includes(action.riskClass)
    )
      throw new WorkerProblemError('WORKER_ASSIGNMENT_UNAVAILABLE', 503);
    tokenHash(value.leaseToken);
    boundedInitialLease(expiresAt, now);
    const expectedBindingHash = workerAttemptDescriptorBindingHashV1({
      descriptorHash: value.descriptorHash,
      attemptId,
      jobId,
      workerId: identity.workerId,
      securityEpoch: identity.securityEpoch,
      leaseExpiresAt: expiresAt,
    });
    if (value.attemptBindingHash !== expectedBindingHash)
      throw new WorkerProblemError('WORKER_ASSIGNMENT_UNAVAILABLE', 503);
    const workloadEnvelopeId =
      value.workloadEnvelopeId === undefined
        ? undefined
        : stableIdentifier(value.workloadEnvelopeId);
    const workloadEnvelopeHash = value.workloadEnvelopeHash;
    if (
      (value.workloadEnvelopeId !== undefined && workloadEnvelopeId === undefined) ||
      (value.workloadEnvelopeId === undefined && workloadEnvelopeHash !== undefined) ||
      (workloadEnvelopeHash !== undefined && !/^[a-f0-9]{64}$/u.test(workloadEnvelopeHash))
    )
      throw new WorkerProblemError('WORKER_ASSIGNMENT_UNAVAILABLE', 503);
    return Object.freeze({
      attemptId,
      jobId,
      leaseToken: value.leaseToken,
      leaseExpiresAt: expiresAt,
      expectedRevision: value.expectedRevision,
      descriptorId,
      descriptorHash: value.descriptorHash,
      attemptBindingHash: value.attemptBindingHash,
      ...(workloadEnvelopeId === undefined
        ? {}
        : { workloadEnvelopeId, workloadEnvelopeHash: workloadEnvelopeHash! }),
      action: Object.freeze({
        ...action,
        requiredCapabilities: Object.freeze([...action.requiredCapabilities]),
      }),
    });
  }

  private async authorize(
    identity: WorkerIdentityV1,
    operation: WorkerOperationV1,
    attemptId: StableIdentifierV1,
    leaseTokenHash: string,
    expectedRevision: number,
  ): Promise<{
    readonly context: IamTenantContextV1;
    readonly value: WorkerAttemptAuthorizationV1;
  }> {
    const now = this.now();
    const parsedNow = strictTimestamp(now);
    if (!parsedNow) throw new WorkerProblemError('WORKER_BOUNDARY_UNAVAILABLE', 503);
    let value: WorkerAttemptAuthorizationV1 | undefined;
    try {
      value = await this.dependencies.authority.authorize(identity, {
        attemptId,
        leaseTokenHash,
        expectedRevision,
        operation,
        now: parsedNow,
      });
    } catch {
      throw new WorkerProblemError('WORKER_ATTEMPT_AUTHORITY_UNAVAILABLE', 503);
    }
    if (!value) throw new WorkerProblemError('WORKER_ATTEMPT_REJECTED', 409);

    if (
      typeof value !== 'object' ||
      value.attempt === null ||
      typeof value.attempt !== 'object' ||
      value.job === null ||
      typeof value.job !== 'object'
    )
      throw new WorkerProblemError('WORKER_ATTEMPT_AUTHORITY_UNAVAILABLE', 503);
    const { attempt, job } = value;
    const attemptScope = exactTenantScope(attempt.tenantScope);
    const jobScope = exactTenantScope(job.tenantScope);
    const leaseExpiresAt = strictTimestamp(attempt.leaseExpiresAt);
    if (leaseExpiresAt === undefined) throw new WorkerProblemError('WORKER_ATTEMPT_REJECTED', 409);
    if (
      attempt.attemptId !== attemptId ||
      attempt.executorId !== identity.workerId ||
      attempt.jobId !== job.jobId ||
      !attemptScope ||
      !jobScope ||
      !tenantScopeEqual(identity.tenantScope, attemptScope) ||
      !tenantScopeEqual(identity.tenantScope, jobScope) ||
      value.latestAttemptId !== attemptId ||
      value.workerSecurityEpoch !== identity.securityEpoch ||
      !stableIdentifier(value.descriptorId) ||
      typeof value.descriptorHash !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value.descriptorHash) ||
      typeof value.attemptBindingHash !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value.attemptBindingHash) ||
      value.attemptBindingHash !==
        workerAttemptDescriptorBindingHashV1({
          descriptorHash: value.descriptorHash,
          attemptId,
          jobId: job.jobId,
          workerId: identity.workerId,
          securityEpoch: identity.securityEpoch,
          leaseExpiresAt,
        }) ||
      attempt.leaseTokenHash !== leaseTokenHash
    )
      throw new WorkerProblemError('WORKER_ATTEMPT_REJECTED', 409);
    if (attempt.revision !== expectedRevision)
      throw new WorkerProblemError('WORKER_STALE_LEASE', 409);
    if (!activeAttempt(attempt)) throw new WorkerProblemError('WORKER_ATTEMPT_REJECTED', 409);
    if (terminalJob(job) || job.state === 'CANCEL_REQUESTED' || job.state === 'CANCELLED')
      throw new WorkerProblemError('WORKER_ATTEMPT_REJECTED', 409);
    if (Date.parse(leaseExpiresAt) <= Date.parse(parsedNow))
      throw new WorkerProblemError('WORKER_LEASE_EXPIRED', 409);
    return { context: context(identity, attemptId), value };
  }

  public async claim(
    request: unknown,
    input: {
      attemptId: unknown;
      leaseToken: unknown;
      expectedRevision: unknown;
      descriptorId: unknown;
      descriptorHash: unknown;
      attemptBindingHash: unknown;
    },
  ): Promise<WorkerLeaseResponseV1> {
    const identity = await this.identity(request);
    const attemptId = requestId(input.attemptId);
    const leaseHash = tokenHash(input.leaseToken);
    const expectedRevision = revision(input.expectedRevision);
    const descriptorId = requestId(input.descriptorId);
    const descriptorHash =
      typeof input.descriptorHash === 'string' && /^[a-f0-9]{64}$/u.test(input.descriptorHash)
        ? input.descriptorHash
        : undefined;
    const attemptBindingHash =
      typeof input.attemptBindingHash === 'string' &&
      /^[a-f0-9]{64}$/u.test(input.attemptBindingHash)
        ? input.attemptBindingHash
        : undefined;
    if (!descriptorHash || !attemptBindingHash)
      throw new WorkerProblemError('WORKER_DESCRIPTOR_BINDING_REJECTED', 409);
    const authorized = await this.authorize(
      identity,
      'CLAIM',
      attemptId,
      leaseHash,
      expectedRevision,
    );
    if (
      authorized.value.descriptorId !== descriptorId ||
      authorized.value.descriptorHash !== descriptorHash ||
      authorized.value.attemptBindingHash !== attemptBindingHash ||
      attemptBindingHash !==
        workerAttemptDescriptorBindingHashV1({
          descriptorHash,
          attemptId,
          jobId: authorized.value.job.jobId,
          workerId: identity.workerId,
          securityEpoch: identity.securityEpoch,
          leaseExpiresAt: authorized.value.attempt.leaseExpiresAt,
        })
    )
      throw new WorkerProblemError('WORKER_DESCRIPTOR_BINDING_REJECTED', 409);
    const now = this.now();
    boundedInitialLease(authorized.value.attempt.leaseExpiresAt, now);
    let started: Awaited<ReturnType<WorkerAttemptMutationPortV1['start']>>;
    try {
      started = await this.dependencies.attempts.start(
        authorized.context,
        attemptId,
        leaseHash,
        now,
        expectedRevision,
        identity.securityEpoch,
      );
    } catch {
      throw new WorkerProblemError('WORKER_ATTEMPT_AUTHORITY_UNAVAILABLE', 503);
    }
    if (!started.accepted) throw mapAttemptMutationFailure(started.code);
    const startedAttempt = validateMutationAttempt(
      started.value,
      identity,
      authorized.value,
      expectedRevision,
      now,
      undefined,
      true,
    );
    boundedInitialLease(startedAttempt.leaseExpiresAt, now);
    let grant: WorkerInputGrantV1;
    try {
      grant = await this.dependencies.grants.issueInputGrant(
        identity,
        authorized.value.job,
        startedAttempt,
        authorized.value.descriptorInputObjectIds,
      );
    } catch {
      throw new WorkerProblemError('WORKER_OBJECT_GRANT_UNAVAILABLE', 503);
    }
    // IAE stamps a newly issued capability at the moment it signs it. The
    // grant call can cross the millisecond boundary after the authorization
    // snapshot above; validate against a fresh server timestamp so a valid
    // capability is not rejected as "issued in the future".
    validateInputGrant(grant, identity, authorized.value, startedAttempt, this.now());
    let workloadEnvelopeId: StableIdentifierV1 | undefined;
    let workloadEnvelopeHash: string | undefined;
    if (this.dependencies.workloadEnvelope !== undefined) {
      let resolved: Awaited<ReturnType<WorkerWorkloadEnvelopeAuthorityPortV1['resolve']>>;
      try {
        resolved = await this.dependencies.workloadEnvelope.resolve({
          identity,
          attemptId,
          descriptorId,
          descriptorHash,
          attemptBindingHash,
          now,
        });
      } catch {
        throw new WorkerProblemError('WORKER_WORKLOAD_UNAVAILABLE', 503);
      }
      if (!resolved.accepted) throw new WorkerProblemError('WORKER_WORKLOAD_UNAVAILABLE', 503);
      workloadEnvelopeId = resolved.value.workloadId;
      workloadEnvelopeHash = resolved.value.canonicalHash;
    }
    return Object.freeze({
      attemptId,
      jobId: authorized.value.job.jobId,
      leaseExpiresAt: startedAttempt.leaseExpiresAt,
      revision: startedAttempt.revision,
      inputGrant: grant,
      ...(workloadEnvelopeId === undefined
        ? {}
        : { workloadEnvelopeId, workloadEnvelopeHash: workloadEnvelopeHash! }),
    });
  }

  /**
   * Resolves the immutable server-authored workload only after rechecking the
   * current worker identity, lease, revision, descriptor binding, and deadline.
   * No worker-authored parameters or object references are accepted here.
   */
  public async workload(
    request: unknown,
    input: {
      attemptId: unknown;
      leaseToken: unknown;
      expectedRevision: unknown;
      descriptorId: unknown;
      descriptorHash: unknown;
      attemptBindingHash: unknown;
    },
  ): Promise<ExecutionWorkloadEnvelopeV1> {
    const identity = await this.identity(request);
    if (this.dependencies.workloadEnvelope === undefined)
      throw new WorkerProblemError('WORKER_WORKLOAD_UNAVAILABLE', 503);
    const attemptId = requestId(input.attemptId);
    const leaseTokenHash = tokenHash(input.leaseToken);
    const expectedRevision = revision(input.expectedRevision);
    const descriptorId = requestId(input.descriptorId);
    const descriptorHash = sha256(input.descriptorHash);
    const attemptBindingHash = sha256(input.attemptBindingHash);
    const authorized = await this.authorize(
      identity,
      'WORKLOAD',
      attemptId,
      leaseTokenHash,
      expectedRevision,
    );
    if (
      authorized.value.attempt.state !== 'RUNNING' ||
      authorized.value.descriptorId !== descriptorId ||
      authorized.value.descriptorHash !== descriptorHash ||
      authorized.value.attemptBindingHash !== attemptBindingHash
    )
      throw new WorkerProblemError('WORKER_DESCRIPTOR_BINDING_REJECTED', 409);
    const now = this.now();
    if (!strictTimestamp(now)) throw new WorkerProblemError('WORKER_BOUNDARY_UNAVAILABLE', 503);
    let resolved: ExecutionWorkloadEnvelopeResultV1;
    try {
      const resolverInput: ExecutionWorkloadEnvelopeResolverInputV1 = {
        identity,
        attemptId,
        descriptorId,
        descriptorHash,
        attemptBindingHash,
        now,
      };
      resolved = await this.dependencies.workloadEnvelope.resolve(resolverInput);
    } catch {
      throw new WorkerProblemError('WORKER_WORKLOAD_UNAVAILABLE', 503);
    }
    if (!resolved.accepted) {
      if (resolved.code === 'JRA_WORKLOAD_DESCRIPTOR_MISMATCH')
        throw new WorkerProblemError('WORKER_DESCRIPTOR_BINDING_REJECTED', 409);
      if (resolved.code === 'JRA_WORKLOAD_ENVELOPE_INVALID')
        throw new WorkerProblemError('WORKER_WORKLOAD_REJECTED', 409);
      throw new WorkerProblemError('WORKER_WORKLOAD_UNAVAILABLE', 503);
    }
    const envelope = resolved.value;
    if (
      envelope.jobId !== authorized.value.job.jobId ||
      !verifyExecutionWorkloadEnvelopeV1(envelope, {
        identity,
        descriptorId,
        descriptorHash,
        attemptId,
        attemptBindingHash,
        now,
      })
    )
      throw new WorkerProblemError('WORKER_WORKLOAD_REJECTED', 409);
    return envelope;
  }

  public async heartbeat(
    request: unknown,
    input: {
      attemptId: unknown;
      leaseToken: unknown;
      expectedRevision: unknown;
      nextLeaseExpiresAt: unknown;
    },
  ): Promise<WorkerHeartbeatResponseV1> {
    const identity = await this.identity(request);
    const attemptId = requestId(input.attemptId);
    const leaseHash = tokenHash(input.leaseToken);
    const expectedRevision = revision(input.expectedRevision);
    const authorized = await this.authorize(
      identity,
      'HEARTBEAT',
      attemptId,
      leaseHash,
      expectedRevision,
    );
    const now = this.now();
    const nextLeaseExpiresAt = boundedExtendedLease(
      input.nextLeaseExpiresAt,
      now,
      authorized.value.attempt.leaseExpiresAt,
    );
    let result: Awaited<ReturnType<WorkerAttemptMutationPortV1['heartbeat']>>;
    try {
      result = await this.dependencies.attempts.heartbeat(
        authorized.context,
        attemptId,
        leaseHash,
        now,
        nextLeaseExpiresAt,
        expectedRevision,
        identity.securityEpoch,
      );
    } catch {
      throw new WorkerProblemError('WORKER_ATTEMPT_AUTHORITY_UNAVAILABLE', 503);
    }
    if (!result.accepted) throw mapAttemptMutationFailure(result.code);
    const heartbeatAttempt = validateMutationAttempt(
      result.value,
      identity,
      authorized.value,
      expectedRevision,
      now,
      nextLeaseExpiresAt,
    );
    return Object.freeze({
      attemptId,
      leaseExpiresAt: heartbeatAttempt.leaseExpiresAt,
      revision: heartbeatAttempt.revision,
    });
  }

  public async prepareResult(
    request: unknown,
    input: {
      attemptId: unknown;
      leaseToken: unknown;
      expectedRevision: unknown;
      idempotencyKey: unknown;
      outputs: unknown;
    },
  ): Promise<WorkerPreparedResultResponseV1> {
    const identity = await this.identity(request);
    const attemptId = requestId(input.attemptId);
    const leaseTokenHash = tokenHash(input.leaseToken);
    const expectedRevision = revision(input.expectedRevision);
    const idempotencyKey = safeIdempotencyKey(input.idempotencyKey);
    const outputs = declaredOutputs(input.outputs);
    if (!this.dependencies.preparation || !this.dependencies.resultCapabilities)
      throw new WorkerProblemError('WORKER_RESULT_PREPARATION_UNAVAILABLE', 503);
    const authorized = await this.authorize(
      identity,
      'PREPARE_RESULT',
      attemptId,
      leaseTokenHash,
      expectedRevision,
    );
    const now = this.now();
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          identity.tenantScope,
          identity.workerId,
          identity.securityEpoch,
          attemptId,
          leaseTokenHash,
          expectedRevision,
          idempotencyKey,
          outputs,
        ]),
        'utf8',
      )
      .digest('hex');
    const result = await this.dependencies.preparation.prepare({
      identity,
      authorization: authorized.value,
      leaseTokenHash,
      expectedRevision,
      idempotencyKey,
      outputs,
      fingerprint,
      now,
    });
    if (!result.accepted) {
      localWorkerDiagnostic(`preparation result=${result.code}`);
      if (result.code === 'CONFLICT')
        throw new WorkerProblemError('WORKER_IDEMPOTENCY_CONFLICT', 409);
      if (result.code === 'STALE_ATTEMPT') throw new WorkerProblemError('WORKER_STALE_LEASE', 409);
      throw new WorkerProblemError('WORKER_RESULT_PREPARATION_UNAVAILABLE', 503);
    }
    const prepared = result.preparation;
    const preparedValid = !(
      prepared.attemptId !== attemptId ||
      prepared.jobId !== authorized.value.job.jobId ||
      prepared.descriptorId !== authorized.value.descriptorId ||
      prepared.descriptorHash !== authorized.value.descriptorHash ||
      prepared.attemptBindingHash !== authorized.value.attemptBindingHash ||
      !stableIdentifier(prepared.resultUsageSettlementBindingId) ||
      !tenantScopeEqual(prepared.tenantScope, identity.tenantScope) ||
      !SAFE_NAME.test(prepared.outputSchemaId) ||
      !/^[0-9a-f]{64}$/u.test(prepared.outputPolicyHash) ||
      prepared.outputs.length === 0 ||
      prepared.outputs.length > MAX_ATTESTATIONS
    );
    if (!preparedValid) {
      localWorkerDiagnostic('prepared response validation failed');
      throw new WorkerProblemError('WORKER_RESULT_PREPARATION_UNAVAILABLE', 503);
    }
    let capabilities: readonly import('./worker-result-preparation.port.js').WorkerResultWriteCapabilityV1[];
    try {
      capabilities = await this.dependencies.resultCapabilities.issue(
        identity,
        prepared,
        authorized.value.attempt.leaseExpiresAt,
      );
    } catch (error: unknown) {
      localWorkerDiagnostic(
        `capability issuer failed:${error instanceof Error ? error.name : typeof error}`,
      );
      throw new WorkerProblemError('WORKER_RESULT_PREPARATION_UNAVAILABLE', 503);
    }
    const capabilitiesValid = !(
      capabilities.length !== prepared.outputs.length ||
      capabilities.some((capability, index) => {
        const policy = prepared.outputs[index];
        return (
          !policy ||
          !safeOpaqueReference(capability.objectId) ||
          capability.objectId !== policy.objectId ||
          capability.maxBytes !== policy.maxBytes ||
          capability.outputName !== policy.outputName ||
          capability.contentSha256 !== policy.contentSha256 ||
          capability.byteLength !== policy.byteLength ||
          JSON.stringify(capability.sourceArtifactVersionIds) !==
            JSON.stringify(policy.sourceArtifactVersionIds) ||
          capability.processorVersion !== policy.processorVersion ||
          capability.dataMode !== policy.dataMode ||
          capability.payloadClass !== policy.payloadClass ||
          JSON.stringify(capability.allowedMediaTypes) !==
            JSON.stringify(policy.allowedMediaTypes) ||
          !stableIdentifier(capability.capabilityId) ||
          !strictTimestamp(capability.issuedAt) ||
          !strictTimestamp(capability.expiresAt) ||
          Date.parse(capability.expiresAt) > Date.parse(authorized.value.attempt.leaseExpiresAt) ||
          !safeCapabilityToken(capability.signedCapability)
        );
      })
    );
    if (!capabilitiesValid) {
      if (process.env['DATABREEZE_RUNTIME_PROFILE'] === 'local') {
        const mismatch = [
          ...(capabilities.length !== prepared.outputs.length
            ? [`count:${capabilities.length}/${prepared.outputs.length}`]
            : []),
          ...capabilities.map((capability, index) => {
            const policy = prepared.outputs[index];
            if (!policy) return 'missing-policy';
            const failures = [
              !safeOpaqueReference(capability.objectId) && 'object-format',
              capability.objectId !== policy.objectId && 'object',
              capability.maxBytes !== policy.maxBytes && 'maxBytes',
              capability.outputName !== policy.outputName && 'name',
              capability.contentSha256 !== policy.contentSha256 && 'sha',
              capability.byteLength !== policy.byteLength && 'length',
              JSON.stringify(capability.sourceArtifactVersionIds) !==
                JSON.stringify(policy.sourceArtifactVersionIds) && 'sources',
              capability.processorVersion !== policy.processorVersion && 'processor',
              capability.dataMode !== policy.dataMode && 'mode',
              capability.payloadClass !== policy.payloadClass && 'payload',
              JSON.stringify(capability.allowedMediaTypes) !==
                JSON.stringify(policy.allowedMediaTypes) && 'media',
              !stableIdentifier(capability.capabilityId) && 'capabilityId',
              !strictTimestamp(capability.issuedAt) && 'issuedAt',
              !strictTimestamp(capability.expiresAt) && 'expiresAt',
              Date.parse(capability.expiresAt) >
                Date.parse(authorized.value.attempt.leaseExpiresAt) && 'lease',
              !safeCapabilityToken(capability.signedCapability) && 'signature',
            ].filter((value): value is string => Boolean(value));
            return failures.join(',') || 'unknown';
          }),
        ];
        localWorkerDiagnostic(`capability mismatch:${mismatch.join('|')}`);
      }
      localWorkerDiagnostic('capability response validation failed');
      throw new WorkerProblemError('WORKER_RESULT_PREPARATION_UNAVAILABLE', 503);
    }
    return Object.freeze({
      schemaVersion: 4 as const,
      accepted: true as const,
      submissionId: prepared.submissionId,
      attemptId: prepared.attemptId,
      descriptorBindingHash: prepared.attemptBindingHash,
      expiresAt: capabilities.reduce(
        (earliest, capability) =>
          Date.parse(capability.expiresAt) < Date.parse(earliest) ? capability.expiresAt : earliest,
        capabilities[0]!.expiresAt,
      ),
      outputs: Object.freeze(
        capabilities.map((capability) =>
          Object.freeze({
            outputName: capability.outputName,
            capabilityId: capability.capabilityId,
            objectId: capability.objectId,
            maxBytes: capability.maxBytes,
            allowedMediaTypes: capability.allowedMediaTypes,
            writeCapability: capability.signedCapability,
          }),
        ),
      ),
    });
  }

  public async finalizeResult(
    request: unknown,
    input: {
      attemptId: unknown;
      leaseToken: unknown;
      expectedRevision: unknown;
      submissionId: unknown;
      descriptorBindingHash: unknown;
      idempotencyKey: unknown;
      attestations: unknown;
      resultBinding: unknown;
    },
  ): Promise<WorkerResultFinalizeResponseV1> {
    const identity = await this.identity(request);
    const attemptId = requestId(input.attemptId);
    const leaseTokenHash = tokenHash(input.leaseToken);
    const expectedRevision = revision(input.expectedRevision);
    const submissionId = requestId(input.submissionId);
    const descriptorBindingHash = sha256(input.descriptorBindingHash);
    const idempotencyKey = safeIdempotencyKey(input.idempotencyKey);
    const references = attestationReferences(input.attestations);
    const resultBinding = resultBindingEcho(input.resultBinding);
    if (!this.dependencies.finalization || !this.dependencies.attestations)
      throw new WorkerProblemError('WORKER_RESULT_FINALIZATION_UNAVAILABLE', 503);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          identity.tenantScope,
          identity.workerId,
          identity.securityEpoch,
          submissionId,
          attemptId,
          descriptorBindingHash,
          idempotencyKey,
          references,
          resultBinding,
        ]),
        'utf8',
      )
      .digest('hex');
    const replay = await this.dependencies.finalization.findResultReplay({
      identity,
      submissionId,
      attemptId,
      fingerprint,
    });
    if (replay)
      return Object.freeze({
        schemaVersion: 4,
        accepted: true,
        submissionId: replay.submissionId,
        attemptId: replay.attemptId,
        resultManifestId: replay.resultManifestId,
        resultManifestHash: replay.resultManifestHash,
        outcome: replay.outcome,
        revision: replay.attemptRevision,
      });
    const authorized = await this.authorize(
      identity,
      'FINALIZE_RESULT',
      attemptId,
      leaseTokenHash,
      expectedRevision,
    );
    if (
      authorized.value.attemptBindingHash !== descriptorBindingHash ||
      authorized.value.job.action.outputSchemaId !== resultBinding.outputSchemaId
    )
      throw new WorkerProblemError('WORKER_RESULT_BINDING_REJECTED', 409);
    const attestations: WorkerResolvedResultAttestationV1[] = [];
    for (const reference of references) {
      const attestationId = reference.attestationId;
      const value = await this.dependencies.attestations.resolveAttestation({
        tenantScope: identity.tenantScope,
        attestationId,
      });
      if (
        !value ||
        value.attestationId !== attestationId ||
        value.jobId !== authorized.value.job.jobId ||
        value.attemptId !== attemptId ||
        value.executionDescriptorId !== authorized.value.descriptorId ||
        value.executionDescriptorHash !== authorized.value.descriptorHash ||
        value.submissionId !== submissionId ||
        !tenantScopeEqual(value.tenantScope, identity.tenantScope)
      )
        throw new WorkerProblemError('WORKER_RESULT_ATTESTATION_REJECTED', 409);
      attestations.push(value);
    }
    const result = await this.dependencies.finalization.finalize({
      identity,
      authorization: authorized.value,
      leaseTokenHash,
      expectedRevision,
      submissionId,
      attemptId,
      descriptorId: authorized.value.descriptorId,
      descriptorHash: authorized.value.descriptorHash,
      attemptBindingHash: descriptorBindingHash,
      idempotencyKey,
      attestationReferences: references,
      attestations: Object.freeze(attestations),
      resultBinding,
      fingerprint,
      now: this.now(),
    });
    if (!result.accepted) {
      if (result.code === 'CONFLICT')
        throw new WorkerProblemError('WORKER_IDEMPOTENCY_CONFLICT', 409);
      if (result.code === 'STALE_ATTEMPT') throw new WorkerProblemError('WORKER_STALE_LEASE', 409);
      if (result.code === 'ATTESTATION_REJECTED')
        throw new WorkerProblemError('WORKER_RESULT_ATTESTATION_REJECTED', 409);
      throw new WorkerProblemError('WORKER_RESULT_FINALIZATION_UNAVAILABLE', 503);
    }
    return Object.freeze({
      schemaVersion: 4,
      accepted: true,
      submissionId: result.completion.submissionId,
      attemptId: result.completion.attemptId,
      resultManifestId: result.completion.resultManifestId,
      resultManifestHash: result.completion.resultManifestHash,
      outcome: result.completion.outcome,
      revision: result.completion.attemptRevision,
    });
  }

  public async complete(
    request: unknown,
    input: {
      attemptId: unknown;
      leaseToken: unknown;
      expectedRevision: unknown;
      outcome: unknown;
      resultManifestHash?: unknown;
      resultReferences: unknown;
    },
  ): Promise<WorkerCompletionV1> {
    const identity = await this.identity(request);
    const attemptId = requestId(input.attemptId);
    const leaseHash = tokenHash(input.leaseToken);
    const expectedRevision = revision(input.expectedRevision);
    const outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' = input.outcome as
      | 'SUCCEEDED'
      | 'FAILED'
      | 'CANCELLED';
    let resultManifestHash: string | undefined;
    if (outcome !== 'SUCCEEDED' && outcome !== 'FAILED' && outcome !== 'CANCELLED')
      throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
    if (
      input.resultManifestHash !== undefined &&
      (typeof input.resultManifestHash !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(input.resultManifestHash))
    )
      throw new WorkerProblemError('WORKER_INVALID_PAYLOAD', 400);
    if (input.resultManifestHash !== undefined) resultManifestHash = input.resultManifestHash;
    const references = resultReferences(input.resultReferences);
    if (outcome === 'SUCCEEDED' && (resultManifestHash !== undefined || references.length > 0))
      throw new WorkerProblemError('WORKER_RESULT_PROTOCOL_REQUIRED', 409);
    if (outcome !== 'SUCCEEDED' && (resultManifestHash !== undefined || references.length > 0))
      throw new WorkerProblemError('WORKER_RESULT_BINDING_REJECTED', 409);
    const now = this.now();
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          identity.tenantScope,
          identity.workerId,
          identity.securityEpoch,
          attemptId,
          leaseHash,
          expectedRevision,
          outcome,
          resultManifestHash ?? null,
          references,
        ]),
        'utf8',
      )
      .digest('hex');

    let replay: WorkerCompletionV1 | undefined;
    try {
      const replayLookup: WorkerCompletionReplayLookupV1 = {
        identity,
        attemptId,
        leaseTokenHash: leaseHash,
        expectedRevision,
        outcome,
        ...(resultManifestHash === undefined ? {} : { resultManifestHash }),
        resultReferences: references,
        fingerprint,
        now,
      };
      replay = await this.dependencies.completion.findReplay(replayLookup);
    } catch {
      throw new WorkerProblemError('WORKER_COMPLETION_UNAVAILABLE', 503);
    }
    if (replay !== undefined)
      return validateCompletionBinding(
        replay,
        attemptId,
        expectedRevision,
        outcome,
        resultManifestHash,
        references,
      );

    const authorized = await this.authorize(
      identity,
      'COMPLETE',
      attemptId,
      leaseHash,
      expectedRevision,
    );
    let result: Awaited<ReturnType<WorkerCompletionTransactionPortV1['complete']>>;
    try {
      result = await this.dependencies.completion.complete({
        identity,
        authorization: authorized.value,
        leaseTokenHash: leaseHash,
        expectedRevision,
        outcome,
        ...(resultManifestHash === undefined ? {} : { resultManifestHash }),
        resultReferences: references,
        fingerprint,
        now,
      });
    } catch {
      throw new WorkerProblemError('WORKER_COMPLETION_UNAVAILABLE', 503);
    }
    if (!result.accepted) throw mapCompletionFailure(result.code);
    const completion = validateCompletionBinding(
      result.completion,
      attemptId,
      expectedRevision,
      outcome,
      resultManifestHash,
      references,
    );
    if (result.replayed) return completion;
    validateOutputGrants(result.outputGrants, identity, authorized.value, references, now);
    if (JSON.stringify(completion.resultReferences) !== JSON.stringify(references))
      throw new WorkerProblemError('WORKER_OBJECT_GRANT_REJECTED', 503);
    return completion;
  }
}

/** Production composition uses this when the durable JRA/authenticator ports are not wired. */
export class UnavailableWorkerBoundary implements WorkerBoundaryPortV1 {
  public assignment(): Promise<never> {
    return Promise.reject(new WorkerProblemError('WORKER_BOUNDARY_UNAVAILABLE', 503));
  }

  public claim(): Promise<never> {
    return Promise.reject(new WorkerProblemError('WORKER_BOUNDARY_UNAVAILABLE', 503));
  }

  public workload(): Promise<never> {
    return Promise.reject(new WorkerProblemError('WORKER_BOUNDARY_UNAVAILABLE', 503));
  }

  public heartbeat(): Promise<never> {
    return Promise.reject(new WorkerProblemError('WORKER_BOUNDARY_UNAVAILABLE', 503));
  }

  public prepareResult(): Promise<never> {
    return Promise.reject(new WorkerProblemError('WORKER_BOUNDARY_UNAVAILABLE', 503));
  }

  public finalizeResult(): Promise<never> {
    return Promise.reject(new WorkerProblemError('WORKER_BOUNDARY_UNAVAILABLE', 503));
  }

  public complete(): Promise<never> {
    return Promise.reject(new WorkerProblemError('WORKER_BOUNDARY_UNAVAILABLE', 503));
  }
}

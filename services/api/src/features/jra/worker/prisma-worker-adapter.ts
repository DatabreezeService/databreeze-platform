import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  completeExecutionAttemptV1,
  createExecutionAttemptV1,
  expireExecutionAttemptV1,
  startExecutionAttemptV1,
  renewExecutionAttemptLeaseV1,
  type ExecutionAttemptResultV1,
  type ExecutionAttemptV1,
} from '@databreeze/domain/execution-attempt/v1';
import {
  createJobV1,
  createTypedActionDefinitionV1,
  transitionJobV1,
  type JobV1,
} from '@databreeze/domain/jobs/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import { createResultManifestV1, type ResultManifestV1 } from '@databreeze/domain/result-manifest/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import {
  createExecutionRequestDescriptorV1,
  executionRequestDescriptorMatchesJobV1,
  type ExecutionRequestDescriptorV1,
} from '../application/execution-request-descriptor.js';
import { workerAttemptDescriptorBindingHashV1 } from './execution-descriptor-binding.js';
import type {
  WorkerPreparedResultV1,
  WorkerResultPreparationInputV1,
  WorkerResultPreparationPortV1,
  WorkerResultPreparationResultV1,
} from './worker-result-preparation.port.js';
import type {
  WorkerResultCompletionV1,
  WorkerResultFinalizationInputV1,
  WorkerResultFinalizationPortV1,
  WorkerResultFinalizationReplayInputV1,
  WorkerResultFinalizationResultV1,
  WorkerVerifiedResultManifestPortV1,
  WorkerVerifiedResultManifestV1,
} from './worker-result-finalization.port.js';
import type {
  WorkerAttemptAuthorizationV1,
  WorkerAttemptAuthorityPortV1,
  WorkerAttemptMutationPortV1,
  WorkerAssignmentPortV1,
  WorkerAssignmentV1,
  WorkerCompletionReplayLookupV1,
  WorkerCompletionTransactionInputV1,
  WorkerCompletionTransactionPortV1,
  WorkerCompletionTransactionResultV1,
  WorkerCompletionV1,
  WorkerIdentityV1,
  WorkerObjectGrantAuthorityPortV1,
  WorkerOperationV1,
  WorkerOutputGrantV1,
  WorkerSecurityEpochPortV1,
} from './worker-ports.js';

export interface JraWorkerActionDatabaseRowV1 {
  readonly id: string;
  readonly actionType: string;
  readonly version: number;
  readonly inputSchemaId: string;
  readonly outputSchemaId: string;
  readonly handlerDigest: string;
  readonly requiredCapabilities: unknown;
  readonly sideEffectClass: string;
  readonly riskClass: string;
  readonly defaultTimeoutSeconds: number;
  readonly maxAttempts: number;
  readonly approvalClass: string;
  readonly createdAt: Date;
}

export interface JraWorkerJobDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly requestedBy: string;
  readonly actionType: string;
  readonly actionVersion: number;
  readonly inputManifestHash: string;
  readonly idempotencyKey: string;
  readonly state: string;
  readonly revision: number;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
}

export interface JraWorkerAttemptDatabaseRowV1 {
  readonly id: string;
  readonly jobId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly attemptNumber: number;
  readonly executorType: string;
  readonly executorId: string;
  readonly leaseTokenHash: string;
  readonly leaseExpiresAt: Date;
  readonly state: string;
  readonly createdAt: Date;
  readonly heartbeatAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly resultManifestHash: string | null;
  readonly revision: number;
}

export interface JraWorkerExecutionRequestDatabaseRowV1 {
  readonly id: string;
  readonly resultUsageSettlementBindingId: string;
  readonly jobId: string;
  readonly stepId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly actionType: string;
  readonly actionVersion: number;
  readonly inputSchemaId: string;
  readonly outputSchemaId: string;
  readonly handlerDigest: string;
  readonly requiredCapabilities: unknown;
  readonly sideEffectClass: string;
  readonly riskClass: string;
  readonly inputObjectIds: unknown;
  readonly inputManifestHash: string;
  readonly parameters: unknown;
  readonly outputObjectId: string;
  readonly outputMaxBytes: number;
  readonly outputMediaType: string;
  readonly deadline: Date;
  readonly locale: string;
  readonly canonicalHash: string;
  readonly createdAt: Date;
}

export interface JraWorkerCompletionDatabaseRowV1 {
  readonly id: string;
  readonly jobId: string;
  readonly attemptId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly workerId: string;
  readonly securityEpoch: number;
  readonly leaseTokenHash: string;
  readonly expectedRevision: number;
  readonly completionRevision: number;
  readonly outcome: string;
  readonly resultManifestHash: string | null;
  readonly resultReferences: unknown;
  readonly fingerprint: string;
  readonly createdAt: Date;
}

export interface JraWorkerTransitionDatabaseRowV1 {
  readonly id: string;
  readonly jobId: string;
  readonly fromState: string | null;
  readonly toState: string;
  readonly actorId: string;
  readonly occurredAt: Date;
  readonly revision: number;
}

export interface JraWorkerOutboxDatabaseRowV1 {
  readonly id: string;
  readonly jobId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly createdAt: Date;
  readonly deliveredAt: Date | null;
}

export interface JraWorkerResultManifestDatabaseRowV1 {
  readonly id: string;
  readonly jobId: string;
  readonly attemptId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly manifestHash: string;
  readonly sourceArtifactVersionIds: unknown;
  readonly outputIds: unknown;
  readonly outputHashes: unknown;
  readonly evidenceCoverage: string;
  readonly handlerDigest: string;
  readonly engineVersion: string;
  readonly attemptNumber: number;
  readonly reviewerId: string | null;
  readonly approvalState: string;
  readonly generatedAt: Date;
}

export interface JraWorkerResultPreparationDatabaseRowV1 {
  readonly submissionId: string;
  readonly jobId: string;
  readonly attemptId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly workerId: string;
  readonly securityEpoch: number;
  readonly leaseTokenHash: string;
  readonly expectedRevision: number;
  readonly descriptorId: string;
  readonly descriptorHash: string;
  readonly attemptBindingHash: string;
  readonly resultUsageSettlementBindingId: string;
  readonly outputSchemaId: string;
  readonly outputPolicy: unknown;
  readonly outputPolicyHash: string;
  readonly subjectBindings: unknown;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly createdAt: Date;
}

export interface JraWorkerResultFinalizationDatabaseRowV1 {
  readonly submissionId: string;
  readonly jobId: string;
  readonly attemptId: string;
  readonly resultManifestId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly workerId: string;
  readonly securityEpoch: number;
  readonly descriptorId: string;
  readonly descriptorHash: string;
  readonly outputSchemaId: string;
  readonly engineVersion: string;
  readonly sourceArtifactVersionIds: unknown;
  readonly sourceLineageHash: string;
  readonly subjectBindings: unknown;
  readonly attestationReferences: unknown;
  readonly fingerprint: string;
  readonly resultManifestHash: string;
  readonly attemptRevision: number;
  readonly jobRevision: number;
  readonly finalizedAt: Date;
}

interface JraWorkerDelegate<TValue> {
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<TValue | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<readonly TValue[]>;
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<TValue>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
}

export interface JraWorkerDatabaseClientV1 {
  readonly typedActionDefinitionRecord: JraWorkerDelegate<JraWorkerActionDatabaseRowV1>;
  readonly jobRecord: JraWorkerDelegate<JraWorkerJobDatabaseRowV1>;
  readonly executionAttemptRecord: JraWorkerDelegate<JraWorkerAttemptDatabaseRowV1>;
  readonly executionRequestDescriptorRecord: JraWorkerDelegate<JraWorkerExecutionRequestDatabaseRowV1>;
  readonly workerCompletionRecord: JraWorkerDelegate<JraWorkerCompletionDatabaseRowV1>;
  readonly workerResultPreparationRecord?: JraWorkerDelegate<JraWorkerResultPreparationDatabaseRowV1>;
  readonly workerResultFinalizationRecord?: JraWorkerDelegate<JraWorkerResultFinalizationDatabaseRowV1>;
  readonly jobTransitionRecord: JraWorkerDelegate<JraWorkerTransitionDatabaseRowV1>;
  readonly jobOutboxRecord: JraWorkerDelegate<JraWorkerOutboxDatabaseRowV1>;
  readonly resultManifestRecord?: JraWorkerDelegate<JraWorkerResultManifestDatabaseRowV1>;
  $transaction<TValue>(
    work: (transaction: JraWorkerDatabaseClientV1) => Promise<TValue>,
    options?: { readonly isolationLevel?: 'Serializable' },
  ): Promise<TValue>;
}

export interface WorkerResultFinalizationEffectV1 {
  readonly tenantScope: TenantScopeV1;
  readonly actorId: StableIdentifierV1;
  readonly authorizationEpoch: number;
  readonly correlationId: StableIdentifierV1;
  readonly jobId: StableIdentifierV1;
  readonly attemptId: StableIdentifierV1;
  readonly submissionId: StableIdentifierV1;
  readonly resultManifestId: StableIdentifierV1;
  readonly resultManifestHash: string;
  readonly jobRevision: number;
  readonly resultUsageSettlementBindingId: StableIdentifierV1;
  readonly artifactVersionIds: readonly StableIdentifierV1[];
  readonly outputBytes: number;
  readonly occurredAt: string;
}

/** AUD and BUA adapters must use this exact transaction client; throwing rolls JRA back. */
export interface WorkerResultFinalizationEffectsPortV1 {
  commit(
    transaction: JraWorkerDatabaseClientV1,
    effect: WorkerResultFinalizationEffectV1,
  ): Promise<void>;
}

interface LoadedWorkerAttempt {
  readonly attempt: ExecutionAttemptV1;
  readonly job: JobV1;
  readonly latestAttemptId: StableIdentifierV1;
  readonly descriptor: ExecutionRequestDescriptorV1;
}

const WORKER_JOB_STATES = new Set(['DISPATCHED', 'RUNNING']);
const ATTEMPT_STATES = new Set([
  'CLAIMED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
]);
const JOB_STATES = new Set([
  'CREATED',
  'QUEUED',
  'WAITING_FOR_DEVICE',
  'DISPATCHED',
  'RUNNING',
  'NEEDS_REVIEW',
  'AWAITING_APPROVAL',
  'SUCCEEDED',
  'PARTIALLY_SUCCEEDED',
  'FAILED',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'EXPIRED',
]);
const OUTCOMES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);
const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/u;
const RESULT_SUBJECT_BINDINGS = new Set([
  'dashboardId',
  'dashboardVersionId',
  'widgetId',
  'planVersionId',
  'metricVersionId',
  'datasetVersionId',
  'permissionProjectionVersionId',
  'policyVersionId',
  'locale',
  'timezone',
  'inputSelectorHash',
  'engineVersion',
  'handlerDigest',
]);

type WorkerCompletionRollbackCode =
  | 'STALE_ATTEMPT'
  | 'ATTEMPT_REJECTED'
  | 'OBJECT_GRANT_REJECTED'
  | 'OBJECT_GRANT_UNAVAILABLE';

class WorkerCompletionRollback extends Error {
  public constructor(readonly code: WorkerCompletionRollbackCode) {
    super(code);
    this.name = 'WorkerCompletionRollback';
  }
}

function databaseScope(scope: TenantScopeV1): Readonly<Record<string, unknown>> {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  };
}

function rowScope(row: {
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
}): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('JRA_PERSISTED_WORKER_SCOPE_INVALID');
  return parsed.value;
}

function timestamp(value: Date | null, code: string): StrictUtcTimestampV1 | undefined {
  if (value === null) return undefined;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(code);
  const parsed = parseStrictUtcTimestampV1(value.toISOString());
  if (!parsed.accepted) throw new Error(code);
  return parsed.value;
}

function requiredTimestamp(value: Date, code: string): StrictUtcTimestampV1 {
  const parsed = timestamp(value, code);
  if (!parsed) throw new Error(code);
  return parsed;
}

function rowAction(row: JraWorkerActionDatabaseRowV1) {
  const parsed = createTypedActionDefinitionV1({
    actionType: row.actionType,
    version: row.version,
    inputSchemaId: row.inputSchemaId,
    outputSchemaId: row.outputSchemaId,
    handlerDigest: row.handlerDigest,
    requiredCapabilities: row.requiredCapabilities,
    sideEffectClass: row.sideEffectClass,
    riskClass: row.riskClass,
    defaultTimeoutSeconds: row.defaultTimeoutSeconds,
    maxAttempts: row.maxAttempts,
    approvalClass: row.approvalClass,
  });
  if (!parsed.accepted) throw new Error('JRA_PERSISTED_WORKER_ACTION_INVALID');
  return parsed.value;
}

function rowJob(row: JraWorkerJobDatabaseRowV1, actionRow: JraWorkerActionDatabaseRowV1): JobV1 {
  if (!JOB_STATES.has(row.state) || !Number.isSafeInteger(row.revision) || row.revision < 1)
    throw new Error('JRA_PERSISTED_WORKER_JOB_INVALID');
  const parsed = createJobV1({
    jobId: row.id,
    tenantScope: rowScope(row),
    requestedBy: row.requestedBy,
    action: rowAction(actionRow),
    inputManifestHash: row.inputManifestHash,
    idempotencyKey: row.idempotencyKey,
    createdAt: requiredTimestamp(row.createdAt, 'JRA_PERSISTED_WORKER_JOB_INVALID'),
  });
  if (!parsed.accepted) throw new Error('JRA_PERSISTED_WORKER_JOB_INVALID');
  const startedAt = timestamp(row.startedAt, 'JRA_PERSISTED_WORKER_JOB_INVALID');
  const finishedAt = timestamp(row.finishedAt, 'JRA_PERSISTED_WORKER_JOB_INVALID');
  if (row.state === 'RUNNING' && !startedAt) throw new Error('JRA_PERSISTED_WORKER_JOB_INVALID');
  if (
    (row.state === 'SUCCEEDED' ||
      row.state === 'PARTIALLY_SUCCEEDED' ||
      row.state === 'FAILED' ||
      row.state === 'CANCELLED' ||
      row.state === 'EXPIRED') &&
    !finishedAt
  )
    throw new Error('JRA_PERSISTED_WORKER_JOB_INVALID');
  return Object.freeze({
    ...parsed.value,
    state: row.state as JobV1['state'],
    revision: row.revision,
    ...(startedAt ? { startedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
  });
}

function rowExecutionRequestDescriptor(
  row: JraWorkerExecutionRequestDatabaseRowV1,
  job: JobV1,
): ExecutionRequestDescriptorV1 {
  const parsed = createExecutionRequestDescriptorV1({
    schemaVersion: 1,
    descriptorId: row.id,
    resultUsageSettlementBindingId: row.resultUsageSettlementBindingId,
    tenantScope: rowScope(row),
    jobId: row.jobId,
    stepId: row.stepId,
    action: {
      type: row.actionType,
      version: row.actionVersion,
      inputSchemaId: row.inputSchemaId,
      outputSchemaId: row.outputSchemaId,
      handlerDigest: row.handlerDigest,
      requiredCapabilities: row.requiredCapabilities,
      sideEffectClass: row.sideEffectClass,
      riskClass: row.riskClass,
    },
    inputObjectIds: row.inputObjectIds,
    inputManifestHash: row.inputManifestHash,
    parameters: row.parameters,
    outputPolicy: {
      outputObjectId: row.outputObjectId,
      maxBytes: row.outputMaxBytes,
      mediaType: row.outputMediaType,
    },
    deadline: requiredTimestamp(row.deadline, 'JRA_PERSISTED_EXECUTION_REQUEST_INVALID'),
    locale: row.locale,
    createdAt: requiredTimestamp(row.createdAt, 'JRA_PERSISTED_EXECUTION_REQUEST_INVALID'),
  });
  if (
    !parsed.accepted ||
    parsed.value.canonicalHash !== row.canonicalHash ||
    !executionRequestDescriptorMatchesJobV1(parsed.value, job)
  )
    throw new Error('JRA_PERSISTED_EXECUTION_REQUEST_INVALID');
  return parsed.value;
}

function rowAttempt(row: JraWorkerAttemptDatabaseRowV1): ExecutionAttemptV1 {
  if (!ATTEMPT_STATES.has(row.state) || !Number.isSafeInteger(row.revision) || row.revision < 1)
    throw new Error('JRA_PERSISTED_WORKER_ATTEMPT_INVALID');
  const parsed = startAttempt(row);
  if (!parsed.accepted) throw new Error('JRA_PERSISTED_WORKER_ATTEMPT_INVALID');
  const startedAt = timestamp(row.startedAt, 'JRA_PERSISTED_WORKER_ATTEMPT_INVALID');
  const finishedAt = timestamp(row.finishedAt, 'JRA_PERSISTED_WORKER_ATTEMPT_INVALID');
  if (row.state === 'RUNNING' && !startedAt)
    throw new Error('JRA_PERSISTED_WORKER_ATTEMPT_INVALID');
  if (
    (row.state === 'SUCCEEDED' ||
      row.state === 'FAILED' ||
      row.state === 'CANCELLED' ||
      row.state === 'EXPIRED') &&
    !finishedAt
  )
    throw new Error('JRA_PERSISTED_WORKER_ATTEMPT_INVALID');
  if (row.resultManifestHash !== null && !/^[0-9a-f]{64}$/u.test(row.resultManifestHash))
    throw new Error('JRA_PERSISTED_WORKER_ATTEMPT_INVALID');
  return Object.freeze({
    ...parsed.value,
    state: row.state as ExecutionAttemptV1['state'],
    revision: row.revision,
    ...(startedAt ? { startedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    ...(row.resultManifestHash === null ? {} : { resultManifestHash: row.resultManifestHash }),
  });
}

function startAttempt(
  row: JraWorkerAttemptDatabaseRowV1,
): ExecutionAttemptResultV1<ExecutionAttemptV1> {
  const parsed = createExecutionAttemptV1({
    attemptId: row.id,
    jobId: row.jobId,
    tenantScope: rowScope(row),
    attemptNumber: row.attemptNumber,
    executorType: row.executorType,
    executorId: row.executorId,
    leaseTokenHash: row.leaseTokenHash,
    leaseExpiresAt: requiredTimestamp(row.leaseExpiresAt, 'JRA_PERSISTED_WORKER_ATTEMPT_INVALID'),
    createdAt: requiredTimestamp(row.createdAt, 'JRA_PERSISTED_WORKER_ATTEMPT_INVALID'),
  });
  if (!parsed.accepted) return parsed;
  return {
    accepted: true,
    value: Object.freeze({
      ...parsed.value,
      heartbeatAt: requiredTimestamp(row.heartbeatAt, 'JRA_PERSISTED_WORKER_ATTEMPT_INVALID'),
      revision: row.revision,
    }),
  };
}

function active(attempt: ExecutionAttemptV1): boolean {
  return attempt.state === 'CLAIMED' || attempt.state === 'RUNNING';
}

function exactReferenceList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length > 128) return undefined;
  if (
    value.some(
      (candidate) =>
        typeof candidate !== 'string' ||
        !OPAQUE_REFERENCE.test(candidate) ||
        candidate.includes('..'),
    )
  )
    return undefined;
  return Object.freeze(value.map((candidate) => candidate as string));
}

function exactKeys(value: object, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JRA_RESULT_NON_FINITE_VALUE');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value !== 'object') throw new Error('JRA_RESULT_INVALID_VALUE');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function canonicalHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function descriptorOutputPolicy(descriptor: ExecutionRequestDescriptorV1) {
  return descriptor.outputPolicy;
}

function descriptorOutputLineageAuthority(
  descriptor: ExecutionRequestDescriptorV1,
):
  | Readonly<{
      sourceArtifactVersionIds: readonly StableIdentifierV1[];
      processorVersion: string;
      dataMode: 'Hybrid' | 'Cloud';
      payloadClass:
        | 'RECONSTRUCTABLE_DERIVED_CONTENT'
        | 'APPROVED_DERIVED_RESULT';
      sourceLineageHash: string;
    }>
  | undefined {
  const parsedSources = descriptor.inputObjectIds.map((value) => parseStableIdentifierV1(value));
  const processorVersion = descriptor.parameters['engineVersion'];
  const dataMode = descriptor.parameters['dataMode'];
  const payloadClass = descriptor.parameters['payloadClass'];
  if (
    parsedSources.length === 0 ||
    parsedSources.some((value) => !value.accepted) ||
    typeof processorVersion !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$/u.test(processorVersion) ||
    (dataMode !== 'Hybrid' && dataMode !== 'Cloud') ||
    (payloadClass !== 'RECONSTRUCTABLE_DERIVED_CONTENT' &&
      payloadClass !== 'APPROVED_DERIVED_RESULT')
  )
    return undefined;
  const sourceArtifactVersionIds = Object.freeze(
    parsedSources.map((value) => (value as { accepted: true; value: StableIdentifierV1 }).value),
  );
  return Object.freeze({
    sourceArtifactVersionIds,
    processorVersion,
    dataMode,
    payloadClass,
    sourceLineageHash: createHash('sha256')
      .update(JSON.stringify({ sourceArtifactVersionIds, processorVersion }), 'utf8')
      .digest('hex'),
  });
}

function descriptorSubjectBindings(
  descriptor: ExecutionRequestDescriptorV1,
): Readonly<Record<string, string>> {
  const bindings: Record<string, string> = {
    locale: descriptor.locale,
    handlerDigest: descriptor.action.handlerDigest,
  };
  for (const [key, value] of Object.entries(descriptor.parameters)) {
    if (RESULT_SUBJECT_BINDINGS.has(key) && typeof value === 'string') bindings[key] = value;
  }
  return Object.freeze(Object.fromEntries(Object.entries(bindings).sort(([a], [b]) => a.localeCompare(b))));
}

function stringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  if (
    entries.some(
      ([key, entry]) =>
        !RESULT_SUBJECT_BINDINGS.has(key) ||
        typeof entry !== 'string' ||
        entry.length === 0 ||
        entry.length > 256,
    )
  )
    return undefined;
  return Object.freeze(Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))));
}

function preparedFromRow(
  row: JraWorkerResultPreparationDatabaseRowV1,
): WorkerPreparedResultV1 | undefined {
  const submissionId = parseStableIdentifierV1(row.submissionId);
  const attemptId = parseStableIdentifierV1(row.attemptId);
  const jobId = parseStableIdentifierV1(row.jobId);
  const descriptorId = parseStableIdentifierV1(row.descriptorId);
  const resultUsageSettlementBindingId = parseStableIdentifierV1(
    row.resultUsageSettlementBindingId,
  );
  const outputPolicy = row.outputPolicy;
  const subjectBindings = stringRecord(row.subjectBindings);
  if (
    !submissionId.accepted ||
    !attemptId.accepted ||
    !jobId.accepted ||
    !descriptorId.accepted ||
    !resultUsageSettlementBindingId.accepted ||
    !Array.isArray(outputPolicy) ||
    outputPolicy.length === 0 ||
    !subjectBindings ||
    !/^[0-9a-f]{64}$/u.test(row.descriptorHash) ||
    !/^[0-9a-f]{64}$/u.test(row.attemptBindingHash) ||
    !/^[0-9a-f]{64}$/u.test(row.outputPolicyHash)
  )
    return undefined;
  const outputs = outputPolicy.map((candidate) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return undefined;
    const output = candidate as Record<string, unknown>;
    if (
      !['JSON_RESULT', 'BINARY_RESULT'].includes(output['kind'] as string) ||
      typeof output['outputName'] !== 'string' ||
      typeof output['schemaId'] !== 'string' ||
      typeof output['objectId'] !== 'string' ||
      !OPAQUE_REFERENCE.test(output['objectId']) ||
      !Number.isSafeInteger(output['maxBytes']) ||
      (output['maxBytes'] as number) < 1 ||
      !Array.isArray(output['allowedMediaTypes']) ||
      typeof output['mediaType'] !== 'string' ||
      typeof output['contentSha256'] !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(output['contentSha256']) ||
      !Number.isSafeInteger(output['byteLength']) ||
      typeof output['sourceLineageHash'] !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(output['sourceLineageHash']) ||
      !Array.isArray(output['sourceArtifactVersionIds']) ||
      output['sourceArtifactVersionIds'].length === 0 ||
      output['sourceArtifactVersionIds'].some(
        (value) => !parseStableIdentifierV1(value).accepted,
      ) ||
      typeof output['processorVersion'] !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$/u.test(output['processorVersion']) ||
      (output['dataMode'] !== 'Hybrid' && output['dataMode'] !== 'Cloud') ||
      (output['payloadClass'] !== 'RECONSTRUCTABLE_DERIVED_CONTENT' &&
        output['payloadClass'] !== 'APPROVED_DERIVED_RESULT')
    ) return undefined;
    return Object.freeze({
      kind: output['kind'] as 'JSON_RESULT' | 'BINARY_RESULT', outputName: output['outputName'],
      schemaId: output['schemaId'], mediaType: output['mediaType'],
      contentSha256: output['contentSha256'], byteLength: output['byteLength'] as number,
      sourceLineageHash: output['sourceLineageHash'], objectId: output['objectId'],
      maxBytes: output['maxBytes'] as number,
      allowedMediaTypes: Object.freeze([...(output['allowedMediaTypes'] as string[])]),
      sourceArtifactVersionIds: Object.freeze(
        (output['sourceArtifactVersionIds'] as string[]).map(
          (value) =>
            (parseStableIdentifierV1(value) as {
              accepted: true;
              value: StableIdentifierV1;
            }).value,
        ),
      ),
      processorVersion: output['processorVersion'],
      dataMode: output['dataMode'],
      payloadClass: output['payloadClass'],
    });
  });
  if (outputs.some((value) => value === undefined)) return undefined;
  return Object.freeze({
    submissionId: submissionId.value,
    attemptId: attemptId.value,
    jobId: jobId.value,
    tenantScope: rowScope(row),
    descriptorId: descriptorId.value,
    descriptorHash: row.descriptorHash,
    attemptBindingHash: row.attemptBindingHash,
    resultUsageSettlementBindingId: resultUsageSettlementBindingId.value,
    outputPolicyHash: row.outputPolicyHash,
    outputSchemaId: row.outputSchemaId,
    subjectBindings,
    outputs: Object.freeze(outputs as NonNullable<(typeof outputs)[number]>[]),
  });
}

function finalizationCompletion(
  row: JraWorkerResultFinalizationDatabaseRowV1,
): WorkerResultCompletionV1 | undefined {
  const submissionId = parseStableIdentifierV1(row.submissionId);
  const manifestId = parseStableIdentifierV1(row.resultManifestId);
  const attemptId = parseStableIdentifierV1(row.attemptId);
  const jobId = parseStableIdentifierV1(row.jobId);
  const references = Array.isArray(row.attestationReferences) ? row.attestationReferences : [];
  const artifactIds = references.map((value) =>
    typeof value === 'object' && value !== null
      ? parseStableIdentifierV1((value as Record<string, unknown>)['artifactVersionId'])
      : { accepted: false as const },
  );
  if (
    !submissionId.accepted ||
    !manifestId.accepted ||
    !attemptId.accepted ||
    !jobId.accepted ||
    artifactIds.length === 0 ||
    artifactIds.some((value) => !value.accepted) ||
    !/^[0-9a-f]{64}$/u.test(row.resultManifestHash)
  )
    return undefined;
  return Object.freeze({
    submissionId: submissionId.value,
    resultManifestId: manifestId.value,
    resultManifestHash: row.resultManifestHash,
    attemptId: attemptId.value,
    jobId: jobId.value,
    outcome: 'SUCCEEDED' as const,
    attemptRevision: row.attemptRevision,
    jobRevision: row.jobRevision,
    artifactVersionIds: Object.freeze(
      artifactIds.map((value) => (value as { accepted: true; value: StableIdentifierV1 }).value),
    ),
  });
}

function exactGrantScope(value: unknown): TenantScopeV1 | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const keys =
    record['scopeType'] === 'organization'
      ? ['scopeType', 'organizationId']
      : record['scopeType'] === 'workspace'
        ? ['scopeType', 'organizationId', 'workspaceId']
        : record['scopeType'] === 'project'
          ? ['scopeType', 'organizationId', 'workspaceId', 'projectId']
          : undefined;
  if (keys === undefined || !exactKeys(record, keys)) return undefined;
  const parsed = parseTenantScopeV1(record);
  return parsed.accepted ? parsed.value : undefined;
}

function equalScope(left: TenantScopeV1, right: TenantScopeV1): boolean {
  return tenantScopesEqualV1(left, right);
}

function attemptData(attempt: ExecutionAttemptV1): Readonly<Record<string, unknown>> {
  return {
    state: attempt.state,
    leaseExpiresAt: new Date(attempt.leaseExpiresAt),
    heartbeatAt: new Date(attempt.heartbeatAt),
    startedAt: attempt.startedAt ? new Date(attempt.startedAt) : null,
    finishedAt: attempt.finishedAt ? new Date(attempt.finishedAt) : null,
    resultManifestHash: attempt.resultManifestHash ?? null,
    revision: attempt.revision,
  };
}

function completionData(
  input: WorkerCompletionTransactionInputV1,
  completion: WorkerCompletionV1,
): Readonly<Record<string, unknown>> {
  return {
    id: randomUUID(),
    jobId: input.authorization.job.jobId,
    attemptId: input.authorization.attempt.attemptId,
    ...databaseScope(input.identity.tenantScope),
    workerId: input.identity.workerId,
    securityEpoch: input.identity.securityEpoch,
    leaseTokenHash: input.leaseTokenHash,
    expectedRevision: input.expectedRevision,
    completionRevision: completion.revision,
    outcome: completion.outcome,
    resultManifestHash: completion.resultManifestHash ?? null,
    resultReferences: completion.resultReferences,
    fingerprint: input.fingerprint,
    createdAt: new Date(input.now),
  };
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function identityFromContext(
  context: IamTenantContextV1,
  securityEpoch: number | undefined,
): WorkerIdentityV1 {
  return {
    workerId: context.actorId,
    tenantScope: context.tenantScope,
    securityEpoch: securityEpoch ?? context.authorizationEpoch,
    correlationId: context.correlationId,
  };
}

function mapAttemptFailure(code: string): ExecutionAttemptResultV1<ExecutionAttemptV1> {
  if (code === 'INVALID_REVISION') return { accepted: false, code: 'INVALID_REVISION' };
  if (code === 'LEASE_EXPIRED') return { accepted: false, code: 'LEASE_EXPIRED' };
  if (code === 'INVALID_LEASE') return { accepted: false, code: 'INVALID_LEASE' };
  return { accepted: false, code: 'INVALID_STATE' };
}

function authorizationMatches(
  left: WorkerAttemptAuthorizationV1,
  right: LoadedWorkerAttempt,
  identity: WorkerIdentityV1,
  leaseTokenHash: string,
  expectedRevision: number,
): boolean {
  return (
    left.attempt.attemptId === right.attempt.attemptId &&
    left.attempt.executorId === identity.workerId &&
    left.attempt.leaseTokenHash === leaseTokenHash &&
    left.attempt.revision === expectedRevision &&
    left.attempt.revision === right.attempt.revision &&
    left.attempt.attemptNumber === right.attempt.attemptNumber &&
    left.attempt.executorType === right.attempt.executorType &&
    left.attempt.state === right.attempt.state &&
    left.attempt.leaseExpiresAt === right.attempt.leaseExpiresAt &&
    left.attempt.heartbeatAt === right.attempt.heartbeatAt &&
    left.job.jobId === right.job.jobId &&
    left.job.state === right.job.state &&
    left.job.revision === right.job.revision &&
    left.latestAttemptId === right.latestAttemptId &&
    left.workerSecurityEpoch === identity.securityEpoch &&
    left.descriptorId === right.descriptor.descriptorId &&
    left.descriptorHash === right.descriptor.canonicalHash &&
    left.attemptBindingHash ===
      workerAttemptDescriptorBindingHashV1({
        descriptorHash: right.descriptor.canonicalHash,
        attemptId: right.attempt.attemptId,
        jobId: right.job.jobId,
        workerId: identity.workerId,
        securityEpoch: identity.securityEpoch,
        leaseExpiresAt: right.attempt.leaseExpiresAt,
      }) &&
    equalScope(left.attempt.tenantScope, right.attempt.tenantScope) &&
    equalScope(left.job.tenantScope, right.job.tenantScope)
  );
}

function completionFromRow(row: JraWorkerCompletionDatabaseRowV1): WorkerCompletionV1 {
  if (
    !OUTCOMES.has(row.outcome) ||
    !Number.isSafeInteger(row.completionRevision) ||
    row.completionRevision < 1 ||
    !/^[0-9a-f]{64}$/u.test(row.fingerprint) ||
    (row.resultManifestHash !== null && !/^[0-9a-f]{64}$/u.test(row.resultManifestHash))
  )
    throw new Error('JRA_PERSISTED_WORKER_COMPLETION_INVALID');
  const references = exactReferenceList(row.resultReferences);
  if (!references) throw new Error('JRA_PERSISTED_WORKER_COMPLETION_INVALID');
  const attemptId = parseStableIdentifierV1(row.attemptId);
  if (!attemptId.accepted) throw new Error('JRA_PERSISTED_WORKER_COMPLETION_INVALID');
  return Object.freeze({
    attemptId: attemptId.value,
    revision: row.completionRevision,
    outcome: row.outcome as WorkerCompletionV1['outcome'],
    ...(row.resultManifestHash === null ? {} : { resultManifestHash: row.resultManifestHash }),
    resultReferences: references,
  });
}

function completionMatches(
  row: JraWorkerCompletionDatabaseRowV1,
  input: WorkerCompletionReplayLookupV1 | WorkerCompletionTransactionInputV1,
): boolean {
  const authorization = 'authorization' in input ? input.authorization : undefined;
  const attemptId: StableIdentifierV1 =
    'authorization' in input ? input.authorization.attempt.attemptId : input.attemptId;
  const jobId = authorization?.job.jobId;
  const references = exactReferenceList(row.resultReferences);
  return (
    row.attemptId === attemptId &&
    (jobId === undefined || row.jobId === jobId) &&
    row.scopeType === input.identity.tenantScope.scopeType &&
    row.organizationId === input.identity.tenantScope.organizationId &&
    row.workspaceId ===
      (input.identity.tenantScope.scopeType === 'organization'
        ? null
        : input.identity.tenantScope.workspaceId) &&
    row.projectId ===
      (input.identity.tenantScope.scopeType === 'project'
        ? input.identity.tenantScope.projectId
        : null) &&
    row.workerId === input.identity.workerId &&
    row.securityEpoch === input.identity.securityEpoch &&
    row.leaseTokenHash === input.leaseTokenHash &&
    row.expectedRevision === input.expectedRevision &&
    input.expectedRevision < Number.MAX_SAFE_INTEGER &&
    row.completionRevision === input.expectedRevision + 1 &&
    row.outcome === input.outcome &&
    row.resultManifestHash === (input.resultManifestHash ?? null) &&
    row.fingerprint === input.fingerprint &&
    references !== undefined &&
    JSON.stringify(references) === JSON.stringify(input.resultReferences)
  );
}

function outputGrantsValid(
  grants: readonly WorkerOutputGrantV1[],
  identity: WorkerIdentityV1,
  loaded: LoadedWorkerAttempt,
  references: readonly string[],
  now: string,
): boolean {
  if (!Array.isArray(grants) || grants.length !== references.length) return false;
  const candidates: readonly unknown[] = grants;
  return candidates.every((candidate, index) => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      Array.isArray(candidate) ||
      (!exactKeys(candidate, [
        'grantType',
        'attemptId',
        'jobId',
        'workerId',
        'securityEpoch',
        'tenantScope',
        'objectId',
        'expiresAt',
      ]) &&
        !exactKeys(candidate, [
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
        ]))
    )
      return false;
    const grant = candidate as WorkerOutputGrantV1;
    const tenantScope = exactGrantScope(grant.tenantScope);
    if (
      grant.grantType !== 'JOB_OUTPUT' ||
      grant.attemptId !== loaded.attempt.attemptId ||
      grant.jobId !== loaded.job.jobId ||
      grant.workerId !== identity.workerId ||
      !Number.isSafeInteger(grant.securityEpoch) ||
      grant.securityEpoch !== identity.securityEpoch ||
      !tenantScope ||
      !equalScope(tenantScope, identity.tenantScope) ||
      grant.objectId !== references[index] ||
      typeof grant.objectId !== 'string' ||
      !OPAQUE_REFERENCE.test(grant.objectId) ||
      grant.objectId.includes('..') ||
      typeof grant.expiresAt !== 'string'
    )
      return false;
    const expiresAt = parseStrictUtcTimestampV1(grant.expiresAt);
    if (!expiresAt.accepted) return false;
    const extension = Object.hasOwn(grant, 'capabilityId');
    if (extension) {
      const capabilityId = parseStableIdentifierV1(grant.capabilityId);
      const issuedAt =
        typeof grant.issuedAt === 'string' ? parseStrictUtcTimestampV1(grant.issuedAt) : undefined;
      if (
        !capabilityId.accepted ||
        grant.action !== 'WRITE' ||
        !Number.isSafeInteger(grant.maxBytes) ||
        (grant.maxBytes as number) < 1 ||
        (grant.maxBytes as number) > 10 * 1024 * 1024 * 1024 ||
        !issuedAt?.accepted ||
        Date.parse(issuedAt.value) > Date.parse(now) ||
        Date.parse(issuedAt.value) >= Date.parse(expiresAt.value) ||
        typeof grant.signedCapability !== 'string' ||
        grant.signedCapability.length === 0 ||
        grant.signedCapability.length > 4096 ||
        /[\p{Cc}]/u.test(grant.signedCapability)
      )
        return false;
    }
    return (
      Date.parse(expiresAt.value) > Date.parse(now) &&
      Date.parse(expiresAt.value) <= Date.parse(loaded.attempt.leaseExpiresAt)
    );
  });
}

/** PostgreSQL worker authority over JRA jobs, attempts, result references, and outbox state. */
export class PrismaJraWorkerAdapter
  implements
    WorkerAttemptAuthorityPortV1,
    WorkerAttemptMutationPortV1,
    WorkerAssignmentPortV1,
    WorkerCompletionTransactionPortV1,
    WorkerResultPreparationPortV1,
    WorkerResultFinalizationPortV1,
    WorkerVerifiedResultManifestPortV1
{
  public constructor(
    private readonly client: JraWorkerDatabaseClientV1,
    private readonly securityEpoch: WorkerSecurityEpochPortV1,
    private readonly grants: WorkerObjectGrantAuthorityPortV1,
    private readonly finalizationEffects?: WorkerResultFinalizationEffectsPortV1,
  ) {}

  public async assign(
    identity: WorkerIdentityV1,
    now: string,
  ): Promise<WorkerAssignmentV1 | undefined> {
    const parsedNow = parseStrictUtcTimestampV1(now);
    if (!parsedNow.accepted || !(await this.current(identity))) return undefined;
    return this.client.$transaction(
      async (transaction) => {
        if (!(await this.current(identity))) return undefined;
        const scope = databaseScope(identity.tenantScope);
        let retryingExpired = false;
        let latestAttempt = await transaction.executionAttemptRecord.findFirst({
          where: {
            ...scope,
            OR: [{ state: 'CLAIMED' }, { state: 'RUNNING' }],
          },
          orderBy: { leaseExpiresAt: 'asc' },
        });
        let jobRowValue: JraWorkerJobDatabaseRowV1 | null = null;
        if (latestAttempt && latestAttempt.leaseExpiresAt.getTime() < Date.parse(now)) {
          const newestForJob = await transaction.executionAttemptRecord.findFirst({
            where: { jobId: latestAttempt.jobId, ...scope },
            orderBy: { attemptNumber: 'desc' },
          });
          const retryJob = await transaction.jobRecord.findFirst({
            where: { id: latestAttempt.jobId, ...scope },
          });
          if (
            newestForJob?.id === latestAttempt.id &&
            retryJob &&
            (retryJob.state === 'DISPATCHED' || retryJob.state === 'RUNNING')
          ) {
            retryingExpired = true;
            jobRowValue = retryJob;
          }
        }
        if (!retryingExpired) {
          latestAttempt = null;
          jobRowValue = await transaction.jobRecord.findFirst({
            where: { ...scope, state: 'QUEUED' },
            orderBy: { createdAt: 'asc' },
          });
        }
        if (!jobRowValue) return undefined;
        const actionRowValue = await transaction.typedActionDefinitionRecord.findFirst({
          where: {
            actionType: jobRowValue.actionType,
            version: jobRowValue.actionVersion,
          },
        });
        if (!actionRowValue) throw new Error('JRA_WORKER_ACTION_UNAVAILABLE');
        const job = rowJob(jobRowValue, actionRowValue);
        if (!equalScope(job.tenantScope, identity.tenantScope)) return undefined;
        const descriptorRow = await transaction.executionRequestDescriptorRecord.findFirst({
          where: { jobId: job.jobId, ...scope },
        });
        if (!descriptorRow) return undefined;
        const descriptor = rowExecutionRequestDescriptor(descriptorRow, job);
        if (Date.parse(descriptor.deadline) <= Date.parse(now)) return undefined;
        if (
          (!retryingExpired && job.state !== 'QUEUED') ||
          (retryingExpired && job.state !== 'DISPATCHED' && job.state !== 'RUNNING')
        )
          return undefined;
        if (job.action.sideEffectClass === 'BILLING_PROVIDER_EFFECT') return undefined;
        if (!retryingExpired)
          latestAttempt = await transaction.executionAttemptRecord.findFirst({
            where: { jobId: job.jobId, ...scope },
            orderBy: { attemptNumber: 'desc' },
          });
        if (
          latestAttempt !== null &&
          (latestAttempt.attemptNumber >= job.action.maxAttempts ||
            ((latestAttempt.state === 'CLAIMED' || latestAttempt.state === 'RUNNING') &&
              latestAttempt.leaseExpiresAt.getTime() > Date.parse(now)))
        )
          return undefined;
        if (retryingExpired && latestAttempt) {
          const expiredAttempt = expireExecutionAttemptV1(rowAttempt(latestAttempt), now);
          if (!expiredAttempt.accepted)
            throw new Error(`JRA_WORKER_EXPIRY_INVALID:${expiredAttempt.code}`);
          const expired = await transaction.executionAttemptRecord.updateMany({
            where: {
              id: latestAttempt.id,
              ...scope,
              state: latestAttempt.state,
              revision: latestAttempt.revision,
              leaseTokenHash: latestAttempt.leaseTokenHash,
            },
            data: attemptData(expiredAttempt.value),
          });
          if (expired.count !== 1) return undefined;
        }
        const attemptNumber = (latestAttempt?.attemptNumber ?? 0) + 1;
        const attemptId = parseStableIdentifierV1(randomUUID());
        if (!attemptId.accepted) throw new Error('JRA_WORKER_ATTEMPT_ID_GENERATION_FAILED');
        const leaseToken = randomBytes(32).toString('base64url');
        const leaseTokenHash = createHash('sha256').update(leaseToken, 'utf8').digest('hex');
        const leaseExpiresAt = new Date(Date.parse(now) + 60_000).toISOString();
        const attempt = createExecutionAttemptV1({
          attemptId: attemptId.value,
          jobId: job.jobId,
          tenantScope: identity.tenantScope,
          attemptNumber,
          executorType: 'CLOUD_WORKER',
          executorId: identity.workerId,
          leaseTokenHash,
          leaseExpiresAt,
          createdAt: now,
        });
        if (!attempt.accepted) throw new Error(`JRA_WORKER_ATTEMPT_INVALID:${attempt.code}`);
        const dispatched = retryingExpired ? undefined : transitionJobV1(job, 'DISPATCHED', now);
        if (dispatched && !dispatched.accepted)
          throw new Error(`JRA_WORKER_DISPATCH_INVALID:${dispatched.code}`);
        if (dispatched?.accepted) {
          const updated = await transaction.jobRecord.updateMany({
            where: { id: job.jobId, ...scope, state: 'QUEUED', revision: job.revision },
            data: { state: dispatched.value.state, revision: dispatched.value.revision },
          });
          if (updated.count !== 1) return undefined;
        }
        await transaction.executionAttemptRecord.create({
          data: {
            id: attempt.value.attemptId,
            jobId: attempt.value.jobId,
            ...scope,
            attemptNumber: attempt.value.attemptNumber,
            executorType: attempt.value.executorType,
            executorId: attempt.value.executorId,
            leaseTokenHash: attempt.value.leaseTokenHash,
            leaseExpiresAt: new Date(attempt.value.leaseExpiresAt),
            state: attempt.value.state,
            createdAt: new Date(attempt.value.createdAt),
            heartbeatAt: new Date(attempt.value.heartbeatAt),
            startedAt: null,
            finishedAt: null,
            resultManifestHash: null,
            revision: attempt.value.revision,
          },
        });
        if (dispatched?.accepted)
          await transaction.jobTransitionRecord.create({
            data: {
              id: randomUUID(),
              jobId: job.jobId,
              fromState: job.state,
              toState: dispatched.value.state,
              actorId: identity.workerId,
              occurredAt: new Date(now),
              revision: dispatched.value.revision,
            },
          });
        const jobRevision = dispatched?.accepted ? dispatched.value.revision : job.revision;
        const attemptBindingHash = workerAttemptDescriptorBindingHashV1({
          descriptorHash: descriptor.canonicalHash,
          attemptId: attempt.value.attemptId,
          jobId: job.jobId,
          workerId: identity.workerId,
          securityEpoch: identity.securityEpoch,
          leaseExpiresAt: attempt.value.leaseExpiresAt,
        });
        await transaction.jobOutboxRecord.create({
          data: {
            id: randomUUID(),
            jobId: job.jobId,
            eventType: `WORKER_ASSIGNED:${attempt.value.attemptId}`,
            payload: {
              schemaVersion: 1,
              attemptId: attempt.value.attemptId,
              workerId: identity.workerId,
              attemptNumber,
              jobRevision,
              descriptorId: descriptor.descriptorId,
              descriptorHash: descriptor.canonicalHash,
              attemptBindingHash,
            },
            createdAt: new Date(now),
            deliveredAt: null,
          },
        });
        return Object.freeze({
          attemptId: attempt.value.attemptId,
          jobId: job.jobId,
          leaseToken,
          leaseExpiresAt: attempt.value.leaseExpiresAt,
          expectedRevision: attempt.value.revision,
          descriptorId: descriptor.descriptorId,
          descriptorHash: descriptor.canonicalHash,
          attemptBindingHash,
          action: Object.freeze({
            type: job.action.actionType,
            version: job.action.version,
            handlerDigest: `sha256:${job.action.handlerDigest}`,
            inputSchemaId: job.action.inputSchemaId,
            outputSchemaId: job.action.outputSchemaId,
            requiredCapabilities: Object.freeze([...job.action.requiredCapabilities]),
            sideEffectClass: job.action.sideEffectClass,
            riskClass: job.action.riskClass,
          }),
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  public async authorize(
    identity: WorkerIdentityV1,
    input: {
      readonly attemptId: StableIdentifierV1;
      readonly leaseTokenHash: string;
      readonly expectedRevision: number;
      readonly operation: WorkerOperationV1;
      readonly now: string;
    },
  ): Promise<WorkerAttemptAuthorizationV1 | undefined> {
    if (!(await this.current(identity))) return undefined;
    const loaded = await this.loadCurrent(
      this.client,
      identity,
      input.attemptId,
      input.leaseTokenHash,
      input.expectedRevision,
      input.now,
      true,
    );
    if (!loaded || !active(loaded.attempt) || !WORKER_JOB_STATES.has(loaded.job.state))
      return undefined;
    if (input.operation === 'CLAIM' && loaded.attempt.state === 'SUCCEEDED') return undefined;
    return Object.freeze({
      attempt: loaded.attempt,
      job: loaded.job,
      latestAttemptId: loaded.latestAttemptId,
      workerSecurityEpoch: identity.securityEpoch,
      descriptorId: loaded.descriptor.descriptorId,
      descriptorHash: loaded.descriptor.canonicalHash,
      attemptBindingHash: workerAttemptDescriptorBindingHashV1({
        descriptorHash: loaded.descriptor.canonicalHash,
        attemptId: loaded.attempt.attemptId,
        jobId: loaded.job.jobId,
        workerId: identity.workerId,
        securityEpoch: identity.securityEpoch,
        leaseExpiresAt: loaded.attempt.leaseExpiresAt,
      }),
    });
  }

  public start(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
    leaseTokenHash: string,
    now: string,
    expectedRevision: number,
    securityEpoch?: number,
  ): Promise<ExecutionAttemptResultV1<ExecutionAttemptV1>> {
    return this.client.$transaction(
      async (transaction) => {
        const identity = identityFromContext(context, securityEpoch);
        if (!(await this.current(identity))) return mapAttemptFailure('INVALID_LEASE');
        const loaded = await this.loadCurrent(
          transaction,
          identity,
          attemptId,
          leaseTokenHash,
          expectedRevision,
          now,
          true,
        );
        if (!loaded || !active(loaded.attempt) || !WORKER_JOB_STATES.has(loaded.job.state))
          return mapAttemptFailure('INVALID_LEASE');
        const next = startExecutionAttemptV1(loaded.attempt, leaseTokenHash, now);
        if (!next.accepted) return next;
        return this.persistAttempt(
          transaction,
          identity,
          next.value,
          expectedRevision,
          leaseTokenHash,
        );
      },
      { isolationLevel: 'Serializable' },
    );
  }

  public heartbeat(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
    leaseTokenHash: string,
    now: string,
    nextLeaseExpiresAt: string,
    expectedRevision: number,
    securityEpoch?: number,
  ): Promise<ExecutionAttemptResultV1<ExecutionAttemptV1>> {
    return this.client.$transaction(
      async (transaction) => {
        const identity = identityFromContext(context, securityEpoch);
        if (!(await this.current(identity))) return mapAttemptFailure('INVALID_LEASE');
        const loaded = await this.loadCurrent(
          transaction,
          identity,
          attemptId,
          leaseTokenHash,
          expectedRevision,
          now,
          true,
        );
        if (!loaded || !active(loaded.attempt) || !WORKER_JOB_STATES.has(loaded.job.state))
          return mapAttemptFailure('INVALID_LEASE');
        const next = renewExecutionAttemptLeaseV1(
          loaded.attempt,
          leaseTokenHash,
          now,
          nextLeaseExpiresAt,
        );
        if (!next.accepted) return next;
        return this.persistAttempt(
          transaction,
          identity,
          next.value,
          expectedRevision,
          leaseTokenHash,
        );
      },
      { isolationLevel: 'Serializable' },
    );
  }

  public async prepare(
    input: WorkerResultPreparationInputV1,
  ): Promise<WorkerResultPreparationResultV1> {
    const preparations = this.client.workerResultPreparationRecord;
    if (!preparations) return { accepted: false, code: 'PREPARATION_UNAVAILABLE' };
    try {
      return await this.client.$transaction(
        async (transaction) => {
          const store = transaction.workerResultPreparationRecord;
          if (!store || !(await this.current(input.identity)))
            return { accepted: false as const, code: 'PREPARATION_UNAVAILABLE' as const };
          const scope = databaseScope(input.identity.tenantScope);
          const existing = await store.findFirst({
            where: { attemptId: input.authorization.attempt.attemptId, ...scope },
          });
          if (existing) {
            if (
              existing.fingerprint !== input.fingerprint ||
              existing.idempotencyKey !== input.idempotencyKey
            )
              return { accepted: false as const, code: 'CONFLICT' as const };
            const preparation = preparedFromRow(existing);
            return preparation
              ? { accepted: true as const, replayed: true, preparation }
              : { accepted: false as const, code: 'PREPARATION_UNAVAILABLE' as const };
          }
          const loaded = await this.loadCurrent(
            transaction,
            input.identity,
            input.authorization.attempt.attemptId,
            input.leaseTokenHash,
            input.expectedRevision,
            input.now,
            true,
          );
          if (!loaded || !active(loaded.attempt) || !WORKER_JOB_STATES.has(loaded.job.state))
            return { accepted: false as const, code: 'STALE_ATTEMPT' as const };
          if (
            !authorizationMatches(
              input.authorization,
              loaded,
              input.identity,
              input.leaseTokenHash,
              input.expectedRevision,
            )
          )
            return { accepted: false as const, code: 'STALE_ATTEMPT' as const };
          const submission = parseStableIdentifierV1(randomUUID());
          if (!submission.accepted)
            return { accepted: false as const, code: 'PREPARATION_UNAVAILABLE' as const };
          const descriptorPolicy = descriptorOutputPolicy(loaded.descriptor);
          const lineageAuthority = descriptorOutputLineageAuthority(loaded.descriptor);
          if (
            !lineageAuthority ||
            input.outputs.length !== 1 ||
            input.outputs[0]?.schemaId !== loaded.descriptor.action.outputSchemaId ||
            input.outputs[0]?.mediaType !== descriptorPolicy.mediaType ||
            input.outputs[0].byteLength > descriptorPolicy.maxBytes ||
            input.outputs[0].sourceLineageHash !== lineageAuthority.sourceLineageHash
          )
            return { accepted: false as const, code: 'CONFLICT' as const };
          const outputPolicy = Object.freeze(
            input.outputs.map((output) =>
              Object.freeze({
                ...output,
                objectId: descriptorPolicy.outputObjectId,
                maxBytes: descriptorPolicy.maxBytes,
                allowedMediaTypes: Object.freeze([descriptorPolicy.mediaType]),
                sourceArtifactVersionIds: lineageAuthority.sourceArtifactVersionIds,
                processorVersion: lineageAuthority.processorVersion,
                dataMode: lineageAuthority.dataMode,
                payloadClass: lineageAuthority.payloadClass,
              }),
            ),
          );
          const outputPolicyHash = canonicalHash(outputPolicy);
          const bindings = descriptorSubjectBindings(loaded.descriptor);
          if (
            loaded.descriptor.action.outputSchemaId === 'dda.dashboard-widget-result.v4' &&
            Object.keys(bindings).length !== RESULT_SUBJECT_BINDINGS.size
          )
            return { accepted: false as const, code: 'CONFLICT' as const };
          const row = await store.create({
            data: {
              submissionId: submission.value,
              jobId: loaded.job.jobId,
              attemptId: loaded.attempt.attemptId,
              ...scope,
              workerId: input.identity.workerId,
              securityEpoch: input.identity.securityEpoch,
              leaseTokenHash: input.leaseTokenHash,
              expectedRevision: input.expectedRevision,
              descriptorId: loaded.descriptor.descriptorId,
              descriptorHash: loaded.descriptor.canonicalHash,
              attemptBindingHash: input.authorization.attemptBindingHash,
              resultUsageSettlementBindingId:
                loaded.descriptor.resultUsageSettlementBindingId,
              outputSchemaId: loaded.descriptor.action.outputSchemaId,
              outputPolicy,
              outputPolicyHash,
              subjectBindings: bindings,
              idempotencyKey: input.idempotencyKey,
              fingerprint: input.fingerprint,
              createdAt: new Date(input.now),
            },
          });
          const preparation = preparedFromRow(row);
          return preparation
            ? { accepted: true as const, replayed: false, preparation }
            : { accepted: false as const, code: 'PREPARATION_UNAVAILABLE' as const };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (isUniqueConflict(error)) {
        const existing = await preparations.findFirst({
          where: {
            attemptId: input.authorization.attempt.attemptId,
            ...databaseScope(input.identity.tenantScope),
          },
        });
        if (existing?.fingerprint === input.fingerprint) {
          const preparation = preparedFromRow(existing);
          if (preparation) return { accepted: true, replayed: true, preparation };
        }
        return { accepted: false, code: 'CONFLICT' };
      }
      return { accepted: false, code: 'PREPARATION_UNAVAILABLE' };
    }
  }

  public async findResultReplay(
    input: WorkerResultFinalizationReplayInputV1,
  ): Promise<WorkerResultCompletionV1 | undefined> {
    const finalizations = this.client.workerResultFinalizationRecord;
    if (!finalizations || !(await this.current(input.identity))) return undefined;
    const row = await finalizations.findFirst({
      where: {
        submissionId: input.submissionId,
        attemptId: input.attemptId,
        workerId: input.identity.workerId,
        securityEpoch: input.identity.securityEpoch,
        fingerprint: input.fingerprint,
        ...databaseScope(input.identity.tenantScope),
      },
    });
    return row ? finalizationCompletion(row) : undefined;
  }

  public async finalize(
    input: WorkerResultFinalizationInputV1,
  ): Promise<WorkerResultFinalizationResultV1> {
    if (
      !this.client.workerResultPreparationRecord ||
      !this.client.workerResultFinalizationRecord ||
      !this.client.resultManifestRecord ||
      !this.finalizationEffects
    )
      return { accepted: false, code: 'FINALIZATION_UNAVAILABLE' };
    try {
      return await this.client.$transaction(
        async (transaction) => this.finalizeInTransaction(transaction, input),
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (isUniqueConflict(error)) {
        const replay = await this.findResultReplay(input);
        return replay
          ? { accepted: true, replayed: true, completion: replay }
          : { accepted: false, code: 'CONFLICT' };
      }
      return { accepted: false, code: 'FINALIZATION_UNAVAILABLE' };
    }
  }

  private async finalizeInTransaction(
    transaction: JraWorkerDatabaseClientV1,
    input: WorkerResultFinalizationInputV1,
  ): Promise<WorkerResultFinalizationResultV1> {
    const preparations = transaction.workerResultPreparationRecord;
    const finalizations = transaction.workerResultFinalizationRecord;
    const manifests = transaction.resultManifestRecord;
    if (!preparations || !finalizations || !manifests || !this.finalizationEffects)
      return { accepted: false, code: 'FINALIZATION_UNAVAILABLE' };
    if (!(await this.current(input.identity)))
      return { accepted: false, code: 'STALE_ATTEMPT' };
    const scope = databaseScope(input.identity.tenantScope);
    const existing = await finalizations.findFirst({
      where: { submissionId: input.submissionId, ...scope },
    });
    if (existing) {
      const completion = finalizationCompletion(existing);
      return existing.fingerprint === input.fingerprint && completion
        ? { accepted: true, replayed: true, completion }
        : { accepted: false, code: 'CONFLICT' };
    }
    const loaded = await this.loadCurrent(
      transaction,
      input.identity,
      input.attemptId,
      input.leaseTokenHash,
      input.expectedRevision,
      input.now,
      true,
    );
    if (!loaded || !active(loaded.attempt) || !WORKER_JOB_STATES.has(loaded.job.state))
      return { accepted: false, code: 'STALE_ATTEMPT' };
    if (
      !authorizationMatches(
        input.authorization,
        loaded,
        input.identity,
        input.leaseTokenHash,
        input.expectedRevision,
      ) ||
      loaded.descriptor.descriptorId !== input.descriptorId ||
      loaded.descriptor.canonicalHash !== input.descriptorHash ||
      input.authorization.attemptBindingHash !== input.attemptBindingHash
    )
      return { accepted: false, code: 'STALE_ATTEMPT' };
    const preparationRow = await preparations.findFirst({
      where: { submissionId: input.submissionId, attemptId: input.attemptId, ...scope },
    });
    const preparation = preparationRow ? preparedFromRow(preparationRow) : undefined;
    const expectedBindings = descriptorSubjectBindings(loaded.descriptor);
    const lineageAuthority = descriptorOutputLineageAuthority(loaded.descriptor);
    const expectedOutputNames = preparation?.outputs.map((output) => output.outputName);
    if (
      !preparation ||
      !lineageAuthority ||
      preparation.jobId !== loaded.job.jobId ||
      preparation.descriptorId !== input.descriptorId ||
      preparation.descriptorHash !== input.descriptorHash ||
      preparation.attemptBindingHash !== input.attemptBindingHash ||
      preparation.resultUsageSettlementBindingId !==
        loaded.descriptor.resultUsageSettlementBindingId ||
      preparation.outputSchemaId !== input.resultBinding.outputSchemaId ||
      input.resultBinding.outputSchemaId !== loaded.descriptor.action.outputSchemaId ||
      input.resultBinding.kind !== 'OUTPUT_SET' ||
      canonicalJson(input.resultBinding.outputNames) !== canonicalJson(expectedOutputNames) ||
      input.attestations.length !== preparation.outputs.length ||
      input.attestations.length !== input.attestationReferences.length
    )
      return { accepted: false, code: 'ATTESTATION_REJECTED' };
    const attestationReferences: Array<Readonly<Record<string, unknown>>> = [];
    for (let index = 0; index < input.attestations.length; index += 1) {
      const attestation = input.attestations[index]!;
      const reference = input.attestationReferences[index];
      const policy = preparation.outputs[index];
      if (
        !reference ||
        !policy ||
        reference.outputName !== policy.outputName ||
        attestation.attestationId !== reference.attestationId ||
        !equalScope(attestation.tenantScope, input.identity.tenantScope) ||
        attestation.jobId !== loaded.job.jobId ||
        attestation.attemptId !== loaded.attempt.attemptId ||
        attestation.executionDescriptorId !== loaded.descriptor.descriptorId ||
        attestation.executionDescriptorHash !== loaded.descriptor.canonicalHash ||
        attestation.submissionId !== input.submissionId ||
        attestation.outputPolicyHash !== preparation.outputPolicyHash ||
        attestation.mediaType !== policy.mediaType ||
        attestation.contentLength !== policy.byteLength ||
        attestation.contentLength > policy.maxBytes ||
        attestation.contentSha256 !== policy.contentSha256 ||
        attestation.sourceLineageHash !== policy.sourceLineageHash ||
        canonicalJson(policy.sourceArtifactVersionIds) !==
          canonicalJson(lineageAuthority.sourceArtifactVersionIds) ||
        policy.processorVersion !== lineageAuthority.processorVersion ||
        policy.dataMode !== lineageAuthority.dataMode ||
        policy.payloadClass !== lineageAuthority.payloadClass
      )
        return { accepted: false, code: 'ATTESTATION_REJECTED' };
      attestationReferences.push(
        Object.freeze({
          attestationId: attestation.attestationId,
          outputName: policy.outputName,
          artifactVersionId: attestation.artifactVersionId,
          contentSha256: attestation.contentSha256,
          contentLength: attestation.contentLength,
          mediaType: attestation.mediaType,
        }),
      );
    }
    const resultManifestId = parseStableIdentifierV1(randomUUID());
    if (!resultManifestId.accepted)
      return { accepted: false, code: 'FINALIZATION_UNAVAILABLE' };
    const sourceArtifactVersionIds = lineageAuthority.sourceArtifactVersionIds;
    const engineVersion = expectedBindings['engineVersion'];
    if (sourceArtifactVersionIds.length === 0 || !engineVersion)
      return { accepted: false, code: 'ATTESTATION_REJECTED' };
    const lineageHashes = preparation.outputs.map((output) => output.sourceLineageHash);
    const sourceLineageHash = new Set(lineageHashes).size === 1
      ? lineageHashes[0]!
      : canonicalHash(lineageHashes);
    const manifestWithoutHash = {
      resultManifestId: resultManifestId.value,
      jobId: loaded.job.jobId,
      attemptId: loaded.attempt.attemptId,
      tenantScope: input.identity.tenantScope,
      sourceArtifactVersionIds,
      outputIds: input.attestations.map((value) => value.artifactVersionId),
      outputHashes: input.attestations.map((value) => value.contentSha256),
      evidenceCoverage: 'COMPLETE' as const,
      handlerDigest: loaded.descriptor.action.handlerDigest,
      engineVersion,
      attemptNumber: loaded.attempt.attemptNumber,
      approvalState: 'NOT_REQUIRED' as const,
      generatedAt: input.now,
    };
    const manifestHash = canonicalHash(manifestWithoutHash);
    const manifestResult = createResultManifestV1({ ...manifestWithoutHash, manifestHash });
    if (!manifestResult.accepted)
      return { accepted: false, code: 'ATTESTATION_REJECTED' };
    const nextAttempt = completeExecutionAttemptV1(
      loaded.attempt,
      input.leaseTokenHash,
      'SUCCEEDED',
      input.now,
      manifestHash,
    );
    if (!nextAttempt.accepted)
      return { accepted: false, code: 'STALE_ATTEMPT' };
    const attemptUpdate = await transaction.executionAttemptRecord.updateMany({
      where: {
        id: loaded.attempt.attemptId,
        ...scope,
        executorId: input.identity.workerId,
        leaseTokenHash: input.leaseTokenHash,
        revision: input.expectedRevision,
      },
      data: attemptData(nextAttempt.value),
    });
    if (attemptUpdate.count !== 1) return { accepted: false, code: 'STALE_ATTEMPT' };
    let currentJob = loaded.job;
    if (currentJob.state === 'DISPATCHED') {
      const running = transitionJobV1(currentJob, 'RUNNING', input.now);
      if (!running.accepted || !(await this.persistResultJob(transaction, input, currentJob, running.value)))
        return { accepted: false, code: 'STALE_ATTEMPT' };
      currentJob = running.value;
    }
    const succeeded = transitionJobV1(currentJob, 'SUCCEEDED', input.now);
    if (
      !succeeded.accepted ||
      !(await this.persistResultJob(transaction, input, currentJob, succeeded.value))
    )
      return { accepted: false, code: 'STALE_ATTEMPT' };
    await manifests.create({ data: this.resultManifestData(manifestResult.value) });
    await finalizations.create({
      data: {
        submissionId: input.submissionId,
        jobId: loaded.job.jobId,
        attemptId: loaded.attempt.attemptId,
        resultManifestId: manifestResult.value.resultManifestId,
        ...scope,
        workerId: input.identity.workerId,
        securityEpoch: input.identity.securityEpoch,
        descriptorId: loaded.descriptor.descriptorId,
        descriptorHash: loaded.descriptor.canonicalHash,
        outputSchemaId: input.resultBinding.outputSchemaId,
        engineVersion,
        sourceArtifactVersionIds,
        sourceLineageHash,
        subjectBindings: expectedBindings,
        attestationReferences,
        fingerprint: input.fingerprint,
        resultManifestHash: manifestHash,
        attemptRevision: nextAttempt.value.revision,
        jobRevision: succeeded.value.revision,
        finalizedAt: new Date(input.now),
      },
    });
    await transaction.jobOutboxRecord.create({
      data: {
        id: randomUUID(),
        jobId: loaded.job.jobId,
        eventType: `WORKER_RESULT_FINALIZED:${input.submissionId}`,
        payload: {
          schemaVersion: 1,
          submissionId: input.submissionId,
          resultManifestId: manifestResult.value.resultManifestId,
          resultManifestHash: manifestHash,
          attemptId: loaded.attempt.attemptId,
          attemptRevision: nextAttempt.value.revision,
          jobRevision: succeeded.value.revision,
          artifactVersionIds: input.attestations.map((value) => value.artifactVersionId),
        },
        createdAt: new Date(input.now),
        deliveredAt: null,
      },
    });
    await this.finalizationEffects.commit(transaction, {
      tenantScope: input.identity.tenantScope,
      actorId: input.identity.workerId,
      authorizationEpoch: input.identity.securityEpoch,
      correlationId: input.identity.correlationId,
      jobId: loaded.job.jobId,
      attemptId: loaded.attempt.attemptId,
      submissionId: input.submissionId,
      resultManifestId: manifestResult.value.resultManifestId,
      resultManifestHash: manifestHash,
      jobRevision: succeeded.value.revision,
      resultUsageSettlementBindingId: preparation.resultUsageSettlementBindingId,
      artifactVersionIds: Object.freeze(input.attestations.map((value) => value.artifactVersionId)),
      outputBytes: input.attestations.reduce((total, value) => total + value.contentLength, 0),
      occurredAt: input.now,
    });
    const completion: WorkerResultCompletionV1 = Object.freeze({
      submissionId: input.submissionId,
      resultManifestId: manifestResult.value.resultManifestId,
      resultManifestHash: manifestHash,
      attemptId: loaded.attempt.attemptId,
      jobId: loaded.job.jobId,
      outcome: 'SUCCEEDED',
      attemptRevision: nextAttempt.value.revision,
      jobRevision: succeeded.value.revision,
      artifactVersionIds: Object.freeze(input.attestations.map((value) => value.artifactVersionId)),
    });
    return { accepted: true, replayed: false, completion };
  }

  private async persistResultJob(
    transaction: JraWorkerDatabaseClientV1,
    input: WorkerResultFinalizationInputV1,
    current: JobV1,
    next: JobV1,
  ): Promise<boolean> {
    const update = await transaction.jobRecord.updateMany({
      where: { id: current.jobId, ...databaseScope(current.tenantScope), revision: current.revision },
      data: {
        state: next.state,
        revision: next.revision,
        startedAt: next.startedAt ? new Date(next.startedAt) : null,
        finishedAt: next.finishedAt ? new Date(next.finishedAt) : null,
      },
    });
    if (update.count !== 1) return false;
    await transaction.jobTransitionRecord.create({
      data: {
        id: randomUUID(),
        jobId: current.jobId,
        fromState: current.state,
        toState: next.state,
        actorId: input.identity.workerId,
        occurredAt: new Date(input.now),
        revision: next.revision,
      },
    });
    return true;
  }

  private resultManifestData(manifest: ResultManifestV1): Readonly<Record<string, unknown>> {
    return {
      id: manifest.resultManifestId,
      jobId: manifest.jobId,
      attemptId: manifest.attemptId,
      ...databaseScope(manifest.tenantScope),
      sourceArtifactVersionIds: manifest.sourceArtifactVersionIds,
      outputIds: manifest.outputIds,
      outputHashes: manifest.outputHashes,
      evidenceCoverage: manifest.evidenceCoverage,
      handlerDigest: manifest.handlerDigest,
      engineVersion: manifest.engineVersion,
      attemptNumber: manifest.attemptNumber,
      reviewerId: manifest.reviewerId ?? null,
      approvalState: manifest.approvalState,
      manifestHash: manifest.manifestHash,
      generatedAt: new Date(manifest.generatedAt),
    };
  }

  public async findVerified(input: {
    readonly tenantScope: TenantScopeV1;
    readonly resultManifestId: StableIdentifierV1;
  }): Promise<WorkerVerifiedResultManifestV1 | undefined> {
    const finalizations = this.client.workerResultFinalizationRecord;
    if (!finalizations) return undefined;
    const row = await finalizations.findFirst({
      where: {
        resultManifestId: input.resultManifestId,
        ...databaseScope(input.tenantScope),
      },
    });
    if (!row) return undefined;
    const descriptorId = parseStableIdentifierV1(row.descriptorId);
    const resultManifestId = parseStableIdentifierV1(row.resultManifestId);
    const jobId = parseStableIdentifierV1(row.jobId);
    const attemptId = parseStableIdentifierV1(row.attemptId);
    const sources = Array.isArray(row.sourceArtifactVersionIds)
      ? row.sourceArtifactVersionIds.map(parseStableIdentifierV1)
      : [];
    const subjectBindings = stringRecord(row.subjectBindings);
    const refs = Array.isArray(row.attestationReferences) ? row.attestationReferences : [];
    const attestations = refs.map((value) => {
      if (typeof value !== 'object' || value === null) return undefined;
      const ref = value as Record<string, unknown>;
      const attestationId = parseStableIdentifierV1(ref['attestationId']);
      const artifactVersionId = parseStableIdentifierV1(ref['artifactVersionId']);
      if (
        !attestationId.accepted ||
        !artifactVersionId.accepted ||
        typeof ref['contentSha256'] !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(ref['contentSha256']) ||
        !Number.isSafeInteger(ref['contentLength']) ||
        (ref['contentLength'] as number) < 1 ||
        typeof ref['mediaType'] !== 'string'
      )
        return undefined;
      return Object.freeze({
        attestationId: attestationId.value,
        artifactVersionId: artifactVersionId.value,
        contentSha256: ref['contentSha256'],
        contentLength: ref['contentLength'] as number,
        mediaType: ref['mediaType'],
      });
    });
    const finalizedAt = parseStrictUtcTimestampV1(row.finalizedAt.toISOString());
    if (
      !descriptorId.accepted ||
      !resultManifestId.accepted ||
      !jobId.accepted ||
      !attemptId.accepted ||
      sources.length === 0 ||
      sources.some((value) => !value.accepted) ||
      !subjectBindings ||
      attestations.length === 0 ||
      attestations.some((value) => value === undefined) ||
      !finalizedAt.accepted
    )
      return undefined;
    return Object.freeze({
      resultManifestId: resultManifestId.value,
      resultManifestHash: row.resultManifestHash,
      jobId: jobId.value,
      attemptId: attemptId.value,
      tenantScope: rowScope(row),
      descriptorId: descriptorId.value,
      descriptorHash: row.descriptorHash,
      outputSchemaId: row.outputSchemaId,
      engineVersion: row.engineVersion,
      sourceArtifactVersionIds: Object.freeze(
        sources.map((value) => (value as { accepted: true; value: StableIdentifierV1 }).value),
      ),
      sourceLineageHash: row.sourceLineageHash,
      subjectBindings,
      attestations: Object.freeze(
        attestations as NonNullable<(typeof attestations)[number]>[],
      ),
      finalizedAt: finalizedAt.value,
    });
  }

  public async findReplay(
    input: WorkerCompletionReplayLookupV1,
  ): Promise<WorkerCompletionV1 | undefined> {
    if (
      !/^[a-f0-9]{64}$/u.test(input.leaseTokenHash) ||
      !/^[a-f0-9]{64}$/u.test(input.fingerprint) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1 ||
      (input.resultManifestHash !== undefined && !/^[a-f0-9]{64}$/u.test(input.resultManifestHash))
    )
      return undefined;
    if (!(await this.current(input.identity))) return undefined;
    const row = await this.client.workerCompletionRecord.findFirst({
      where: { attemptId: input.attemptId, fingerprint: input.fingerprint },
    });
    if (!row || !completionMatches(row, input)) return undefined;
    const loaded = await this.loadCompleted(
      this.client,
      input.identity,
      input.attemptId,
      row.completionRevision,
      input.leaseTokenHash,
      row.outcome,
    );
    return loaded ? completionFromRow(row) : undefined;
  }

  public async complete(
    input: WorkerCompletionTransactionInputV1,
  ): Promise<WorkerCompletionTransactionResultV1> {
    if (
      !/^[a-f0-9]{64}$/u.test(input.leaseTokenHash) ||
      !/^[a-f0-9]{64}$/u.test(input.fingerprint) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1 ||
      (input.resultManifestHash !== undefined && !/^[a-f0-9]{64}$/u.test(input.resultManifestHash))
    )
      return { accepted: false, code: 'ATTEMPT_REJECTED' };
    try {
      return await this.client.$transaction(
        async (transaction) => this.completeInTransaction(transaction, input),
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof WorkerCompletionRollback) return { accepted: false, code: error.code };
      if (isUniqueConflict(error)) {
        const replay = await this.findReplay({
          identity: input.identity,
          attemptId: input.authorization.attempt.attemptId,
          leaseTokenHash: input.leaseTokenHash,
          expectedRevision: input.expectedRevision,
          outcome: input.outcome,
          ...(input.resultManifestHash === undefined
            ? {}
            : { resultManifestHash: input.resultManifestHash }),
          resultReferences: input.resultReferences,
          fingerprint: input.fingerprint,
          now: input.now,
        });
        if (replay) return { accepted: true, replayed: true, completion: replay, outputGrants: [] };
      }
      return { accepted: false, code: 'COMPLETION_UNAVAILABLE' };
    }
  }

  private async completeInTransaction(
    transaction: JraWorkerDatabaseClientV1,
    input: WorkerCompletionTransactionInputV1,
  ): Promise<WorkerCompletionTransactionResultV1> {
    if (!(await this.current(input.identity))) return { accepted: false, code: 'ATTEMPT_REJECTED' };
    const existing = await transaction.workerCompletionRecord.findFirst({
      where: { attemptId: input.authorization.attempt.attemptId },
    });
    if (existing) {
      if (!completionMatches(existing, input)) return { accepted: false, code: 'ATTEMPT_REJECTED' };
      const replay = await this.loadCompleted(
        transaction,
        input.identity,
        input.authorization.attempt.attemptId,
        existing.completionRevision,
        input.leaseTokenHash,
        existing.outcome,
      );
      return replay
        ? {
            accepted: true,
            replayed: true,
            completion: completionFromRow(existing),
            outputGrants: [],
          }
        : { accepted: false, code: 'STALE_ATTEMPT' };
    }
    const loaded = await this.loadCurrent(
      transaction,
      input.identity,
      input.authorization.attempt.attemptId,
      input.leaseTokenHash,
      input.expectedRevision,
      input.now,
      true,
    );
    if (!loaded || !active(loaded.attempt) || !WORKER_JOB_STATES.has(loaded.job.state))
      return { accepted: false, code: 'STALE_ATTEMPT' };
    if (
      !authorizationMatches(
        input.authorization,
        loaded,
        input.identity,
        input.leaseTokenHash,
        input.expectedRevision,
      )
    )
      return { accepted: false, code: 'ATTEMPT_REJECTED' };

    const next = completeExecutionAttemptV1(
      loaded.attempt,
      input.leaseTokenHash,
      input.outcome,
      input.now,
      input.resultManifestHash,
    );
    if (!next.accepted)
      return {
        accepted: false,
        code: next.code === 'LEASE_EXPIRED' ? 'LEASE_EXPIRED' : 'ATTEMPT_REJECTED',
      };
    const references = exactReferenceList(input.resultReferences);
    if (!references) return { accepted: false, code: 'OBJECT_GRANT_REJECTED' };
    if (!(await this.current(input.identity))) return { accepted: false, code: 'ATTEMPT_REJECTED' };

    const updatedAttempt = await transaction.executionAttemptRecord.updateMany({
      where: {
        id: loaded.attempt.attemptId,
        ...databaseScope(input.identity.tenantScope),
        executorId: input.identity.workerId,
        leaseTokenHash: input.leaseTokenHash,
        revision: input.expectedRevision,
      },
      data: attemptData(next.value),
    });
    if (updatedAttempt.count !== 1) return { accepted: false, code: 'STALE_ATTEMPT' };

    let outputGrants: readonly WorkerOutputGrantV1[];
    try {
      outputGrants = await this.grants.acceptResultReferences(
        input.identity,
        loaded.job,
        loaded.attempt,
        references,
      );
    } catch (error) {
      throw new WorkerCompletionRollback(
        error instanceof Error && error.message.includes('UNAVAILABLE')
          ? 'OBJECT_GRANT_UNAVAILABLE'
          : 'OBJECT_GRANT_REJECTED',
      );
    }
    if (!outputGrantsValid(outputGrants, input.identity, loaded, references, input.now))
      throw new WorkerCompletionRollback('OBJECT_GRANT_REJECTED');
    if (!(await this.current(input.identity)))
      throw new WorkerCompletionRollback('ATTEMPT_REJECTED');

    const transitioned = await this.persistCompletionJob(transaction, input, loaded.job);
    if (!transitioned) throw new WorkerCompletionRollback('ATTEMPT_REJECTED');
    const completion: WorkerCompletionV1 = Object.freeze({
      attemptId: next.value.attemptId,
      revision: next.value.revision,
      outcome: input.outcome,
      ...(input.resultManifestHash === undefined
        ? {}
        : { resultManifestHash: input.resultManifestHash }),
      resultReferences: references,
    });
    await transaction.workerCompletionRecord.create({ data: completionData(input, completion) });
    await transaction.jobOutboxRecord.create({
      data: {
        id: randomUUID(),
        jobId: loaded.job.jobId,
        eventType: `WORKER_COMPLETED:${loaded.attempt.attemptId}`,
        payload: {
          schemaVersion: 1,
          attemptId: loaded.attempt.attemptId,
          workerId: input.identity.workerId,
          outcome: input.outcome,
          attemptRevision: completion.revision,
          jobRevision: transitioned.revision,
          resultManifestHash: input.resultManifestHash ?? null,
          resultReferenceCount: references.length,
          fingerprint: input.fingerprint,
        },
        createdAt: new Date(input.now),
        deliveredAt: null,
      },
    });
    return { accepted: true, replayed: false, completion, outputGrants };
  }

  private async persistCompletionJob(
    transaction: JraWorkerDatabaseClientV1,
    input: WorkerCompletionTransactionInputV1,
    job: JobV1,
  ): Promise<JobV1 | undefined> {
    let current = job;
    if (current.state === 'DISPATCHED') {
      const running = transitionJobV1(current, 'RUNNING', input.now);
      if (!running.accepted || !(await this.persistJob(transaction, input, current, running.value)))
        return undefined;
      current = running.value;
    }
    if (current.state !== 'RUNNING') return undefined;
    const final = transitionJobV1(current, input.outcome, input.now);
    if (!final.accepted || !(await this.persistJob(transaction, input, current, final.value)))
      return undefined;
    return final.value;
  }

  private async persistJob(
    transaction: JraWorkerDatabaseClientV1,
    input: WorkerCompletionTransactionInputV1,
    current: JobV1,
    next: JobV1,
  ): Promise<boolean> {
    const updated = await transaction.jobRecord.updateMany({
      where: {
        id: current.jobId,
        ...databaseScope(current.tenantScope),
        revision: current.revision,
      },
      data: {
        state: next.state,
        revision: next.revision,
        startedAt: next.startedAt ? new Date(next.startedAt) : null,
        finishedAt: next.finishedAt ? new Date(next.finishedAt) : null,
      },
    });
    if (updated.count !== 1) return false;
    await transaction.jobTransitionRecord.create({
      data: {
        id: randomUUID(),
        jobId: current.jobId,
        fromState: current.state,
        toState: next.state,
        actorId: input.identity.workerId,
        occurredAt: new Date(input.now),
        revision: next.revision,
      },
    });
    return true;
  }

  private async persistAttempt(
    transaction: JraWorkerDatabaseClientV1,
    identity: WorkerIdentityV1,
    next: ExecutionAttemptV1,
    expectedRevision: number,
    leaseTokenHash: string,
  ): Promise<ExecutionAttemptResultV1<ExecutionAttemptV1>> {
    const updated = await transaction.executionAttemptRecord.updateMany({
      where: {
        id: next.attemptId,
        ...databaseScope(identity.tenantScope),
        executorId: identity.workerId,
        leaseTokenHash,
        revision: expectedRevision,
      },
      data: attemptData(next),
    });
    if (updated.count !== 1) return { accepted: false, code: 'INVALID_REVISION' };
    const stored = await transaction.executionAttemptRecord.findFirst({
      where: { id: next.attemptId, ...databaseScope(identity.tenantScope) },
    });
    if (!stored) return { accepted: false, code: 'INVALID_REVISION' };
    return { accepted: true, value: rowAttempt(stored) };
  }

  private async current(identity: WorkerIdentityV1): Promise<boolean> {
    try {
      return await this.securityEpoch.isCurrent(identity);
    } catch {
      throw new Error('JRA_WORKER_SECURITY_EPOCH_UNAVAILABLE');
    }
  }

  private async loadCurrent(
    client: JraWorkerDatabaseClientV1,
    identity: WorkerIdentityV1,
    attemptId: StableIdentifierV1,
    leaseTokenHash: string,
    expectedRevision: number,
    now: string,
    requireLease: boolean,
  ): Promise<LoadedWorkerAttempt | undefined> {
    const scope = databaseScope(identity.tenantScope);
    const attemptRowValue = await client.executionAttemptRecord.findFirst({
      where: { id: attemptId, ...scope },
    });
    if (!attemptRowValue) return undefined;
    if (
      attemptRowValue.executorId !== identity.workerId ||
      attemptRowValue.leaseTokenHash !== leaseTokenHash ||
      attemptRowValue.revision !== expectedRevision ||
      attemptRowValue.executorType !== 'CLOUD_WORKER'
    )
      return undefined;
    const attempt = rowAttempt(attemptRowValue);
    const jobRowValue = await client.jobRecord.findFirst({
      where: { id: attempt.jobId, ...scope },
    });
    if (!jobRowValue) return undefined;
    const actionRow = await client.typedActionDefinitionRecord.findFirst({
      where: { actionType: jobRowValue.actionType, version: jobRowValue.actionVersion },
    });
    if (!actionRow) throw new Error('JRA_WORKER_ACTION_UNAVAILABLE');
    const job = rowJob(jobRowValue, actionRow);
    if (
      !equalScope(attempt.tenantScope, identity.tenantScope) ||
      !equalScope(job.tenantScope, identity.tenantScope)
    )
      return undefined;
    const latest = await client.executionAttemptRecord.findFirst({
      where: { jobId: attempt.jobId, ...scope },
      orderBy: { attemptNumber: 'desc' },
    });
    if (!latest || latest.id !== attempt.attemptId) return undefined;
    if (requireLease && Date.parse(attempt.leaseExpiresAt) <= Date.parse(now)) return undefined;
    const descriptorRow = await client.executionRequestDescriptorRecord.findFirst({
      where: { jobId: job.jobId, ...scope },
    });
    if (!descriptorRow) return undefined;
    const descriptor = rowExecutionRequestDescriptor(descriptorRow, job);
    if (Date.parse(descriptor.deadline) <= Date.parse(now)) return undefined;
    return { attempt, job, latestAttemptId: latest.id as StableIdentifierV1, descriptor };
  }

  private async loadCompleted(
    client: JraWorkerDatabaseClientV1,
    identity: WorkerIdentityV1,
    attemptId: StableIdentifierV1,
    completionRevision: number,
    leaseTokenHash: string,
    outcome: string,
  ): Promise<LoadedWorkerAttempt | undefined> {
    const scope = databaseScope(identity.tenantScope);
    const attemptRowValue = await client.executionAttemptRecord.findFirst({
      where: { id: attemptId, ...scope },
    });
    if (
      !attemptRowValue ||
      attemptRowValue.executorId !== identity.workerId ||
      attemptRowValue.leaseTokenHash !== leaseTokenHash ||
      attemptRowValue.revision !== completionRevision ||
      attemptRowValue.state !== outcome
    )
      return undefined;
    const attempt = rowAttempt(attemptRowValue);
    const jobRowValue = await client.jobRecord.findFirst({
      where: { id: attempt.jobId, ...scope },
    });
    if (!jobRowValue) return undefined;
    const actionRow = await client.typedActionDefinitionRecord.findFirst({
      where: { actionType: jobRowValue.actionType, version: jobRowValue.actionVersion },
    });
    if (!actionRow) return undefined;
    const job = rowJob(jobRowValue, actionRow);
    if (job.state !== outcome || !equalScope(job.tenantScope, identity.tenantScope))
      return undefined;
    const latest = await client.executionAttemptRecord.findFirst({
      where: { jobId: attempt.jobId, ...scope },
      orderBy: { attemptNumber: 'desc' },
    });
    if (!latest || latest.id !== attempt.attemptId) return undefined;
    const descriptorRow = await client.executionRequestDescriptorRecord.findFirst({
      where: { jobId: job.jobId, ...scope },
    });
    if (!descriptorRow) return undefined;
    const descriptor = rowExecutionRequestDescriptor(descriptorRow, job);
    return { attempt, job, latestAttemptId: latest.id as StableIdentifierV1, descriptor };
  }
}

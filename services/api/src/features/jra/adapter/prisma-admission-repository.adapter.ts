import { randomUUID } from 'node:crypto';

import {
  createJobDispatchRecordV1,
  type JobDispatchRecordV1,
} from '@databreeze/domain/dispatch/v1';
import {
  createJobV1,
  createTypedActionDefinitionV1,
  type JobV1,
  type TypedActionDefinitionV1,
} from '@databreeze/domain/jobs/v1';
import {
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  JraAdmissionRepositoryPortV1,
  JraAdmissionTransactionPortV1,
  JraAdmissionEntitlementParticipantV1,
} from '../application/admission-repository.port.js';
import {
  createExecutionRequestDescriptorV1,
  executionRequestDescriptorMatchesJobV1,
  type ExecutionRequestDescriptorV1,
} from '../application/execution-request-descriptor.js';

export interface PrismaAdmissionActionRowV1 {
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

export interface PrismaAdmissionJobRowV1 {
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

export interface PrismaAdmissionDescriptorRowV1 {
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

export interface PrismaAdmissionDispatchRowV1 {
  readonly id: string;
  readonly jobId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly eventType: string;
  readonly payloadHash: string;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly deliveredAt: Date | null;
  readonly revision: number;
}

interface AdmissionDelegateV1<TRow> {
  findFirst(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<TRow | null>;
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<TRow>;
}

export interface PrismaAdmissionDatabaseClientV1 {
  readonly typedActionDefinitionRecord: AdmissionDelegateV1<PrismaAdmissionActionRowV1>;
  readonly jobRecord: AdmissionDelegateV1<PrismaAdmissionJobRowV1>;
  readonly executionRequestDescriptorRecord: AdmissionDelegateV1<PrismaAdmissionDescriptorRowV1>;
  readonly jobDispatchRecord: AdmissionDelegateV1<PrismaAdmissionDispatchRowV1>;
  $transaction<TValue>(
    work: (transaction: PrismaAdmissionDatabaseClientV1) => Promise<TValue>,
    options?: { readonly isolationLevel?: 'Serializable' },
  ): Promise<TValue>;
}

function scopeWhere(scope: TenantScopeV1): Readonly<Record<string, unknown>> {
  return Object.freeze({
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  });
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
  if (!parsed.accepted) throw new Error('JRA_PERSISTED_ADMISSION_SCOPE_INVALID');
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
  if (parsed === undefined) throw new Error(code);
  return parsed;
}

function rowAction(row: PrismaAdmissionActionRowV1): TypedActionDefinitionV1 {
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
  if (!parsed.accepted) throw new Error('JRA_PERSISTED_ADMISSION_ACTION_INVALID');
  return parsed.value;
}

async function loadAction(
  client: PrismaAdmissionDatabaseClientV1,
  row: { readonly actionType: string; readonly actionVersion: number },
): Promise<TypedActionDefinitionV1> {
  const action = await client.typedActionDefinitionRecord.findFirst({
    where: { actionType: row.actionType, version: row.actionVersion },
  });
  if (action === null) throw new Error('JRA_PERSISTED_ADMISSION_ACTION_MISSING');
  return rowAction(action);
}

async function rowJob(
  client: PrismaAdmissionDatabaseClientV1,
  row: PrismaAdmissionJobRowV1,
): Promise<JobV1> {
  if (!Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error('JRA_PERSISTED_ADMISSION_JOB_INVALID');
  }
  const parsed = createJobV1({
    jobId: row.id,
    tenantScope: rowScope(row),
    requestedBy: row.requestedBy,
    action: await loadAction(client, row),
    inputManifestHash: row.inputManifestHash,
    idempotencyKey: row.idempotencyKey,
    createdAt: requiredTimestamp(row.createdAt, 'JRA_PERSISTED_ADMISSION_JOB_INVALID'),
  });
  if (!parsed.accepted) throw new Error('JRA_PERSISTED_ADMISSION_JOB_INVALID');
  const startedAt = timestamp(row.startedAt, 'JRA_PERSISTED_ADMISSION_JOB_INVALID');
  const finishedAt = timestamp(row.finishedAt, 'JRA_PERSISTED_ADMISSION_JOB_INVALID');
  if (
    (row.state === 'SUCCEEDED' ||
      row.state === 'PARTIALLY_SUCCEEDED' ||
      row.state === 'FAILED' ||
      row.state === 'CANCELLED' ||
      row.state === 'EXPIRED') &&
    finishedAt === undefined
  ) {
    throw new Error('JRA_PERSISTED_ADMISSION_JOB_INVALID');
  }
  return Object.freeze({
    ...parsed.value,
    state: row.state as JobV1['state'],
    revision: row.revision,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
  });
}

function rowDescriptor(
  row: PrismaAdmissionDescriptorRowV1,
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
    deadline: requiredTimestamp(row.deadline, 'JRA_PERSISTED_ADMISSION_DESCRIPTOR_INVALID'),
    locale: row.locale,
    createdAt: requiredTimestamp(row.createdAt, 'JRA_PERSISTED_ADMISSION_DESCRIPTOR_INVALID'),
  });
  if (
    !parsed.accepted ||
    parsed.value.canonicalHash !== row.canonicalHash ||
    !executionRequestDescriptorMatchesJobV1(parsed.value, job)
  ) {
    throw new Error('JRA_PERSISTED_ADMISSION_DESCRIPTOR_INVALID');
  }
  return parsed.value;
}

function rowDispatch(row: PrismaAdmissionDispatchRowV1): JobDispatchRecordV1 {
  const parsed = createJobDispatchRecordV1({
    dispatchId: row.id,
    jobId: row.jobId,
    tenantScope: rowScope(row),
    eventType: row.eventType,
    payloadHash: row.payloadHash,
    idempotencyKey: row.idempotencyKey,
    createdAt: requiredTimestamp(row.createdAt, 'JRA_PERSISTED_ADMISSION_DISPATCH_INVALID'),
  });
  if (!parsed.accepted || !Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error('JRA_PERSISTED_ADMISSION_DISPATCH_INVALID');
  }
  const deliveredAt = timestamp(row.deliveredAt, 'JRA_PERSISTED_ADMISSION_DISPATCH_INVALID');
  return Object.freeze({
    ...parsed.value,
    revision: row.revision,
    ...(deliveredAt === undefined ? {} : { deliveredAt }),
  });
}

function actionData(action: TypedActionDefinitionV1): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: randomUUID(),
    actionType: action.actionType,
    version: action.version,
    inputSchemaId: action.inputSchemaId,
    outputSchemaId: action.outputSchemaId,
    handlerDigest: action.handlerDigest,
    requiredCapabilities: action.requiredCapabilities,
    sideEffectClass: action.sideEffectClass,
    riskClass: action.riskClass,
    defaultTimeoutSeconds: action.defaultTimeoutSeconds,
    maxAttempts: action.maxAttempts,
    approvalClass: action.approvalClass,
    createdAt: new Date(),
  });
}

function jobData(job: JobV1): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: job.jobId,
    ...scopeWhere(job.tenantScope),
    requestedBy: job.requestedBy,
    actionType: job.action.actionType,
    actionVersion: job.action.version,
    inputManifestHash: job.inputManifestHash,
    idempotencyKey: job.idempotencyKey,
    state: job.state,
    revision: job.revision,
    createdAt: new Date(job.createdAt),
    startedAt: job.startedAt === undefined ? null : new Date(job.startedAt),
    finishedAt: job.finishedAt === undefined ? null : new Date(job.finishedAt),
  });
}

function descriptorData(
  descriptor: ExecutionRequestDescriptorV1,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: descriptor.descriptorId,
    resultUsageSettlementBindingId: descriptor.resultUsageSettlementBindingId,
    jobId: descriptor.jobId,
    stepId: descriptor.stepId,
    ...scopeWhere(descriptor.tenantScope),
    actionType: descriptor.action.type,
    actionVersion: descriptor.action.version,
    inputSchemaId: descriptor.action.inputSchemaId,
    outputSchemaId: descriptor.action.outputSchemaId,
    handlerDigest: descriptor.action.handlerDigest,
    requiredCapabilities: descriptor.action.requiredCapabilities,
    sideEffectClass: descriptor.action.sideEffectClass,
    riskClass: descriptor.action.riskClass,
    inputObjectIds: descriptor.inputObjectIds,
    inputManifestHash: descriptor.inputManifestHash,
    parameters: descriptor.parameters,
    outputObjectId: descriptor.outputPolicy.outputObjectId,
    outputMaxBytes: descriptor.outputPolicy.maxBytes,
    outputMediaType: descriptor.outputPolicy.mediaType,
    deadline: new Date(descriptor.deadline),
    locale: descriptor.locale,
    canonicalHash: descriptor.canonicalHash,
    createdAt: new Date(descriptor.createdAt),
  });
}

function dispatchData(record: JobDispatchRecordV1): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: record.dispatchId,
    jobId: record.jobId,
    ...scopeWhere(record.tenantScope),
    eventType: record.eventType,
    payloadHash: record.payloadHash,
    idempotencyKey: record.idempotencyKey,
    createdAt: new Date(record.createdAt),
    deliveredAt: record.deliveredAt === undefined ? null : new Date(record.deliveredAt),
    revision: record.revision,
  });
}

function uniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}

/** Durable JRA admission transaction for local and production Prisma roots. */
export class PrismaJraAdmissionRepositoryAdapter implements JraAdmissionRepositoryPortV1 {
  public constructor(
    private readonly client: PrismaAdmissionDatabaseClientV1,
    private readonly entitlementParticipant?: JraAdmissionEntitlementParticipantV1,
  ) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: JraAdmissionTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction(
      async (transaction) => {
        const adapter: JraAdmissionTransactionPortV1 = {
          saveJob: async (operationContext, job) => {
            const existing = await transaction.jobRecord.findFirst({
              where: { ...scopeWhere(operationContext.tenantScope), id: job.jobId },
            });
            if (existing !== null) {
              const parsed = await rowJob(transaction, existing);
              if (JSON.stringify(parsed) === JSON.stringify(job)) return;
              throw new Error('JRA_ADMISSION_JOB_CONFLICT');
            }
            const action = await transaction.typedActionDefinitionRecord.findFirst({
              where: { actionType: job.action.actionType, version: job.action.version },
            });
            if (action === null) {
              try {
                await transaction.typedActionDefinitionRecord.create({
                  data: actionData(job.action),
                });
              } catch (error) {
                if (!uniqueConstraint(error)) throw error;
              }
            } else if (JSON.stringify(rowAction(action)) !== JSON.stringify(job.action)) {
              throw new Error('JRA_ADMISSION_ACTION_CONFLICT');
            }
            try {
              await transaction.jobRecord.create({ data: jobData(job) });
            } catch (error) {
              if (!uniqueConstraint(error)) throw error;
              const raced = await transaction.jobRecord.findFirst({
                where: { ...scopeWhere(operationContext.tenantScope), id: job.jobId },
              });
              if (
                raced === null ||
                JSON.stringify(await rowJob(transaction, raced)) !== JSON.stringify(job)
              ) {
                throw new Error('JRA_ADMISSION_JOB_CONFLICT');
              }
            }
          },
          findJobByIdempotency: async (operationContext, idempotencyKey) => {
            const row = await transaction.jobRecord.findFirst({
              where: { ...scopeWhere(operationContext.tenantScope), idempotencyKey },
            });
            return row === null ? undefined : rowJob(transaction, row);
          },
          saveExecutionRequest: async (operationContext, descriptor) => {
            const existing = await transaction.executionRequestDescriptorRecord.findFirst({
              where: { ...scopeWhere(operationContext.tenantScope), jobId: descriptor.jobId },
            });
            if (existing !== null) {
              if (existing.canonicalHash === descriptor.canonicalHash) return;
              throw new Error('JRA_ADMISSION_DESCRIPTOR_CONFLICT');
            }
            try {
              await transaction.executionRequestDescriptorRecord.create({
                data: descriptorData(descriptor),
              });
            } catch (error) {
              if (!uniqueConstraint(error)) throw error;
              const raced = await transaction.executionRequestDescriptorRecord.findFirst({
                where: { ...scopeWhere(operationContext.tenantScope), jobId: descriptor.jobId },
              });
              if (raced === null || raced.canonicalHash !== descriptor.canonicalHash) {
                throw new Error('JRA_ADMISSION_DESCRIPTOR_CONFLICT');
              }
            }
          },
          findExecutionRequestByJob: async (operationContext, jobId) => {
            const row = await transaction.executionRequestDescriptorRecord.findFirst({
              where: { ...scopeWhere(operationContext.tenantScope), jobId },
            });
            if (row === null) return undefined;
            const jobRow = await transaction.jobRecord.findFirst({
              where: { ...scopeWhere(operationContext.tenantScope), id: row.jobId },
            });
            if (jobRow === null) throw new Error('JRA_PERSISTED_ADMISSION_JOB_MISSING');
            return rowDescriptor(row, await rowJob(transaction, jobRow));
          },
          saveDispatch: async (operationContext, record) => {
            const existing = await transaction.jobDispatchRecord.findFirst({
              where: {
                ...scopeWhere(operationContext.tenantScope),
                jobId: record.jobId,
                idempotencyKey: record.idempotencyKey,
              },
            });
            if (existing !== null) {
              if (JSON.stringify(rowDispatch(existing)) === JSON.stringify(record)) return;
              throw new Error('JRA_ADMISSION_DISPATCH_CONFLICT');
            }
            try {
              await transaction.jobDispatchRecord.create({ data: dispatchData(record) });
            } catch (error) {
              if (!uniqueConstraint(error)) throw error;
              const raced = await transaction.jobDispatchRecord.findFirst({
                where: {
                  ...scopeWhere(operationContext.tenantScope),
                  jobId: record.jobId,
                  idempotencyKey: record.idempotencyKey,
                },
              });
              if (raced === null || JSON.stringify(rowDispatch(raced)) !== JSON.stringify(record)) {
                throw new Error('JRA_ADMISSION_DISPATCH_CONFLICT');
              }
            }
          },
          findDispatchByIdempotency: async (operationContext, jobId, idempotencyKey) => {
            const row = await transaction.jobDispatchRecord.findFirst({
              where: { ...scopeWhere(operationContext.tenantScope), jobId, idempotencyKey },
            });
            return row === null ? undefined : rowDispatch(row);
          },
          ...(this.entitlementParticipant === undefined
            ? {}
            : {
                admitEntitlement: (operationContext: IamTenantContextV1, input: unknown) =>
                  this.entitlementParticipant!.admit(transaction, operationContext, input),
              }),
        };
        return work(adapter);
      },
      { isolationLevel: 'Serializable' },
    );
  }
}

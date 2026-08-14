import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeKeyV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IaeWorkerCapabilityRecordV1 } from '../application/worker-object-capability.port.js';
import { parseIaeWorkerResultFinalizationBindingV1 } from '../application/worker-object-capability.port.js';
import type {
  IaeWorkerResultFinalizationRepositoryPortV1,
  IaeWorkerResultFinalizationSaveV1,
  IaeWorkerResultFinalizationTransactionPortV1,
  IaeWorkerStoredFinalizationV1,
} from '../application/worker-result-finalization.service.js';
import type {
  IaeWorkerResultAttestationResolverPortV1,
  IaeWorkerResultFinalizationAttestationV1,
} from '../application/worker-result-finalization.port.js';

export interface WorkerResultCapabilityDatabaseRowV1 {
  readonly id: string;
  readonly grantType: string;
  readonly attemptId: string;
  readonly jobId: string;
  readonly workerId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly objectIds: unknown;
  readonly objectBindings: unknown;
  readonly resultFinalizationBinding: unknown;
  readonly action: string;
  readonly securityEpoch: number;
  readonly maxBytes: bigint | number;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly objectId: string | null;
  readonly contentSha256: string | null;
  readonly contentLength: bigint | number | null;
  readonly transferredAt: Date | null;
}

export interface WorkerResultAttestationDatabaseRowV1 {
  readonly id: string;
  readonly scopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly jobId: string;
  readonly attemptId: string;
  readonly executionDescriptorId: string;
  readonly executionDescriptorHash: string;
  readonly submissionId: string;
  readonly artifactVersionId: string;
  readonly contentSha256: string;
  readonly contentLength: bigint | number;
  readonly mediaType: string;
  readonly sourceLineageHash: string;
  readonly outputPolicyHash: string;
  readonly requestHash: string;
  readonly finalizedAt: Date;
}

interface DelegateV1<TRow> {
  findFirst(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<TRow | null>;
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<TRow>;
}

export interface WorkerResultFinalizationDatabaseClientV1 {
  readonly workerObjectCapabilityRecord: Pick<
    DelegateV1<WorkerResultCapabilityDatabaseRowV1>,
    'findFirst'
  >;
  readonly workerResultFinalizationAttestationRecord: DelegateV1<WorkerResultAttestationDatabaseRowV1>;
  readonly artifactVersion: Pick<DelegateV1<unknown>, 'create'>;
  readonly contentPlacement: Pick<DelegateV1<unknown>, 'create'>;
  readonly artifactLineageRecord: Pick<DelegateV1<unknown>, 'create'>;
  $transaction<TValue>(
    work: (transaction: WorkerResultFinalizationDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function scopeFrom(row: {
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
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_WORKER_RESULT_SCOPE_INVALID');
  return parsed.value;
}

function stable(value: unknown): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_WORKER_RESULT_ID_INVALID');
  return parsed.value;
}

function timestamp(value: Date) {
  const parsed = parseStrictUtcTimestampV1(value.toISOString());
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_WORKER_RESULT_TIMESTAMP_INVALID');
  return parsed.value;
}

function strings(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new Error('IAE_PERSISTED_WORKER_RESULT_CAPABILITY_INVALID');
  return Object.freeze(value as string[]);
}

function capability(row: WorkerResultCapabilityDatabaseRowV1): IaeWorkerCapabilityRecordV1 {
  if (row.grantType !== 'JOB_OUTPUT' || row.action !== 'WRITE' || row.objectId === null)
    throw new Error('IAE_PERSISTED_WORKER_RESULT_CAPABILITY_INVALID');
  const objectIds = strings(row.objectIds);
  const objectBindings = row.objectBindings as IaeWorkerCapabilityRecordV1['objectBindings'];
  const finalizationBinding = parseIaeWorkerResultFinalizationBindingV1(
    row.resultFinalizationBinding,
  );
  if (finalizationBinding === undefined)
    throw new Error('IAE_PERSISTED_WORKER_RESULT_BINDING_INVALID');
  const receipt =
    row.contentSha256 === null || row.contentLength === null || row.transferredAt === null
      ? undefined
      : Object.freeze({
          objectId: row.objectId,
          contentSha256: row.contentSha256,
          contentLength: Number(row.contentLength),
          transferredAt: timestamp(row.transferredAt),
        });
  return Object.freeze({
    schemaVersion: 1,
    grantType: 'JOB_OUTPUT',
    capabilityId: stable(row.id),
    attemptId: stable(row.attemptId),
    jobId: stable(row.jobId),
    workerId: stable(row.workerId),
    securityEpoch: row.securityEpoch,
    tenantScope: scopeFrom(row),
    objectIds,
    objectBindings,
    action: 'WRITE',
    maxBytes: Number(row.maxBytes),
    issuedAt: timestamp(row.issuedAt),
    expiresAt: timestamp(row.expiresAt),
    ...(row.revokedAt === null ? {} : { revokedAt: timestamp(row.revokedAt) }),
    ...(receipt === undefined ? {} : { transferReceipt: receipt }),
    resultFinalizationBinding: finalizationBinding,
  });
}

function attestation(
  row: WorkerResultAttestationDatabaseRowV1,
): IaeWorkerResultFinalizationAttestationV1 {
  const tenantScope = scopeFrom(row);
  if (row.scopeKey !== tenantScopeKeyV1(tenantScope))
    throw new Error('IAE_PERSISTED_WORKER_RESULT_SCOPE_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    attestationId: stable(row.id),
    tenantScope,
    jobId: stable(row.jobId),
    attemptId: stable(row.attemptId),
    executionDescriptorId: stable(row.executionDescriptorId),
    executionDescriptorHash: row.executionDescriptorHash,
    submissionId: stable(row.submissionId),
    artifactVersionId: stable(row.artifactVersionId),
    contentSha256: row.contentSha256,
    contentLength: Number(row.contentLength),
    mediaType: row.mediaType,
    sourceLineageHash: row.sourceLineageHash,
    outputPolicyHash: row.outputPolicyHash,
    finalizedAt: timestamp(row.finalizedAt),
  });
}

class PrismaWorkerResultFinalizationTransactionAdapter
  implements IaeWorkerResultFinalizationTransactionPortV1
{
  public constructor(private readonly database: WorkerResultFinalizationDatabaseClientV1) {}

  public async findCapability(scope: TenantScopeV1, capabilityId: StableIdentifierV1) {
    const row = await this.database.workerObjectCapabilityRecord.findFirst({
      where: { ...databaseScope(scope), id: capabilityId },
    });
    return row === null ? undefined : capability(row);
  }

  public async findAttestationBySubmission(scope: TenantScopeV1, submissionId: StableIdentifierV1) {
    const row = await this.database.workerResultFinalizationAttestationRecord.findFirst({
      where: { ...databaseScope(scope), scopeKey: tenantScopeKeyV1(scope), submissionId },
    });
    return row === null
      ? undefined
      : Object.freeze({ requestHash: row.requestHash, attestation: attestation(row) });
  }

  public async saveFinalization(input: IaeWorkerResultFinalizationSaveV1): Promise<void> {
    const scope = databaseScope(input.attestation.tenantScope);
    await this.database.artifactVersion.create({
      data: {
        ...scope,
        id: input.artifactVersion.id,
        artifactId: input.artifactVersion.artifactId,
        sourceKind: input.artifactVersion.sourceKind,
        dataMode: input.artifactVersion.dataMode,
        contentSha256: input.artifactVersion.contentSha256,
        byteSize: BigInt(input.artifactVersion.byteSize),
        mediaType: input.artifactVersion.mediaType,
        displayName: input.artifactVersion.displayName,
        createdAt: new Date(input.artifactVersion.createdAt),
        status: input.artifactVersion.status,
        scanState: input.artifactVersion.scanState,
      },
    });
    await this.database.contentPlacement.create({
      data: {
        ...scope,
        id: input.placement.id,
        artifactVersionId: input.placement.artifactVersionId,
        kind: input.placement.kind,
        opaqueReference: input.placement.opaqueReference,
        contentSha256: input.placement.contentSha256,
        payloadClass: input.placement.payloadClass,
        available: true,
        revision: 1,
        createdAt: new Date(input.placement.createdAt),
        updatedAt: new Date(input.placement.createdAt),
      },
    });
    await this.database.artifactLineageRecord.create({
      data: {
        ...scope,
        id: input.lineage.id,
        derivedArtifactVersionId: input.lineage.derivedArtifactVersionId,
        sourceVersionIds: input.lineage.sourceVersionIds,
        processorVersion: input.lineage.processorVersion,
        recipeVersion: input.lineage.recipeVersion,
        coordinateLineage: input.lineage.coordinateLineage,
        createdAt: new Date(input.lineage.createdAt),
      },
    });
    await this.database.workerResultFinalizationAttestationRecord.create({
      data: {
        ...scope,
        id: input.attestation.attestationId,
        scopeKey: tenantScopeKeyV1(input.attestation.tenantScope),
        jobId: input.attestation.jobId,
        attemptId: input.attestation.attemptId,
        executionDescriptorId: input.attestation.executionDescriptorId,
        executionDescriptorHash: input.attestation.executionDescriptorHash,
        submissionId: input.attestation.submissionId,
        artifactVersionId: input.attestation.artifactVersionId,
        contentSha256: input.attestation.contentSha256,
        contentLength: BigInt(input.attestation.contentLength),
        mediaType: input.attestation.mediaType,
        sourceLineageHash: input.attestation.sourceLineageHash,
        outputPolicyHash: input.attestation.outputPolicyHash,
        requestHash: input.requestHash,
        finalizedAt: new Date(input.attestation.finalizedAt),
      },
    });
  }
}

export class PrismaWorkerResultFinalizationAdapter
  implements IaeWorkerResultFinalizationRepositoryPortV1, IaeWorkerResultAttestationResolverPortV1
{
  public constructor(private readonly database: WorkerResultFinalizationDatabaseClientV1) {}

  public withTransaction<TValue>(
    _scope: TenantScopeV1,
    work: (transaction: IaeWorkerResultFinalizationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.database.$transaction((transaction) =>
      work(new PrismaWorkerResultFinalizationTransactionAdapter(transaction)),
    );
  }

  public async findAttestationBySubmission(
    scope: TenantScopeV1,
    submissionId: StableIdentifierV1,
  ): Promise<IaeWorkerStoredFinalizationV1 | undefined> {
    const row = await this.database.workerResultFinalizationAttestationRecord.findFirst({
      where: { ...databaseScope(scope), scopeKey: tenantScopeKeyV1(scope), submissionId },
    });
    return row === null
      ? undefined
      : Object.freeze({ requestHash: row.requestHash, attestation: attestation(row) });
  }

  public async resolveAttestation(input: {
    readonly tenantScope: TenantScopeV1;
    readonly attestationId: StableIdentifierV1;
  }): Promise<IaeWorkerResultFinalizationAttestationV1 | undefined> {
    const row = await this.database.workerResultFinalizationAttestationRecord.findFirst({
      where: {
        ...databaseScope(input.tenantScope),
        scopeKey: tenantScopeKeyV1(input.tenantScope),
        id: input.attestationId,
      },
    });
    return row === null ? undefined : attestation(row);
  }
}

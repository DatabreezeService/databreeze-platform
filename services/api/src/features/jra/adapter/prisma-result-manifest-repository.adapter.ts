import {
  createResultManifestV1,
  type ResultManifestV1,
} from '@databreeze/domain/result-manifest/v1';
import {
  tenantScopeContainsV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ResultManifestRepositoryPortV1,
  ResultManifestTransactionPortV1,
} from '../application/result-manifest-repository.port.js';

interface ResultManifestRowV1 {
  readonly id: string;
  readonly jobId: string;
  readonly attemptId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly sourceArtifactVersionIds: unknown;
  readonly outputIds: unknown;
  readonly outputHashes: unknown;
  readonly evidenceCoverage: string;
  readonly handlerDigest: string;
  readonly engineVersion: string;
  readonly attemptNumber: number;
  readonly reviewerId: string | null;
  readonly approvalState: string;
  readonly manifestHash: string;
  readonly generatedAt: Date;
}

interface ResultManifestDelegateV1 {
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<ResultManifestRowV1 | null>;
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<ResultManifestRowV1>;
}

export interface PrismaResultManifestDatabaseClientV1 {
  readonly resultManifestRecord: ResultManifestDelegateV1;
  $transaction<TValue>(
    work: (transaction: PrismaResultManifestDatabaseClientV1) => Promise<TValue>,
    options?: { readonly isolationLevel?: 'Serializable' },
  ): Promise<TValue>;
}

function scopeWhere(context: IamTenantContextV1): Readonly<Record<string, unknown>> {
  return {
    scopeType: context.tenantScope.scopeType,
    organizationId: context.tenantScope.organizationId,
    workspaceId:
      context.tenantScope.scopeType === 'organization'
        ? null
        : context.tenantScope.workspaceId,
    projectId: context.tenantScope.scopeType === 'project' ? context.tenantScope.projectId : null,
  };
}

function rowScope(row: ResultManifestRowV1) {
  const parsed = {
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  };
  return parsed;
}

function parseRow(row: ResultManifestRowV1): ResultManifestV1 | undefined {
  if (!(row.generatedAt instanceof Date) || !Number.isFinite(row.generatedAt.getTime())) {
    return undefined;
  }
  const created = createResultManifestV1({
    resultManifestId: row.id,
    jobId: row.jobId,
    attemptId: row.attemptId,
    tenantScope: rowScope(row),
    sourceArtifactVersionIds: row.sourceArtifactVersionIds,
    outputIds: row.outputIds,
    outputHashes: row.outputHashes,
    evidenceCoverage: row.evidenceCoverage,
    handlerDigest: row.handlerDigest,
    engineVersion: row.engineVersion,
    attemptNumber: row.attemptNumber,
    ...(row.reviewerId === null ? {} : { reviewerId: row.reviewerId }),
    approvalState: row.approvalState,
    manifestHash: row.manifestHash,
    generatedAt: row.generatedAt.toISOString(),
  });
  return created.accepted ? created.value : undefined;
}

function visible(context: IamTenantContextV1, manifest: ResultManifestV1): boolean {
  return (
    tenantScopeContainsV1(context.tenantScope, manifest.tenantScope) ||
    tenantScopeContainsV1(manifest.tenantScope, context.tenantScope)
  );
}

function manifestData(manifest: ResultManifestV1): Readonly<Record<string, unknown>> {
  return {
    id: manifest.resultManifestId,
    jobId: manifest.jobId,
    attemptId: manifest.attemptId,
    scopeType: manifest.tenantScope.scopeType,
    organizationId: manifest.tenantScope.organizationId,
    workspaceId:
      manifest.tenantScope.scopeType === 'organization' ? null : manifest.tenantScope.workspaceId,
    projectId: manifest.tenantScope.scopeType === 'project' ? manifest.tenantScope.projectId : null,
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

/** Durable result-manifest read/write adapter for local and single-client roots. */
export class PrismaResultManifestRepositoryAdapter implements ResultManifestRepositoryPortV1 {
  public constructor(private readonly client: PrismaResultManifestDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, manifest: ResultManifestV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, manifest.tenantScope)) {
      throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    }
    const existing = await this.client.resultManifestRecord.findFirst({
      where: { id: manifest.resultManifestId, ...scopeWhere(context) },
    });
    if (existing !== null) {
      const parsed = parseRow(existing);
      if (parsed !== undefined && JSON.stringify(parsed) === JSON.stringify(manifest)) return;
      throw new Error('JRA_IMMUTABLE_RESULT_MANIFEST');
    }
    const attempt = await this.client.resultManifestRecord.findFirst({
      where: { attemptId: manifest.attemptId, ...scopeWhere(context) },
    });
    if (attempt !== null) throw new Error('JRA_ATTEMPT_RESULT_CONFLICT');
    await this.client.resultManifestRecord.create({ data: manifestData(manifest) });
  }

  public async find(
    context: IamTenantContextV1,
    resultManifestId: StableIdentifierV1,
  ): Promise<ResultManifestV1 | undefined> {
    const row = await this.client.resultManifestRecord.findFirst({
      where: { id: resultManifestId, ...scopeWhere(context) },
    });
    if (row === null) return undefined;
    const manifest = parseRow(row);
    return manifest !== undefined && visible(context, manifest) ? manifest : undefined;
  }

  public async findByAttempt(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
  ): Promise<ResultManifestV1 | undefined> {
    const row = await this.client.resultManifestRecord.findFirst({
      where: { attemptId, ...scopeWhere(context) },
    });
    if (row === null) return undefined;
    const manifest = parseRow(row);
    return manifest !== undefined && visible(context, manifest) ? manifest : undefined;
  }

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ResultManifestTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction(
      async (transaction) =>
        work(new PrismaResultManifestRepositoryAdapter(transaction)),
      { isolationLevel: 'Serializable' },
    );
  }
}

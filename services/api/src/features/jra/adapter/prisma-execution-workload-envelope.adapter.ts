import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  executionWorkloadEnvelopeCanonicalHashV1,
  type ExecutionWorkloadEnvelopePersistencePortV1,
  type ExecutionWorkloadEnvelopeV1,
  verifyExecutionWorkloadEnvelopeV1,
} from '../application/execution-workload-envelope.js';
import type { WorkerIdentityV1 } from '../worker/worker-ports.js';

export interface ExecutionWorkloadEnvelopeDatabaseRowV1 {
  readonly workloadId: string;
  readonly descriptorId: string;
  readonly attemptId: string;
  readonly jobId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly descriptorHash: string;
  readonly attemptBindingHash: string;
  readonly envelope: unknown;
  readonly canonicalHash: string;
  readonly createdAt: Date;
}

interface ExecutionWorkloadEnvelopeDelegateV1 {
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<ExecutionWorkloadEnvelopeDatabaseRowV1 | null>;
  create(input: {
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<ExecutionWorkloadEnvelopeDatabaseRowV1>;
}

export interface ExecutionWorkloadEnvelopeDatabaseClientV1 {
  readonly executionWorkloadEnvelopeRecord: ExecutionWorkloadEnvelopeDelegateV1;
}

function scopeWhere(scope: TenantScopeV1): Readonly<Record<string, unknown>> {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  };
}

function scopeFrom(row: ExecutionWorkloadEnvelopeDatabaseRowV1): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  return parsed.accepted ? parsed.value : undefined;
}

function stable(value: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(value);
  return parsed.accepted ? parsed.value : undefined;
}

function hash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function parseEnvelope(
  row: ExecutionWorkloadEnvelopeDatabaseRowV1,
): ExecutionWorkloadEnvelopeV1 | undefined {
  if (
    !row ||
    !hash(row.descriptorHash) ||
    !hash(row.attemptBindingHash) ||
    !hash(row.canonicalHash)
  ) {
    return undefined;
  }
  const scope = scopeFrom(row);
  const workloadId = stable(row.workloadId);
  const descriptorId = stable(row.descriptorId);
  const attemptId = stable(row.attemptId);
  const jobId = stable(row.jobId);
  if (!scope || !workloadId || !descriptorId || !attemptId || !jobId) return undefined;
  if (typeof row.envelope !== 'object' || row.envelope === null || Array.isArray(row.envelope)) {
    return undefined;
  }
  const candidate = row.envelope as Record<string, unknown>;
  if (
    candidate['schemaVersion'] !== 1 ||
    candidate['workloadId'] !== workloadId ||
    candidate['descriptorId'] !== descriptorId ||
    candidate['attemptId'] !== attemptId ||
    candidate['jobId'] !== jobId ||
    candidate['descriptorHash'] !== row.descriptorHash ||
    candidate['attemptBindingHash'] !== row.attemptBindingHash ||
    candidate['canonicalHash'] !== row.canonicalHash ||
    typeof candidate['tenantScope'] !== 'object' ||
    candidate['tenantScope'] === null ||
    typeof candidate['action'] !== 'object' ||
    candidate['action'] === null ||
    !Array.isArray(candidate['inputHandles']) ||
    typeof candidate['inputManifestHash'] !== 'string' ||
    !hash(candidate['inputManifestHash']) ||
    typeof candidate['parameters'] !== 'object' ||
    candidate['parameters'] === null ||
    typeof candidate['outputPolicy'] !== 'object' ||
    candidate['outputPolicy'] === null ||
    typeof candidate['deadline'] !== 'string' ||
    !parseStrictUtcTimestampV1(candidate['deadline']).accepted ||
    (candidate['locale'] !== 'vi-VN' && candidate['locale'] !== 'en') ||
    typeof candidate['timezone'] !== 'string' ||
    typeof candidate['subjectBindings'] !== 'object' ||
    candidate['subjectBindings'] === null ||
    typeof candidate['createdAt'] !== 'string' ||
    !parseStrictUtcTimestampV1(candidate['createdAt']).accepted
  )
    return undefined;
  const envelope = candidate as unknown as ExecutionWorkloadEnvelopeV1;
  try {
    const envelopeScope = parseTenantScopeV1(candidate['tenantScope']);
    if (!envelopeScope.accepted || !tenantScopesEqualV1(envelopeScope.value, scope))
      return undefined;
    if (executionWorkloadEnvelopeCanonicalHashV1(envelope) !== row.canonicalHash) return undefined;
  } catch {
    return undefined;
  }
  return Object.freeze({ ...envelope, tenantScope: scope });
}

function rowData(envelope: ExecutionWorkloadEnvelopeV1): Readonly<Record<string, unknown>> {
  return {
    workloadId: envelope.workloadId,
    descriptorId: envelope.descriptorId,
    attemptId: envelope.attemptId,
    jobId: envelope.jobId,
    scopeType: envelope.tenantScope.scopeType,
    organizationId: envelope.tenantScope.organizationId,
    workspaceId:
      envelope.tenantScope.scopeType === 'organization' ? null : envelope.tenantScope.workspaceId,
    projectId: envelope.tenantScope.scopeType === 'project' ? envelope.tenantScope.projectId : null,
    descriptorHash: envelope.descriptorHash,
    attemptBindingHash: envelope.attemptBindingHash,
    envelope,
    canonicalHash: envelope.canonicalHash,
    createdAt: new Date(envelope.createdAt),
  };
}

/** Durable exact-scope persistence used by the eventual local/cloud worker resolver. */
export class PrismaExecutionWorkloadEnvelopeAdapter
  implements ExecutionWorkloadEnvelopePersistencePortV1
{
  public constructor(private readonly database: ExecutionWorkloadEnvelopeDatabaseClientV1) {}

  public async save(envelope: ExecutionWorkloadEnvelopeV1) {
    const existing = await this.database.executionWorkloadEnvelopeRecord.findFirst({
      where: { attemptId: envelope.attemptId, ...scopeWhere(envelope.tenantScope) },
    });
    if (existing !== null) {
      const parsed = parseEnvelope(existing);
      return parsed !== undefined && parsed.canonicalHash === envelope.canonicalHash
        ? ('REPLAYED' as const)
        : ('CONFLICT' as const);
    }
    const hashMatch = await this.database.executionWorkloadEnvelopeRecord.findFirst({
      where: { canonicalHash: envelope.canonicalHash },
    });
    if (hashMatch !== null) return 'CONFLICT' as const;
    await this.database.executionWorkloadEnvelopeRecord.create({ data: rowData(envelope) });
    return 'SAVED' as const;
  }

  public async find(input: {
    readonly identity: WorkerIdentityV1;
    readonly attemptId: StableIdentifierV1;
    readonly descriptorId: StableIdentifierV1;
    readonly descriptorHash: string;
    readonly attemptBindingHash: string;
    readonly now: string;
  }): Promise<ExecutionWorkloadEnvelopeV1 | undefined> {
    const row = await this.database.executionWorkloadEnvelopeRecord.findFirst({
      where: {
        attemptId: input.attemptId,
        descriptorId: input.descriptorId,
        descriptorHash: input.descriptorHash,
        attemptBindingHash: input.attemptBindingHash,
        ...scopeWhere(input.identity.tenantScope),
      },
    });
    if (row === null) return undefined;
    const envelope = parseEnvelope(row);
    if (envelope === undefined) return undefined;
    return verifyExecutionWorkloadEnvelopeV1(envelope, input) &&
      tenantScopesEqualV1(envelope.tenantScope, input.identity.tenantScope)
      ? envelope
      : undefined;
  }
}

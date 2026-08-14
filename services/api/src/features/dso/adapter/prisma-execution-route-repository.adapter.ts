import type {
  DataClassificationV1,
  SynchronizationPayloadClassV1,
} from '@databreeze/domain/data-mode/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  createExecutionRouteDecisionV1,
  type ExecutionRouteArtifactDataModeV1,
  type ExecutionRouteDecisionV1,
} from '../application/execution-route-decision.js';
import type { ExecutionRouteRepositoryPortV1 } from '../application/execution-route-repository.port.js';

export interface ExecutionRouteDecisionDatabaseRowV1 {
  readonly id: string;
  readonly routeId: string;
  readonly revision: number;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly artifactVersionId: string;
  readonly artifactVersionHash: string;
  readonly placementId: string;
  readonly placementHash: string;
  readonly dataMode: string;
  readonly dataClassification: string;
  readonly payloadClass: string;
  readonly placementKind: string;
  readonly placementAvailable: boolean;
  readonly actionType: string;
  readonly actionVersion: number;
  readonly requiredCapabilities: unknown;
  readonly target: string;
  readonly targetDeviceId: string | null;
  readonly executorClass: string;
  readonly grantedCapabilities: unknown;
  readonly narrowingConstraints: unknown;
  readonly dataModePolicyId: string;
  readonly dataModePolicyVersionId: string;
  readonly dataModePolicyRevision: number;
  readonly dataModePolicyHash: string;
  readonly authorizationEpoch: number;
  readonly decisionSubjectHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

interface ExecutionRouteDecisionDelegateV1 {
  create(input: {
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<ExecutionRouteDecisionDatabaseRowV1>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<ExecutionRouteDecisionDatabaseRowV1 | null>;
}

export interface ExecutionRouteDatabaseClientV1 {
  readonly executionRouteDecisionRecord: ExecutionRouteDecisionDelegateV1;
}

function scopeWhere(tenantScope: TenantScopeV1): Readonly<Record<string, unknown>> {
  return {
    scopeType: tenantScope.scopeType,
    organizationId: tenantScope.organizationId,
    workspaceId: tenantScope.scopeType === 'organization' ? null : tenantScope.workspaceId,
    projectId: tenantScope.scopeType === 'project' ? tenantScope.projectId : null,
  };
}

function toData(decision: ExecutionRouteDecisionV1): Readonly<Record<string, unknown>> {
  return {
    id: decision.decisionId,
    routeId: decision.routeId,
    revision: decision.revision,
    ...scopeWhere(decision.tenantScope),
    artifactVersionId: decision.input.artifactVersionId,
    artifactVersionHash: decision.input.artifactVersionHash,
    placementId: decision.input.placementId,
    placementHash: decision.input.placementHash,
    dataMode: decision.input.dataMode,
    dataClassification: decision.input.classification,
    payloadClass: decision.input.payloadClass,
    placementKind: decision.input.placementKind,
    placementAvailable: decision.input.placementAvailable,
    actionType: decision.action.type,
    actionVersion: decision.action.version,
    requiredCapabilities: decision.action.requiredCapabilities,
    target: decision.target.target,
    targetDeviceId: decision.target.target === 'DEVICE' ? decision.target.targetDeviceId : null,
    executorClass: decision.target.executorClass,
    grantedCapabilities: decision.target.grantedCapabilities,
    narrowingConstraints: decision.narrowingConstraints,
    dataModePolicyId: decision.dataModePolicyId,
    dataModePolicyVersionId: decision.dataModePolicyVersionId,
    dataModePolicyRevision: decision.dataModePolicyRevision,
    dataModePolicyHash: decision.dataModePolicyHash,
    authorizationEpoch: decision.authorizationEpoch,
    decisionSubjectHash: decision.decisionSubjectHash,
    createdAt: new Date(decision.createdAt),
    expiresAt: new Date(decision.expiresAt),
  };
}

function stringList(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function fromRow(row: ExecutionRouteDecisionDatabaseRowV1): ExecutionRouteDecisionV1 {
  const requiredCapabilities = stringList(row.requiredCapabilities);
  const grantedCapabilities = stringList(row.grantedCapabilities);
  if (!requiredCapabilities || !grantedCapabilities || !Array.isArray(row.narrowingConstraints))
    throw new Error('DSO_PERSISTED_EXECUTION_ROUTE_INVALID');
  const tenantScope = {
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  } as TenantScopeV1;
  const parsed = createExecutionRouteDecisionV1({
    routeId: row.routeId,
    decisionId: row.id,
    revision: row.revision,
    subject: {
      tenantScope,
      input: {
        artifactVersionId: row.artifactVersionId,
        artifactVersionHash: row.artifactVersionHash,
        placementId: row.placementId,
        placementHash: row.placementHash,
        dataMode: row.dataMode as ExecutionRouteArtifactDataModeV1,
        classification: row.dataClassification as DataClassificationV1,
        payloadClass: row.payloadClass as SynchronizationPayloadClassV1,
        placementKind: row.placementKind,
        placementAvailable: row.placementAvailable,
      },
      action: {
        type: row.actionType,
        version: row.actionVersion,
        requiredCapabilities,
      },
      target:
        row.target === 'DEVICE'
          ? {
              target: 'DEVICE' as const,
              targetDeviceId: row.targetDeviceId ?? '',
              executorClass: row.executorClass,
              grantedCapabilities,
            }
          : {
              target: row.target as 'CLOUD',
              executorClass: row.executorClass,
              grantedCapabilities,
            },
      narrowingConstraints: row.narrowingConstraints as never,
      authorizationEpoch: row.authorizationEpoch,
    },
    policy: {
      policyId: row.dataModePolicyId,
      policyVersionId: row.dataModePolicyVersionId,
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      revision: row.dataModePolicyRevision,
      canonicalHash: row.dataModePolicyHash,
    },
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  });
  if (!parsed.accepted || parsed.value.decisionSubjectHash !== row.decisionSubjectHash)
    throw new Error('DSO_PERSISTED_EXECUTION_ROUTE_INVALID');
  return parsed.value;
}

/** DSO-024/IAM-009: immutable persistence with exact full-scope lookup only. */
export class PrismaExecutionRouteRepositoryAdapter implements ExecutionRouteRepositoryPortV1 {
  public constructor(private readonly client: ExecutionRouteDatabaseClientV1) {}

  public async save(decision: ExecutionRouteDecisionV1): Promise<void> {
    const where = { id: decision.decisionId, ...scopeWhere(decision.tenantScope) };
    const existing = await this.client.executionRouteDecisionRecord.findFirst({ where });
    if (existing !== null) {
      if (JSON.stringify(fromRow(existing)) === JSON.stringify(decision)) return;
      throw new Error('DSO_IMMUTABLE_EXECUTION_ROUTE_DECISION');
    }
    await this.client.executionRouteDecisionRecord.create({ data: toData(decision) });
  }

  public async findExact(
    input: Parameters<ExecutionRouteRepositoryPortV1['findExact']>[0],
  ): Promise<ExecutionRouteDecisionV1 | undefined> {
    const row = await this.client.executionRouteDecisionRecord.findFirst({
      where: { id: input.decisionId, ...scopeWhere(input.tenantScope) },
    });
    return row === null ? undefined : fromRow(row);
  }
}

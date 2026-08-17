import {
  tenantScopeContainsV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  SourceCatalogRecordV1,
  SourceCatalogRepositoryPortV1,
} from '../application/source-catalog-repository.port.js';
import type { SourceCatalogRegistrationPortV1 } from '../application/source-catalog-registration.port.js';

function clone(record: SourceCatalogRecordV1): SourceCatalogRecordV1 {
  return Object.freeze({
    ...record,
    ...(record.deniedPrincipalIds
      ? { deniedPrincipalIds: Object.freeze([...record.deniedPrincipalIds]) }
      : {}),
    ...(record.evidenceOverlay
      ? { evidenceOverlay: Object.freeze({ ...record.evidenceOverlay }) }
      : {}),
  });
}

export interface SourceCatalogAssignmentRecordV1 {
  readonly id: StableIdentifierV1;
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly projectId?: StableIdentifierV1;
  readonly sourceId: StableIdentifierV1;
  readonly dsmDatasetId: StableIdentifierV1;
  readonly status: string;
}

function sourceScope(record: {
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly projectId?: StableIdentifierV1;
}): TenantScopeV1 {
  return record.projectId === undefined
    ? {
        scopeType: 'workspace',
        organizationId: record.organizationId,
        workspaceId: record.workspaceId,
      }
    : {
        scopeType: 'project',
        organizationId: record.organizationId,
        workspaceId: record.workspaceId,
        projectId: record.projectId,
      };
}

function visible(context: IamTenantContextV1, record: SourceCatalogRecordV1): boolean {
  const recordScope = sourceScope(record);
  // Workspace rows are inherited by project contexts; project rows are visible
  // to their workspace ancestor, but never to a sibling project.
  return (
    tenantScopeContainsV1(context.tenantScope, recordScope) ||
    tenantScopeContainsV1(recordScope, context.tenantScope)
  );
}

function authorized(context: IamTenantContextV1, record: SourceCatalogRecordV1): boolean {
  return !(record.deniedPrincipalIds ?? []).includes(context.actorId);
}

/** Deterministic local adapter for DDA-052 source catalog records. */
export class InMemorySourceCatalogRepositoryAdapter
  implements SourceCatalogRepositoryPortV1, SourceCatalogRegistrationPortV1
{
  private records: SourceCatalogRecordV1[] = [];
  private assignments: SourceCatalogAssignmentRecordV1[] = [];

  public seed(records: readonly SourceCatalogRecordV1[]): void {
    this.records = records.map((record) => clone(record));
    this.assignments = records.map((record) => ({
      id: record.id,
      organizationId: record.organizationId,
      workspaceId: record.workspaceId,
      ...(record.projectId === undefined ? {} : { projectId: record.projectId }),
      sourceId: record.id,
      dsmDatasetId: record.dsmDatasetId,
      status: 'ACTIVE',
    }));
  }

  public seedAssignments(assignments: readonly SourceCatalogAssignmentRecordV1[]): void {
    this.assignments = assignments.map((assignment) => Object.freeze({ ...assignment }));
  }

  public async register(
    context: IamTenantContextV1,
    record: SourceCatalogRecordV1,
  ): Promise<void> {
    if (
      record.organizationId !== context.tenantScope.organizationId ||
      context.tenantScope.scopeType === 'organization' ||
      record.workspaceId !== context.tenantScope.workspaceId
    ) {
      throw new Error('SOURCE_CATALOG_SCOPE_CONFLICT');
    }
    const existing = this.records.find((candidate) => candidate.id === record.id);
    if (
      existing !== undefined &&
      (existing.organizationId !== record.organizationId ||
        existing.workspaceId !== record.workspaceId ||
        existing.dsmDatasetId !== record.dsmDatasetId ||
        existing.iaeArtifactVersionId !== record.iaeArtifactVersionId)
    ) {
      throw new Error('SOURCE_CATALOG_ID_CONFLICT');
    }
    if (existing === undefined) this.records.push(clone(record));
    const assignment = {
      id: record.id,
      organizationId: record.organizationId,
      workspaceId: record.workspaceId,
      ...(record.projectId === undefined ? {} : { projectId: record.projectId }),
      sourceId: record.id,
      dsmDatasetId: record.dsmDatasetId,
      status: 'ACTIVE',
    } satisfies SourceCatalogAssignmentRecordV1;
    const assignmentIndex = this.assignments.findIndex(
      (candidate) =>
        candidate.organizationId === assignment.organizationId &&
        candidate.workspaceId === assignment.workspaceId &&
        candidate.sourceId === assignment.sourceId &&
        candidate.dsmDatasetId === assignment.dsmDatasetId,
    );
    if (assignmentIndex < 0) this.assignments.push(Object.freeze(assignment));
    else this.assignments[assignmentIndex] = Object.freeze(assignment);
  }

  private hasCanonicalActiveAssignment(record: SourceCatalogRecordV1): boolean {
    const activeAssignments = this.assignments.filter(
      (assignment) =>
        assignment.status === 'ACTIVE' &&
        assignment.organizationId === record.organizationId &&
        assignment.workspaceId === record.workspaceId &&
        assignment.sourceId === record.id,
    );
    return (
      activeAssignments.length === 1 && activeAssignments[0]?.dsmDatasetId === record.dsmDatasetId
    );
  }

  public async listByDataset(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly SourceCatalogRecordV1[]> {
    await Promise.resolve();
    return this.records
      .filter(
        (record) =>
          visible(context, record) &&
          authorized(context, record) &&
          this.hasCanonicalActiveAssignment(record) &&
          record.dsmDatasetId === datasetId,
      )
      .map((record) => clone(record));
  }

  public async findSource(
    context: IamTenantContextV1,
    sourceId: StableIdentifierV1,
  ): Promise<SourceCatalogRecordV1 | undefined> {
    await Promise.resolve();
    const record = this.records.find((item) => item.id === sourceId);
    if (
      !record ||
      !visible(context, record) ||
      !authorized(context, record) ||
      !this.hasCanonicalActiveAssignment(record)
    )
      return undefined;
    return clone(record);
  }
}

import { createHash, randomUUID } from 'node:crypto';

import {
  parseStableIdentifierV1,
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { CrfReportCreateCommand } from '@databreeze/contracts/v4';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { IamHierarchyRepositoryPortV1 } from '../../iam/application/hierarchy-repository.port.js';
import type { DatasetVersionRepositoryPortV1 } from '../../dsm/application/dataset-version-repository.port.js';
import type { GovernedDatasetRepositoryPortV1 } from '../../dsm/application/governed-dataset-repository.port.js';
import {
  type CrfReportDetailV1,
  type CrfReportListPageV1,
  type CrfReportListQueryV1,
  type CrfReportRepositoryPortV1,
  type CrfReportRunDetailV1,
} from './report-repository.port.js';

export type CrfReportServiceErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_COMMAND'
  | 'DATASET_NOT_FOUND'
  | 'DATASET_NOT_READY'
  | 'DATASET_SCOPE_DENIED'
  | 'CLIENT_NOT_FOUND'
  | 'CLIENT_SCOPE_DENIED'
  | 'AUTHORITY_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT';

export type CrfReportServiceResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: CrfReportServiceErrorCodeV1 };

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  return 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

function identifier(value: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(value);
  return parsed.accepted ? parsed.value : undefined;
}

export class CrfReportService {
  public constructor(
    private readonly repository: CrfReportRepositoryPortV1,
    private readonly governedDatasets: GovernedDatasetRepositoryPortV1,
    private readonly datasetVersions: DatasetVersionRepositoryPortV1,
    private readonly hierarchy?: IamHierarchyRepositoryPortV1,
  ) {}

  public list(
    context: IamTenantContextV1,
    query: CrfReportListQueryV1,
  ): Promise<CrfReportListPageV1> {
    return this.repository.list(context, query);
  }

  public find(
    context: IamTenantContextV1,
    reportId: StableIdentifierV1,
  ): Promise<CrfReportDetailV1 | undefined> {
    return this.repository.find(context, reportId);
  }

  public findRun(
    context: IamTenantContextV1,
    reportId: StableIdentifierV1,
    runId: StableIdentifierV1,
  ): Promise<CrfReportRunDetailV1 | undefined> {
    return this.repository.findRun(context, reportId, runId);
  }

  public async create(
    context: IamTenantContextV1,
    command: CrfReportCreateCommand,
    idempotencyKey: string,
  ): Promise<CrfReportServiceResultV1<CrfReportDetailV1>> {
    const clientId = identifier(command.clientId);
    const datasetId = identifier(command.datasetId);
    const datasetVersionId = identifier(command.datasetVersionId);
    if (
      clientId === undefined ||
      datasetId === undefined ||
      datasetVersionId === undefined ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 200
    ) {
      return { accepted: false, code: 'INVALID_COMMAND' };
    }
    // CRF-001/CRF-002: client/project identity is IAM-owned. The browser may
    // select a project, but it cannot mint or smuggle an arbitrary client ID
    // into a report definition.
    if (this.hierarchy === undefined) return { accepted: false, code: 'AUTHORITY_UNAVAILABLE' };
    let clientProject;
    try {
      clientProject = await this.hierarchy.findProject(context, clientId);
    } catch {
      return { accepted: false, code: 'AUTHORITY_UNAVAILABLE' };
    }
    if (clientProject === undefined) return { accepted: false, code: 'CLIENT_NOT_FOUND' };
    const clientScope = {
      scopeType: 'project' as const,
      organizationId: clientProject.organizationId,
      workspaceId: clientProject.workspaceId,
      projectId: clientProject.id,
    };
    if (
      clientProject.kind !== 'CLIENT' ||
      clientProject.status !== 'ACTIVE' ||
      !tenantScopeContainsV1(context.tenantScope, clientScope)
    ) {
      return { accepted: false, code: 'CLIENT_SCOPE_DENIED' };
    }
    const definition = await this.governedDatasets.find(context, datasetVersionId);
    if (definition === undefined) return { accepted: false, code: 'DATASET_NOT_FOUND' };
    if (
      !tenantScopesEqualV1(context.tenantScope, definition.tenantScope) ||
      definition.datasetId !== datasetId ||
      definition.status !== 'PUBLISHED'
    ) {
      return { accepted: false, code: 'DATASET_SCOPE_DENIED' };
    }
    const version = await this.datasetVersions.find(context, datasetVersionId);
    if (
      version === undefined ||
      version.datasetId !== datasetId ||
      !tenantScopesEqualV1(context.tenantScope, version.tenantScope)
    ) {
      return { accepted: false, code: 'DATASET_NOT_FOUND' };
    }
    if (version.qualityState !== 'PASS' && version.qualityState !== 'PASS_WITH_WARNINGS') {
      return { accepted: false, code: 'DATASET_NOT_READY' };
    }
    const now = new Date().toISOString();
    const canonicalHash = digest({
      schemaVersion: command.schemaVersion,
      name: command.name,
      clientId,
      period: command.period,
      datasetId,
      datasetVersionId,
      supportedFormats: [...command.supportedFormats].sort(),
    });
    try {
      const report = await this.repository.createDefinition(context, {
        reportId: randomUUID() as StableIdentifierV1,
        idempotencyKey,
        clientId,
        name: command.name.normalize('NFC').trim(),
        period: command.period.normalize('NFC').trim(),
        datasetId,
        datasetVersionId,
        templateId: randomUUID() as StableIdentifierV1,
        templateVersion: 1,
        supportedFormats: command.supportedFormats,
        blocks: Object.freeze([]),
        canonicalHash,
        createdAt: now,
      });
      return { accepted: true, value: report };
    } catch (error) {
      if (error instanceof Error && error.message === 'CRF_REPORT_IDEMPOTENCY_CONFLICT')
        return { accepted: false, code: 'IDEMPOTENCY_CONFLICT' };
      throw error;
    }
  }
}

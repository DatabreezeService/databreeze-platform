import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const CRF_REPORT_REPOSITORY_PORT = Symbol('CRF_REPORT_REPOSITORY_PORT');

export type CrfReportStatusV1 =
  | 'DRAFT'
  | 'RUNNING'
  | 'REVIEW'
  | 'RELEASED'
  | 'WITHDRAWN'
  | 'BLOCKED';
export type CrfReportRunStatusV1 =
  | 'QUEUED'
  | 'RUNNING'
  | 'BLOCKED'
  | 'REVIEW'
  | 'RELEASED'
  | 'FAILED';
export type CrfReportFormatV1 = 'DOCX' | 'PPTX' | 'XLSX' | 'PDF' | 'WEB';
export type CrfReportOutputStateV1 = 'PENDING' | 'READY' | 'FAILED' | 'WITHDRAWN';

export interface CrfReportSummaryV1 {
  readonly schemaVersion: 4;
  readonly reportId: StableIdentifierV1;
  readonly name: string;
  readonly clientId: StableIdentifierV1;
  readonly period: string;
  readonly datasetId: StableIdentifierV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly status: CrfReportStatusV1;
  readonly reportVersion: number;
  readonly updatedAt: string;
  readonly latestRunStatus?: CrfReportRunStatusV1;
}

export interface CrfReportRunSummaryV1 {
  readonly runId: StableIdentifierV1;
  readonly reportVersion: number;
  readonly status: CrfReportRunStatusV1;
  readonly createdAt: string;
  readonly finishedAt?: string;
}

export interface CrfReportDetailV1 extends CrfReportSummaryV1 {
  readonly templateId: StableIdentifierV1;
  readonly templateVersion: number;
  readonly supportedFormats: readonly CrfReportFormatV1[];
  readonly blockCount: number;
  readonly latestRun?: CrfReportRunSummaryV1;
}

export interface CrfReportOutputSummaryV1 {
  readonly format: CrfReportFormatV1;
  readonly state: CrfReportOutputStateV1;
  readonly failureCode?: string;
}

export interface CrfReportRunDetailV1 {
  readonly runId: StableIdentifierV1;
  readonly reportId: StableIdentifierV1;
  readonly reportVersion: number;
  readonly status: CrfReportRunStatusV1;
  readonly createdAt: string;
  readonly finishedAt?: string;
  readonly frozen: true;
  readonly jraBound: boolean;
  readonly outputs: readonly CrfReportOutputSummaryV1[];
  readonly evidence: {
    readonly factCount: number;
    readonly referenceCount: number;
    readonly complete: boolean;
  };
}

export interface CrfReportListQueryV1 {
  readonly limit: number;
  readonly cursor?: string;
}

export interface CrfReportListPageV1 {
  readonly items: readonly CrfReportSummaryV1[];
  readonly nextCursor?: string;
}

export interface CrfReportCreateDefinitionInputV1 {
  readonly reportId: StableIdentifierV1;
  readonly idempotencyKey: string;
  readonly clientId: StableIdentifierV1;
  readonly name: string;
  readonly period: string;
  readonly datasetId: StableIdentifierV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly templateId: StableIdentifierV1;
  readonly templateVersion: number;
  readonly supportedFormats: readonly CrfReportFormatV1[];
  readonly blocks: readonly Readonly<Record<string, unknown>>[];
  readonly canonicalHash: string;
  readonly createdAt: string;
}

export interface CrfReportRepositoryPortV1 {
  list(context: IamTenantContextV1, query: CrfReportListQueryV1): Promise<CrfReportListPageV1>;
  find(
    context: IamTenantContextV1,
    reportId: StableIdentifierV1,
  ): Promise<CrfReportDetailV1 | undefined>;
  findRun(
    context: IamTenantContextV1,
    reportId: StableIdentifierV1,
    runId: StableIdentifierV1,
  ): Promise<CrfReportRunDetailV1 | undefined>;
  createDefinition(
    context: IamTenantContextV1,
    input: CrfReportCreateDefinitionInputV1,
  ): Promise<CrfReportDetailV1>;
}

/** Production default: CRF must never appear empty when persistence is unavailable. */
export class UnavailableCrfReportRepositoryAdapter implements CrfReportRepositoryPortV1 {
  public list(): Promise<CrfReportListPageV1> {
    return Promise.reject(new Error('CRF_REPORT_REPOSITORY_UNAVAILABLE'));
  }

  public find(): Promise<CrfReportDetailV1 | undefined> {
    return Promise.reject(new Error('CRF_REPORT_REPOSITORY_UNAVAILABLE'));
  }

  public findRun(): Promise<CrfReportRunDetailV1 | undefined> {
    return Promise.reject(new Error('CRF_REPORT_REPOSITORY_UNAVAILABLE'));
  }

  public createDefinition(): Promise<CrfReportDetailV1> {
    return Promise.reject(new Error('CRF_REPORT_REPOSITORY_UNAVAILABLE'));
  }
}

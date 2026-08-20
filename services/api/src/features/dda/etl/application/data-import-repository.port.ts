import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export const DATA_IMPORT_REPOSITORY_PORT = Symbol('DATA_IMPORT_REPOSITORY_PORT');

export type DataImportStateV1 =
  | 'REVIEW_REQUIRED'
  | 'REVISING'
  | 'APPROVED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED';

export type DataImportDestinationV1 = 'NEW_DATASET' | 'EXISTING_DATASET';

export interface DataImportFieldV1 {
  readonly fieldId: string;
  readonly name: string;
  readonly type: 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE';
  readonly nullable: boolean;
}

export interface DataImportSourceV1 {
  readonly sessionId: string;
  readonly artifactVersionId: string;
  readonly fileName: string;
  readonly mediaType: string;
  /** The accepted CSV decoder, retained so approved immutable bytes replay faithfully. */
  readonly declaredEncoding?: 'utf-8' | 'utf-8-sig' | 'windows-1258';
  readonly contentSha256: string;
  readonly byteSize: number;
  readonly rowCount: number;
  readonly fields: readonly DataImportFieldV1[];
  readonly sampleRows: readonly Readonly<Record<string, string | number | boolean | null>>[];
}

export interface DataImportCorrectionV1 {
  readonly correctionId: string;
  readonly message: string;
  readonly fieldName?: string;
  readonly createdAt: string;
}

export interface DataImportReviewV1 {
  readonly beforeSample: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly afterSample: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly counts: {
    readonly input: number;
    readonly output: number;
    readonly changed: number;
    readonly rejected: number;
  };
  readonly quality: Readonly<
    Record<'completeness' | 'validity' | 'uniqueness' | 'consistency', number>
  >;
  readonly warnings: readonly string[];
  readonly corrections: readonly DataImportCorrectionV1[];
  readonly reviewRequired: true;
}

export interface DataImportAcceptedV1 {
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly definitionVersionId: string;
  readonly dashboardStatus: 'BUILDING' | 'UNAVAILABLE';
  /** The command key is part of the durable replay binding. */
  readonly approvalIdempotencyKey: string;
  readonly approvedAt: string;
}

export interface DataImportRecordV1 {
  readonly importId: string;
  readonly tenantScope: TenantScopeV1;
  readonly revision: number;
  readonly state: DataImportStateV1;
  readonly destination: DataImportDestinationV1;
  readonly datasetId?: string;
  readonly datasetName: string;
  readonly idempotencyKey: string;
  readonly payloadFingerprint: string;
  readonly sources: readonly DataImportSourceV1[];
  readonly review: DataImportReviewV1;
  readonly accepted?: DataImportAcceptedV1;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DataImportRepositoryPortV1 {
  /** expectedRevision makes review/correction/approval a durable compare-and-set. */
  save(record: DataImportRecordV1, expectedRevision?: number): Promise<DataImportRecordV1>;
  findById(importId: string, tenantScope: TenantScopeV1): Promise<DataImportRecordV1 | undefined>;
  list(tenantScope: TenantScopeV1, limit: number): Promise<readonly DataImportRecordV1[]>;
}

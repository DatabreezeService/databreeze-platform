import type {
  StableIdentifierV1,
  TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export const SOURCE_CATALOG_REPOSITORY_PORT = Symbol('SOURCE_CATALOG_REPOSITORY_PORT');

export type SourceCatalogSourceTypeV1 =
  | 'CSV'
  | 'XLSX'
  | 'IMAGE'
  | 'PDF'
  | 'RECEIPT'
  | 'TABLE';

export type SourceCatalogStatusV1 = 'ACTIVE' | 'REVIEW' | 'QUARANTINED' | 'RETIRED';
export type SourceCatalogHealthV1 = 'HEALTHY' | 'WARNING' | 'BLOCKED' | 'UNKNOWN';
export type SourceCatalogDataModeV1 = 'CLOUD' | 'HYBRID' | 'LOCAL';
export type SourceCatalogPreviewKindV1 =
  | 'CSV_SAFE_GRID'
  | 'XLSX_SAFE_GRID'
  | 'IMAGE'
  | 'PDF'
  | 'OPEN_ON_SOURCE_DEVICE';

export interface SourceCatalogEvidenceOverlayV1 {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SourceCatalogRecordV1 {
  readonly id: StableIdentifierV1;
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly projectId?: StableIdentifierV1;
  readonly dsmDatasetId: StableIdentifierV1;
  readonly iaeArtifactVersionId: StableIdentifierV1;
  readonly sourceType: SourceCatalogSourceTypeV1;
  readonly safeDisplayLabel: string;
  readonly status: SourceCatalogStatusV1;
  readonly health: SourceCatalogHealthV1;
  readonly versionId: StableIdentifierV1;
  readonly dataMode: SourceCatalogDataModeV1;
  readonly revision: number;
  readonly updatedAt: string;
  readonly deniedPrincipalIds?: readonly StableIdentifierV1[];
  readonly previewKind?: SourceCatalogPreviewKindV1;
  readonly hasMacros?: boolean;
  readonly hasExternalLinks?: boolean;
  readonly evidenceOverlay?: SourceCatalogEvidenceOverlayV1;
  readonly iaeMissing?: boolean;
}

export interface SourceCatalogRepositoryPortV1 {
  listByDataset(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly SourceCatalogRecordV1[]>;
  findSource(
    context: IamTenantContextV1,
    sourceId: StableIdentifierV1,
  ): Promise<SourceCatalogRecordV1 | undefined>;
}

export type { TenantScopeV1 };

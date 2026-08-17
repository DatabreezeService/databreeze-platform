import type { QualityDimensionViewV1 } from '../data-intake/quality-dimensions.tsx';

export type DatasetHealthToneV1 = 'HEALTHY' | 'WARNING' | 'BLOCKED' | 'UNKNOWN';
export type GovernedFieldTypeV1 = 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE';

export interface DatasetHealthV1 {
  readonly label: string;
  readonly tone: DatasetHealthToneV1;
}

export interface DatasetRefreshV1 {
  readonly stateLabel: string;
  readonly lastSuccessfulLabel?: string;
  readonly reasonLabel?: string;
}

export interface DatasetVersionSummaryV1 {
  readonly versionId: string;
  readonly label: string;
  readonly stateLabel: string;
}

export type DatasetOriginalActionV1 = 'VIEW_SAFE' | 'OPEN_ON_SOURCE_DEVICE' | 'NONE';

/** DDA-052: content-safe catalog entry; it deliberately has no local-path field. */
export interface DatasetSourceFileV1 {
  readonly sourceId: string;
  readonly label: string;
  readonly sourceType: 'CSV' | 'XLSX' | 'IMAGE' | 'PDF' | 'RECEIPT' | 'TABLE';
  readonly versionLabel?: string;
  readonly statusLabel: string;
  readonly healthLabel: string;
  readonly originalAction: DatasetOriginalActionV1;
  readonly evidenceAvailable: boolean;
  readonly extractionReview?: {
    readonly uncertainFields: readonly string[];
  };
}

export interface DatasetPreparationSummaryV1 {
  readonly automaticPolicy: 'SAFE_NON_LOSSY' | 'NONE';
  readonly counts: {
    readonly input: number;
    readonly output: number;
    readonly unchanged: number;
    readonly changed: number;
    readonly rejected: number;
    readonly quarantined: number;
    readonly unsupported: number;
  };
  readonly transformations: readonly string[];
  readonly warnings: readonly string[];
  readonly healthDimensions: readonly QualityDimensionViewV1[];
  readonly overallSummary?: {
    readonly formula: string;
    readonly coverage: number;
    readonly provesFactualCorrectness: false;
  };
  readonly datasetVersionLabel: string;
  readonly engineVersionLabel: string;
}

export interface DatasetReviewItemV1 {
  readonly reviewId: string;
  readonly label: string;
  readonly stateLabel: string;
}

/**
 * Logical dataset presentation model. `READY` and related values remain for
 * the temporary legacy call sites while the normalized health object is used
 * by the final surface.
 */
export interface DatasetCardV1 {
  readonly datasetId: string;
  readonly versionId?: string;
  readonly label: string;
  readonly status?: 'PUBLISHED';
  readonly publishedAt?: string;
  readonly fieldCount?: number;
  readonly fieldTypes?: readonly GovernedFieldTypeV1[];
  readonly fieldNames?: readonly string[];
  readonly rowCount?: number;
  readonly quality?: DatasetQualityV1;
  readonly readiness?: 'READY';
  readonly health: DatasetHealthV1 | 'READY' | 'NEEDS_REVIEW' | 'BLOCKED';
  readonly versionLabel: string;
  readonly refresh?: DatasetRefreshV1;
  readonly versions?: readonly DatasetVersionSummaryV1[];
  readonly sources?: readonly DatasetSourceFileV1[];
  readonly preparation?: DatasetPreparationSummaryV1;
  readonly reviewItems?: readonly DatasetReviewItemV1[];
}

/**
 * Locale-free structural facts about one governed dataset version (DDA-052/DSM):
 * the record is the persisted source of truth; cards below are derived views.
 */
export interface DatasetFieldSchemaV1 {
  readonly name: string;
  readonly type: GovernedFieldTypeV1;
  readonly nullable: boolean;
}

export interface DatasetRecordVersionV1 {
  readonly versionId: string;
  readonly createdAt: string;
  readonly rowCount: number;
  readonly schema: readonly DatasetFieldSchemaV1[];
}

export type DatasetOriginV1 = 'LOCAL' | 'SERVER';
export type DatasetSyncStateV1 = 'LOCAL_ONLY' | 'SERVER_MIRRORED';

/**
 * Cleaning lifecycle (DDA-053): RAW after import, CLEANING while intents are
 * being planned/applied, REVIEW when the agent queue is empty, APPROVED once
 * the user locks the version. Approval is always a separate explicit action.
 */
export type DatasetCleaningStateV1 = 'RAW' | 'CLEANING' | 'REVIEW' | 'APPROVED';

export type CleaningIntentV1 =
  | { readonly kind: 'CHANGE_COLUMN_TYPE'; readonly column: string; readonly targetType: GovernedFieldTypeV1 }
  | { readonly kind: 'RENAME_COLUMN'; readonly column: string; readonly newName: string }
  | { readonly kind: 'DEDUPLICATE_ROWS' }
  | { readonly kind: 'NORMALIZE_VALUES'; readonly column: string; readonly trim: boolean; readonly lowercase: boolean }
  | { readonly kind: 'FILTER_ROWS'; readonly column: string; readonly operator: 'EMPTY' | 'NOT_EMPTY' | 'EQ' | 'NEQ'; readonly value?: string }
  | { readonly kind: 'FIX_DATE_FORMAT'; readonly column: string }
  | { readonly kind: 'MERGE_ON_KEY'; readonly sourceDatasetId: string; readonly keyColumn: string };

export interface CleaningRevisionV1 {
  readonly revisionId: string;
  readonly createdAt: string;
  readonly intents: readonly CleaningIntentV1[];
  readonly summaryVi: string;
  readonly summaryEn: string;
  readonly lossy: boolean;
  readonly rowCountBefore: number;
  readonly rowCountAfter: number;
}

export interface DatasetQualityV1 {
  readonly completeness: number;
  readonly validity: number;
  readonly uniqueness: number;
  readonly consistency: number;
}

export interface DatasetRecordV1 {
  readonly datasetId: string;
  readonly label: string;
  readonly origin: DatasetOriginV1;
  readonly syncState: DatasetSyncStateV1;
  readonly createdAt: string;
  readonly currentVersion: DatasetRecordVersionV1;
  readonly versions: readonly DatasetRecordVersionV1[];
  readonly sources: readonly DatasetSourceFileV1[];
  readonly preparation?: DatasetPreparationSummaryV1;
  readonly quality?: DatasetQualityV1;
  readonly projectId?: string;
  readonly cleaningState?: DatasetCleaningStateV1;
  readonly appliedRevisions?: readonly CleaningRevisionV1[];
}

export interface LocalProjectRecordV1 {
  readonly projectId: string;
  readonly label: string;
  readonly description?: string;
  readonly createdAt: string;
}

/** Locale-dependent strings snapshotted at import time so cards stay renderable without re-deriving. */
export interface DatasetRecordDisplayV1 {
  readonly healthLabel: string;
  readonly refreshStateLabel: string;
  readonly lastSuccessfulLabel: string;
}

export function datasetVersionLabelV1(
  record: DatasetRecordV1,
  locale: 'en' | 'vi-VN',
): string {
  const versionNumber = record.versions.length;
  const rowCount = record.currentVersion.rowCount;
  const columnCount = record.currentVersion.schema.length;
  return locale === 'vi-VN'
    ? `Phiên bản ${versionNumber} · ${rowCount.toLocaleString('vi-VN')} hàng · ${columnCount} cột`
    : `Version ${versionNumber} · ${rowCount.toLocaleString('en-US')} rows · ${columnCount} columns`;
}

export function datasetHealthFromQualityV1(
  quality: DatasetQualityV1 | undefined,
  locale: 'en' | 'vi-VN',
): DatasetHealthV1 {
  if (quality === undefined) {
    return { label: locale === 'vi-VN' ? 'Chưa đánh giá' : 'Not assessed', tone: 'UNKNOWN' };
  }
  if (quality.completeness >= 0.95 && quality.validity >= 0.95) {
    return { label: locale === 'vi-VN' ? 'Sẵn sàng phân tích' : 'Ready for analysis', tone: 'HEALTHY' };
  }
  if (quality.completeness >= 0.8 && quality.validity >= 0.8) {
    return { label: locale === 'vi-VN' ? 'Cần xem xét' : 'Needs review', tone: 'WARNING' };
  }
  return { label: locale === 'vi-VN' ? 'Đã chặn' : 'Blocked', tone: 'BLOCKED' };
}

export function toDatasetCardV1(record: DatasetRecordV1, locale: 'en' | 'vi-VN'): DatasetCardV1 {
  const currentVersionId = record.currentVersion.versionId;
  const health = datasetHealthFromQualityV1(record.quality, locale);
  return Object.freeze({
    datasetId: record.datasetId,
    versionId: currentVersionId,
    label: record.label,
    status: 'PUBLISHED' as const,
    publishedAt: record.currentVersion.createdAt,
    fieldCount: record.currentVersion.schema.length,
    fieldTypes: record.currentVersion.schema.map((field) => field.type),
    readiness: 'READY' as const,
    health,
    versionLabel: datasetVersionLabelV1(record, locale),
    refresh: Object.freeze({
      stateLabel:
        record.syncState === 'SERVER_MIRRORED'
          ? locale === 'vi-VN'
            ? 'Đã đồng bộ với máy chủ'
            : 'Mirrored from server'
          : record.origin === 'LOCAL'
            ? locale === 'vi-VN'
              ? 'Đã tải lên cục bộ'
              : 'Locally loaded'
            : locale === 'vi-VN'
              ? 'Đã duyệt từ máy chủ'
              : 'Server approved',
      lastSuccessfulLabel: record.currentVersion.createdAt,
    }),
    versions: record.versions.map((version, index) =>
      Object.freeze({
        versionId: version.versionId,
        label:
          locale === 'vi-VN' ? `Phiên bản ${index + 1}` : `Version ${index + 1}`,
        stateLabel:
          version.versionId === currentVersionId
            ? locale === 'vi-VN'
              ? 'Hiện tại'
              : 'Current'
            : locale === 'vi-VN'
              ? `Đã lưu · ${version.rowCount.toLocaleString('vi-VN')} hàng`
              : `Saved · ${version.rowCount.toLocaleString('en-US')} rows`,
      }),
    ),
    sources: record.sources,
    ...(record.preparation === undefined ? {} : { preparation: record.preparation }),
    reviewItems: [],
  });
}

export function normalizedDatasetHealth(
  health: DatasetCardV1['health'],
  locale: 'en' | 'vi-VN',
): DatasetHealthV1 {
  if (typeof health !== 'string') return health;
  if (health === 'READY') {
    return {
      label: locale === 'vi-VN' ? 'Sẵn sàng phân tích' : 'Ready for analysis',
      tone: 'HEALTHY',
    };
  }
  if (health === 'NEEDS_REVIEW') {
    return {
      label: locale === 'vi-VN' ? 'Cần xem xét' : 'Needs review',
      tone: 'WARNING',
    };
  }
  return {
    label: locale === 'vi-VN' ? 'Đã chặn' : 'Blocked',
    tone: 'BLOCKED',
  };
}

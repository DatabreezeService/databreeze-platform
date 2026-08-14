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
  readonly readiness?: 'READY';
  readonly health: DatasetHealthV1 | 'READY' | 'NEEDS_REVIEW' | 'BLOCKED';
  readonly versionLabel: string;
  readonly refresh?: DatasetRefreshV1;
  readonly versions?: readonly DatasetVersionSummaryV1[];
  readonly sources?: readonly DatasetSourceFileV1[];
  readonly preparation?: DatasetPreparationSummaryV1;
  readonly reviewItems?: readonly DatasetReviewItemV1[];
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

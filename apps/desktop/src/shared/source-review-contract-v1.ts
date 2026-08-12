export type SourceReviewActionV1 = 'MOVE' | 'KEEP' | 'REASSIGN' | 'VIEW_ALL' | 'LATER';

export interface SourceReviewRecordV1 {
  readonly reviewId: string;
  readonly fileLabel: string;
  readonly currentFolder: string;
  readonly suggestedFolder: string;
  readonly logicalDatasetLabel: string;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
  readonly sampleRows: readonly Readonly<Record<string, string>>[];
  readonly schemaComparison: {
    readonly current: readonly string[];
    readonly expected: readonly string[];
  };
  readonly actions: readonly SourceReviewActionV1[];
}

export const SOURCE_REVIEW_CONTRACT_V1 = Object.freeze({
  schemaVersion: 1 as const,
  maxSampleRows: 20 as const,
  actions: Object.freeze([
    'MOVE',
    'KEEP',
    'REASSIGN',
    'VIEW_ALL',
    'LATER',
  ] as const satisfies readonly SourceReviewActionV1[]),
});

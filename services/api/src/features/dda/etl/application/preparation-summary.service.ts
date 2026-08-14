export interface PreparationSummaryCountsV1 {
  readonly input: number;
  readonly output: number;
  readonly unchanged: number;
  readonly changed: number;
  readonly rejected: number;
  readonly quarantined: number;
  readonly unsupported: number;
}

export interface PreparationHealthDimensionV1 {
  readonly name: string;
  readonly numerator: number;
  readonly denominator: number;
  readonly coverage: number;
  readonly rule: string;
  readonly sampleStatus: 'PASS' | 'FAIL' | 'UNKNOWN';
  readonly limitation: string;
}

export interface PreparationSummaryInputV1 {
  readonly summaryId: string;
  readonly datasetVersionId: string;
  readonly automaticPolicy: 'SAFE_NON_LOSSY' | 'NONE';
  readonly counts: PreparationSummaryCountsV1;
  readonly transformations: readonly string[];
  readonly warnings: readonly string[];
  readonly exclusions: readonly {
    readonly scope: string;
    readonly reasonCode: string;
    readonly count: number;
  }[];
  readonly healthDimensions: readonly PreparationHealthDimensionV1[];
}

export interface PreparationSummaryV1 extends PreparationSummaryInputV1 {
  readonly percentageCorrectLabel?: never;
}

export type PreparationSummaryResultV1 =
  | { readonly accepted: true; readonly value: PreparationSummaryV1 }
  | { readonly accepted: false; readonly code: 'INCOMPLETE_ACCOUNTING' | 'INVALID_DIMENSIONS' };

function accountingComplete(counts: PreparationSummaryCountsV1): boolean {
  return (
    counts.unchanged +
      counts.changed +
      counts.rejected +
      counts.quarantined +
      counts.unsupported ===
    counts.input
  );
}

/** DDA-053: transparent preparation summary that never claims percentage-correct. */
export function buildPreparationSummary(
  input: PreparationSummaryInputV1,
): PreparationSummaryResultV1 {
  if (!accountingComplete(input.counts)) {
    return Object.freeze({ accepted: false, code: 'INCOMPLETE_ACCOUNTING' });
  }
  if (input.healthDimensions.length > 0 && input.healthDimensions.length !== 6) {
    return Object.freeze({ accepted: false, code: 'INVALID_DIMENSIONS' });
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      ...input,
      transformations: Object.freeze([...input.transformations]),
      warnings: Object.freeze([...input.warnings]),
      exclusions: Object.freeze(input.exclusions.map((item) => Object.freeze({ ...item }))),
      healthDimensions: Object.freeze(
        input.healthDimensions.map((item) => Object.freeze({ ...item })),
      ),
      counts: Object.freeze({ ...input.counts }),
    }),
  });
}

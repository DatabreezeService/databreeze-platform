import {
  classifyStableFile,
  type SourceClassificationInputV1,
  type SourceClassificationResultV1,
} from './source-classification.service.ts';

export interface FilePlacementPreviewV1 {
  readonly classification: SourceClassificationResultV1;
  readonly recommendedAction: 'MOVE' | 'KEEP' | 'REASSIGN' | 'LATER';
}

/** DSK-010: map classification into a placement preview for review. */
export function previewFilePlacement(input: SourceClassificationInputV1): FilePlacementPreviewV1 {
  const classification = classifyStableFile(input);
  const recommendedAction =
    classification.disposition === 'MISPLACED'
      ? ('MOVE' as const)
      : classification.disposition === 'AMBIGUOUS'
        ? ('REASSIGN' as const)
        : classification.disposition === 'UNSUPPORTED'
          ? ('LATER' as const)
          : ('KEEP' as const);
  return Object.freeze({ classification, recommendedAction });
}

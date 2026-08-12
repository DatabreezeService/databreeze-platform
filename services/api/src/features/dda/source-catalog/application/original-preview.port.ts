import type { SourceCatalogPreviewKindV1 } from './source-catalog-repository.port.js';
import type { SourceCatalogEvidenceOverlayV1 } from './source-catalog-repository.port.js';

export const ORIGINAL_PREVIEW_PORT = Symbol('ORIGINAL_PREVIEW_PORT');

export interface OriginalPreviewCellV1 {
  readonly sheet?: string;
  readonly row: number;
  readonly column: number;
  readonly displayValue?: string;
  readonly formulaText?: string;
  readonly rawText?: string;
  readonly executed: false;
}

export interface OriginalPreviewResultV1 {
  readonly kind: SourceCatalogPreviewKindV1;
  readonly encoding?: string;
  readonly delimiter?: string;
  readonly worksheets?: readonly string[];
  readonly cells?: readonly OriginalPreviewCellV1[];
  readonly executedMacros?: false;
  readonly followedExternalLinks?: false;
  readonly mergedCells?: readonly { readonly sheet: string; readonly range: string }[];
  readonly evidenceOverlay?: SourceCatalogEvidenceOverlayV1;
  readonly rowCount?: number;
}

export interface OriginalPreviewPortV1 {
  previewCsv(): OriginalPreviewResultV1;
  previewXlsx(input: {
    readonly hasMacros?: boolean;
    readonly hasExternalLinks?: boolean;
  }): OriginalPreviewResultV1;
  previewImage(input: {
    readonly evidenceOverlay?: SourceCatalogEvidenceOverlayV1;
  }): OriginalPreviewResultV1;
}

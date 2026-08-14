import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  SourceCatalogDataModeV1,
  SourceCatalogEvidenceOverlayV1,
  SourceCatalogPreviewKindV1,
  SourceCatalogSourceTypeV1,
} from './source-catalog-repository.port.js';
import type { OriginalPreviewResultV1 } from './original-preview.port.js';

export type OriginalViewResolverValueV1 =
  | (OriginalPreviewResultV1 & {
      readonly iaeContentReferenceId: StableIdentifierV1;
    })
  | {
      readonly kind: 'OPEN_ON_SOURCE_DEVICE';
      readonly iaeContentReferenceId?: StableIdentifierV1;
    };

export type OriginalViewResolverCodeV1 = 'NOT_FOUND' | 'UNAVAILABLE';

export type OriginalViewResolverResultV1 =
  | { readonly accepted: true; readonly value: OriginalViewResolverValueV1 }
  | { readonly accepted: false; readonly code: OriginalViewResolverCodeV1 };

export interface OriginalViewResolverInputV1 {
  readonly context: IamTenantContextV1;
  readonly datasetId: StableIdentifierV1;
  readonly sourceId: StableIdentifierV1;
  readonly sourceVersionId: StableIdentifierV1;
  readonly iaeArtifactVersionId: StableIdentifierV1;
  readonly sourceType: SourceCatalogSourceTypeV1;
  readonly dataMode: SourceCatalogDataModeV1;
  readonly previewKind?: SourceCatalogPreviewKindV1;
  readonly evidenceOverlay?: SourceCatalogEvidenceOverlayV1;
  /** IAE-issued, short-lived cloud descriptor; never a local path or storage credential. */
  readonly iaeOriginalViewDescriptor?: string;
}

export interface OriginalViewResolverPortV1 {
  /** Re-authorizes the exact source/version/artifact and returns safe descriptors only. */
  resolveOriginalView(input: OriginalViewResolverInputV1): Promise<OriginalViewResolverResultV1>;
}

/** Safe default until root composition supplies the IAE-backed resolver. */
export class UnavailableOriginalViewResolverAdapter implements OriginalViewResolverPortV1 {
  public resolveOriginalView(
    input: OriginalViewResolverInputV1,
  ): Promise<OriginalViewResolverResultV1> {
    void input;
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }
}

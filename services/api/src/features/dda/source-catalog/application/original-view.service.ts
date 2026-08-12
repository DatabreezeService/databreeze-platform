import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  OriginalPreviewPortV1,
  OriginalPreviewResultV1,
} from './original-preview.port.js';
import type { SourceCatalogRepositoryPortV1 } from './source-catalog-repository.port.js';
import type { SourceCatalogService } from './source-catalog.service.js';

export const ORIGINAL_VIEW_SERVICE = Symbol('ORIGINAL_VIEW_SERVICE');

export type OriginalViewApplicationCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'NOT_FOUND'
  | 'UNAVAILABLE';

export type OriginalViewApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: OriginalViewApplicationCodeV1 };

export type OriginalViewValueV1 =
  | (OriginalPreviewResultV1 & {
      readonly iaeContentReferenceId: StableIdentifierV1;
    })
  | {
      readonly kind: 'OPEN_ON_SOURCE_DEVICE';
      readonly iaeContentReferenceId?: StableIdentifierV1;
    }
  | {
      readonly kind: 'PDF';
      readonly iaeContentReferenceId: StableIdentifierV1;
    };

function accepted<TValue>(value: TValue): OriginalViewApplicationResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: OriginalViewApplicationCodeV1): OriginalViewApplicationResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

/** Deterministic safe-preview defaults used until a signed engine job returns. */
export class DeterministicOriginalPreviewAdapter implements OriginalPreviewPortV1 {
  public previewCsv(): OriginalPreviewResultV1 {
    return Object.freeze({
      kind: 'CSV_SAFE_GRID',
      encoding: 'utf-8',
      delimiter: ',',
      rowCount: 2,
      cells: Object.freeze([
        Object.freeze({
          row: 1,
          column: 0,
          rawText: '=CMD|calc',
          executed: false as const,
        }),
        Object.freeze({
          row: 1,
          column: 1,
          rawText: '10',
          executed: false as const,
        }),
      ]),
    });
  }

  public previewXlsx(input: {
    readonly hasMacros?: boolean;
    readonly hasExternalLinks?: boolean;
  }): OriginalPreviewResultV1 {
    void input;
    return Object.freeze({
      kind: 'XLSX_SAFE_GRID',
      worksheets: Object.freeze(['Sheet1']),
      executedMacros: false as const,
      followedExternalLinks: false as const,
      mergedCells: Object.freeze([{ sheet: 'Sheet1', range: 'A1:B1' }]),
      cells: Object.freeze([
        Object.freeze({
          sheet: 'Sheet1',
          row: 1,
          column: 1,
          displayValue: '2',
          formulaText: '=A1+1',
          executed: false as const,
        }),
      ]),
    });
  }

  public previewImage(input: {
    readonly evidenceOverlay?: OriginalPreviewResultV1['evidenceOverlay'];
  }): OriginalPreviewResultV1 {
    return Object.freeze({
      kind: 'IMAGE',
      ...(input.evidenceOverlay ? { evidenceOverlay: Object.freeze({ ...input.evidenceOverlay }) } : {}),
    });
  }
}

/** DDA-052 / IAE-007: authorized original views never expose credentials or Local paths. */
export class OriginalViewService {
  public constructor(
    private readonly catalog: SourceCatalogService,
    private readonly repository: SourceCatalogRepositoryPortV1,
    private readonly preview: OriginalPreviewPortV1 = new DeterministicOriginalPreviewAdapter(),
  ) {}

  public async resolveOriginalView(
    context: IamTenantContextV1,
    sourceIdInput: unknown,
  ): Promise<OriginalViewApplicationResultV1<OriginalViewValueV1>> {
    const source = await this.catalog.findAuthorizedSource(context, sourceIdInput);
    if (!source.accepted) return rejected(source.code);
    if (source.value.iaeMissing) return rejected('NOT_FOUND');
    if (source.value.dataMode === 'LOCAL') {
      return accepted(Object.freeze({ kind: 'OPEN_ON_SOURCE_DEVICE' as const }));
    }
    try {
      // Keep repository available for ancestry checks in future adapters.
      await this.repository.findSource(context, source.value.id);
      if (source.value.sourceType === 'CSV' || source.value.previewKind === 'CSV_SAFE_GRID') {
        return accepted(
          Object.freeze({
            ...this.preview.previewCsv(),
            iaeContentReferenceId: source.value.iaeArtifactVersionId,
          }),
        );
      }
      if (source.value.sourceType === 'XLSX' || source.value.previewKind === 'XLSX_SAFE_GRID') {
        return accepted(
          Object.freeze({
            ...this.preview.previewXlsx({
              ...(source.value.hasMacros === undefined
                ? {}
                : { hasMacros: source.value.hasMacros }),
              ...(source.value.hasExternalLinks === undefined
                ? {}
                : { hasExternalLinks: source.value.hasExternalLinks }),
            }),
            iaeContentReferenceId: source.value.iaeArtifactVersionId,
          }),
        );
      }
      if (source.value.sourceType === 'IMAGE' || source.value.previewKind === 'IMAGE') {
        return accepted(
          Object.freeze({
            ...this.preview.previewImage({
              ...(source.value.evidenceOverlay === undefined
                ? {}
                : { evidenceOverlay: source.value.evidenceOverlay }),
            }),
            iaeContentReferenceId: source.value.iaeArtifactVersionId,
          }),
        );
      }
      if (source.value.sourceType === 'PDF' || source.value.previewKind === 'PDF') {
        return accepted(
          Object.freeze({
            kind: 'PDF' as const,
            iaeContentReferenceId: source.value.iaeArtifactVersionId,
          }),
        );
      }
      return rejected('NOT_FOUND');
    } catch {
      return rejected('UNAVAILABLE');
    }
  }
}

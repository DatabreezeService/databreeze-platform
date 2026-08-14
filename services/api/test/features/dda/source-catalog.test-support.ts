/* eslint-disable @typescript-eslint/require-await -- deterministic boundary doubles mirror async adapters. */

import type {
  OriginalPreviewPortV1,
  OriginalPreviewResultV1,
} from '../../../src/features/dda/source-catalog/application/original-preview.port.js';
import type {
  OriginalViewResolverPortV1,
  OriginalViewResolverResultV1,
} from '../../../src/features/dda/source-catalog/application/original-view-resolver.port.js';
import { OriginalViewService } from '../../../src/features/dda/source-catalog/application/original-view.service.js';
import type { SourceCatalogAuthorizationPortV1 } from '../../../src/features/dda/source-catalog/application/source-catalog-authorization.port.js';
import type { SourceCatalogRepositoryPortV1 } from '../../../src/features/dda/source-catalog/application/source-catalog-repository.port.js';
import { SourceCatalogService } from '../../../src/features/dda/source-catalog/application/source-catalog.service.js';
import type { IaeOriginalViewPortV1 } from '../../../src/features/iae/application/original-view.service.js';

class TestOriginalPreviewAdapter implements OriginalPreviewPortV1 {
  public previewCsv(): OriginalPreviewResultV1 {
    return {
      kind: 'CSV_SAFE_GRID',
      encoding: 'utf-8',
      delimiter: ',',
      rowCount: 2,
      cells: [
        { row: 1, column: 0, rawText: '=CMD|calc', executed: false },
        { row: 1, column: 1, rawText: '10', executed: false },
      ],
    };
  }

  public previewXlsx(input: {
    readonly hasMacros?: boolean;
    readonly hasExternalLinks?: boolean;
  }): OriginalPreviewResultV1 {
    void input;
    return {
      kind: 'XLSX_SAFE_GRID',
      worksheets: ['Sheet1'],
      executedMacros: false,
      followedExternalLinks: false,
      mergedCells: [{ sheet: 'Sheet1', range: 'A1:B1' }],
      cells: [
        {
          sheet: 'Sheet1',
          row: 1,
          column: 1,
          displayValue: '2',
          formulaText: '=A1+1',
          executed: false,
        },
      ],
    };
  }

  public previewImage(input: {
    readonly evidenceOverlay?: OriginalPreviewResultV1['evidenceOverlay'];
  }): OriginalPreviewResultV1 {
    return {
      kind: 'IMAGE',
      ...(input.evidenceOverlay === undefined ? {} : { evidenceOverlay: input.evidenceOverlay }),
    };
  }
}

class TestOriginalViewResolverAdapter implements OriginalViewResolverPortV1 {
  private readonly preview = new TestOriginalPreviewAdapter();

  public async resolveOriginalView(
    input: Parameters<OriginalViewResolverPortV1['resolveOriginalView']>[0],
  ): Promise<OriginalViewResolverResultV1> {
    await Promise.resolve();
    if (input.sourceType === 'CSV' || input.previewKind === 'CSV_SAFE_GRID') {
      return {
        accepted: true,
        value: { ...this.preview.previewCsv(), iaeContentReferenceId: input.iaeArtifactVersionId },
      };
    }
    if (input.sourceType === 'XLSX' || input.previewKind === 'XLSX_SAFE_GRID') {
      return {
        accepted: true,
        value: {
          ...this.preview.previewXlsx({}),
          iaeContentReferenceId: input.iaeArtifactVersionId,
        },
      };
    }
    if (input.sourceType === 'IMAGE' || input.previewKind === 'IMAGE') {
      return {
        accepted: true,
        value: {
          ...this.preview.previewImage({ evidenceOverlay: input.evidenceOverlay }),
          iaeContentReferenceId: input.iaeArtifactVersionId,
        },
      };
    }
    if (input.sourceType === 'PDF' || input.previewKind === 'PDF') {
      return {
        accepted: true,
        value: { kind: 'PDF', iaeContentReferenceId: input.iaeArtifactVersionId },
      };
    }
    return { accepted: false, code: 'NOT_FOUND' };
  }
}

export function allowSourceCatalogAuthorization(): SourceCatalogAuthorizationPortV1 {
  return {
    authorize: async () => ({ accepted: true, value: true }),
  };
}

export function createTestSourceCatalogService(
  repository: SourceCatalogRepositoryPortV1,
): SourceCatalogService {
  return new SourceCatalogService(repository, allowSourceCatalogAuthorization());
}

export function createTestOriginalViewService(
  catalog: SourceCatalogService,
  repository: SourceCatalogRepositoryPortV1,
  iaeOriginalView?: IaeOriginalViewPortV1,
): OriginalViewService {
  return new OriginalViewService(
    catalog,
    repository,
    new TestOriginalViewResolverAdapter(),
    iaeOriginalView,
  );
}

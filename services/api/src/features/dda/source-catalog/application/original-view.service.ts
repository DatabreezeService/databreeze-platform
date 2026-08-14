import {
  parseStableIdentifierV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import {
  UnavailableOriginalViewResolverAdapter,
  type OriginalViewResolverPortV1,
} from './original-view-resolver.port.js';
import type {
  IaeOriginalViewDescriptorV1,
  IaeOriginalViewPortV1,
} from '../../../iae/application/original-view.service.js';
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
  import('./original-view-resolver.port.js').OriginalViewResolverValueV1;

function accepted<TValue>(value: TValue): OriginalViewApplicationResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: OriginalViewApplicationCodeV1): OriginalViewApplicationResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function mapCatalogCode(code: string): OriginalViewApplicationCodeV1 {
  if (code === 'INVALID_SCOPE' || code === 'NOT_FOUND' || code === 'UNAVAILABLE') return code;
  return 'INVALID_IDENTIFIER';
}

function parseId(
  input: unknown,
):
  | { readonly accepted: true; readonly value: StableIdentifierV1 }
  | { readonly accepted: false; readonly code: 'INVALID_IDENTIFIER' } {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed : { accepted: false, code: 'INVALID_IDENTIFIER' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function safeCell(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(value, [
      'sheet',
      'row',
      'column',
      'displayValue',
      'formulaText',
      'rawText',
      'executed',
    ])
  ) {
    return false;
  }
  const row = value['row'];
  const column = value['column'];
  const executed = value['executed'];
  const sheet = value['sheet'];
  const displayValue = value['displayValue'];
  const formulaText = value['formulaText'];
  const rawText = value['rawText'];
  return (
    typeof row === 'number' &&
    Number.isSafeInteger(row) &&
    row >= 0 &&
    typeof column === 'number' &&
    Number.isSafeInteger(column) &&
    column >= 0 &&
    executed === false &&
    (sheet === undefined || typeof sheet === 'string') &&
    (displayValue === undefined || typeof displayValue === 'string') &&
    (formulaText === undefined || typeof formulaText === 'string') &&
    (rawText === undefined || typeof rawText === 'string')
  );
}

function safeEvidenceOverlay(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ['page', 'x', 'y', 'width', 'height'])) return false;
  const page = value['page'];
  const x = value['x'];
  const y = value['y'];
  const width = value['width'];
  const height = value['height'];
  return (
    typeof page === 'number' &&
    Number.isSafeInteger(page) &&
    page > 0 &&
    typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof y === 'number' &&
    Number.isFinite(y) &&
    typeof width === 'number' &&
    Number.isFinite(width) &&
    width >= 0 &&
    typeof height === 'number' &&
    Number.isFinite(height) &&
    height >= 0
  );
}

function safeOriginalViewValue(
  value: unknown,
  expectedArtifactVersionId: StableIdentifierV1,
): value is import('./original-view-resolver.port.js').OriginalViewResolverValueV1 {
  if (!isRecord(value)) return false;
  const kind = value['kind'];
  const artifactVersionId = value['iaeContentReferenceId'];
  if (typeof kind !== 'string') return false;
  if (kind === 'OPEN_ON_SOURCE_DEVICE') {
    return (
      hasOnlyKeys(value, ['kind', 'iaeContentReferenceId']) &&
      (artifactVersionId === undefined || artifactVersionId === expectedArtifactVersionId)
    );
  }
  if (
    artifactVersionId !== expectedArtifactVersionId ||
    !hasOnlyKeys(value, [
      'kind',
      'iaeContentReferenceId',
      'encoding',
      'delimiter',
      'worksheets',
      'cells',
      'executedMacros',
      'followedExternalLinks',
      'mergedCells',
      'evidenceOverlay',
      'rowCount',
    ])
  ) {
    return false;
  }
  if (kind === 'CSV_SAFE_GRID') {
    const encoding = value['encoding'];
    const delimiter = value['delimiter'];
    const rowCount = value['rowCount'];
    const cells = value['cells'];
    return (
      (encoding === undefined || typeof encoding === 'string') &&
      (delimiter === undefined || typeof delimiter === 'string') &&
      (rowCount === undefined ||
        (typeof rowCount === 'number' && Number.isSafeInteger(rowCount) && rowCount >= 0)) &&
      (cells === undefined || (Array.isArray(cells) && cells.every(safeCell)))
    );
  }
  if (kind === 'XLSX_SAFE_GRID') {
    const worksheets = value['worksheets'];
    const executedMacros = value['executedMacros'];
    const followedExternalLinks = value['followedExternalLinks'];
    const cells = value['cells'];
    const mergedCells = value['mergedCells'];
    return (
      (worksheets === undefined ||
        (Array.isArray(worksheets) && worksheets.every((item) => typeof item === 'string'))) &&
      executedMacros === false &&
      followedExternalLinks === false &&
      (cells === undefined || (Array.isArray(cells) && cells.every(safeCell))) &&
      (mergedCells === undefined ||
        (Array.isArray(mergedCells) &&
          mergedCells.every(
            (item) =>
              isRecord(item) &&
              hasOnlyKeys(item, ['sheet', 'range']) &&
              typeof item['sheet'] === 'string' &&
              typeof item['range'] === 'string',
          )))
    );
  }
  if (kind === 'IMAGE') {
    const evidenceOverlay = value['evidenceOverlay'];
    return evidenceOverlay === undefined || safeEvidenceOverlay(evidenceOverlay);
  }
  return kind === 'PDF' && hasOnlyKeys(value, ['kind', 'iaeContentReferenceId']);
}

/** DDA-052 / IAE-007: authorized original views never expose credentials or Local paths. */
export class OriginalViewService {
  public constructor(
    private readonly catalog: SourceCatalogService,
    private readonly repository: SourceCatalogRepositoryPortV1,
    private readonly resolver: OriginalViewResolverPortV1 = new UnavailableOriginalViewResolverAdapter(),
    private readonly iaeOriginalView?: IaeOriginalViewPortV1,
  ) {}

  public async resolveOriginalView(
    context: IamTenantContextV1,
    datasetIdInput: unknown,
    sourceIdInput: unknown,
  ): Promise<OriginalViewApplicationResultV1<OriginalViewValueV1>> {
    const datasetId = parseId(datasetIdInput);
    const sourceId = parseId(sourceIdInput);
    if (!datasetId.accepted) return rejected(datasetId.code);
    if (!sourceId.accepted) return rejected(sourceId.code);

    let source: Awaited<ReturnType<SourceCatalogService['findAuthorizedSource']>>;
    try {
      source = await this.catalog.findAuthorizedSource(context, datasetId.value, sourceId.value);
    } catch {
      return rejected('UNAVAILABLE');
    }
    if (!source.accepted) return rejected(mapCatalogCode(source.code));
    if (source.value.iaeMissing) return rejected('NOT_FOUND');
    try {
      // Re-read the tenant/assignment-scoped record before resolving the exact artifact/version.
      const resolved = await this.repository.findSource(context, source.value.id);
      if (
        !resolved ||
        resolved.id !== source.value.id ||
        resolved.dsmDatasetId !== datasetId.value ||
        resolved.versionId !== source.value.versionId ||
        resolved.iaeArtifactVersionId !== source.value.iaeArtifactVersionId
      ) {
        return rejected('NOT_FOUND');
      }
      let iaeDescriptor: IaeOriginalViewDescriptorV1 | undefined;
      if (this.iaeOriginalView !== undefined) {
        const resolvedDescriptor = await this.iaeOriginalView.resolveOriginalView(context, {
          artifactVersionId: resolved.iaeArtifactVersionId,
          now: new Date().toISOString(),
        });
        if (!resolvedDescriptor.accepted) return rejected('UNAVAILABLE');
        if (
          resolvedDescriptor.value.artifactVersionId !== resolved.iaeArtifactVersionId ||
          !tenantScopesEqualV1(resolvedDescriptor.value.tenantScope, context.tenantScope)
        )
          return rejected('UNAVAILABLE');
        iaeDescriptor = resolvedDescriptor.value;
      }
      if (resolved.dataMode === 'LOCAL') {
        if (iaeDescriptor !== undefined && iaeDescriptor.action !== 'OPEN_ON_SOURCE_DEVICE')
          return rejected('UNAVAILABLE');
        return accepted(Object.freeze({ kind: 'OPEN_ON_SOURCE_DEVICE' as const }));
      }
      if (
        iaeDescriptor !== undefined &&
        (iaeDescriptor.action !== 'OPEN_CLOUD' || iaeDescriptor.signedDescriptor === undefined)
      )
        return rejected('UNAVAILABLE');
      const view = await this.resolver.resolveOriginalView({
        context,
        datasetId: datasetId.value,
        sourceId: resolved.id,
        sourceVersionId: resolved.versionId,
        iaeArtifactVersionId: resolved.iaeArtifactVersionId,
        sourceType: resolved.sourceType,
        dataMode: resolved.dataMode,
        ...(resolved.previewKind === undefined ? {} : { previewKind: resolved.previewKind }),
        ...(resolved.evidenceOverlay === undefined
          ? {}
          : { evidenceOverlay: resolved.evidenceOverlay }),
        ...(iaeDescriptor?.signedDescriptor !== undefined
          ? { iaeOriginalViewDescriptor: iaeDescriptor.signedDescriptor }
          : {}),
      });
      const rawView: unknown = view;
      if (!isRecord(rawView)) return rejected('UNAVAILABLE');
      if (rawView['accepted'] === false) {
        const code = rawView['code'];
        return rejected(code === 'NOT_FOUND' || code === 'UNAVAILABLE' ? code : 'UNAVAILABLE');
      }
      if (rawView['accepted'] !== true) return rejected('UNAVAILABLE');
      const rawValue = rawView['value'];
      if (!safeOriginalViewValue(rawValue, resolved.iaeArtifactVersionId)) {
        return rejected('UNAVAILABLE');
      }
      if (rawValue.kind === 'OPEN_ON_SOURCE_DEVICE') return rejected('UNAVAILABLE');
      return accepted(rawValue);
    } catch {
      return rejected('UNAVAILABLE');
    }
  }
}

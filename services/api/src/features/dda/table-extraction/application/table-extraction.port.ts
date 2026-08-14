import type { TableExtractionRawCandidateV1 } from './table-validation.service.js';

export interface TableExtractionPortV1 {
  extract(input: {
    readonly mimeType: string;
    readonly bytes: Uint8Array;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly pageCount: number;
  }): Promise<
    | { readonly accepted: true; readonly candidate: TableExtractionRawCandidateV1 }
    | {
        readonly accepted: false;
        readonly code: 'PROVIDER_DISABLED' | 'PROVIDER_TIMEOUT' | 'MALFORMED_JSON';
      }
  >;
}

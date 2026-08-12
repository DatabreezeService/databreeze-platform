import type { TableExtractionPortV1 } from '../application/table-extraction.port.js';

/** Fail-closed default: live OpenAI remains owner-gated and disabled here. */
export class DisabledOpenAiTableExtractionAdapter implements TableExtractionPortV1 {
  public extract(_input: {
    readonly mimeType: string;
    readonly bytes: Uint8Array;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly pageCount: number;
  }): Promise<
    | { readonly accepted: true; readonly candidate: never }
    | { readonly accepted: false; readonly code: 'PROVIDER_DISABLED' }
  > {
    void _input;
    return Promise.resolve(
      Object.freeze({ accepted: false as const, code: 'PROVIDER_DISABLED' as const }),
    );
  }
}

import {
  admitTableMedia,
  validateTableExtractionCandidate,
  type TableExtractionRawCandidateV1,
  type TableMediaAdmissionCodeV1,
  type TableValidationCodeV1,
} from './table-validation.service.js';
import type { TableExtractionPortV1 } from './table-extraction.port.js';

export type TableExtractionProblemCodeV1 =
  | TableMediaAdmissionCodeV1
  | TableValidationCodeV1
  | 'PROVIDER_DISABLED'
  | 'PROVIDER_TIMEOUT'
  | 'MALFORMED_JSON'
  | 'CROSS_TENANT_ARTIFACT';

export type TableExtractionResultV1 =
  | {
      readonly accepted: true;
      readonly candidate: TableExtractionRawCandidateV1;
      readonly warnings: readonly string[];
    }
  | {
      readonly accepted: false;
      readonly code: TableExtractionProblemCodeV1;
      readonly requiresReview: boolean;
    };

/** DDA-057: admit media, call provider port, validate candidate; never registers DatasetVersion. */
export class TableExtractionService {
  public constructor(private readonly port: TableExtractionPortV1) {}

  public async extract(input: {
    readonly mimeType: string;
    readonly bytes: Uint8Array;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly pageCount: number;
    readonly decompressionRatio?: number;
  }): Promise<TableExtractionResultV1> {
    const admission = admitTableMedia({
      mimeType: input.mimeType,
      byteSize: input.bytes.byteLength,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      pageCount: input.pageCount,
      ...(input.decompressionRatio === undefined
        ? {}
        : { decompressionRatio: input.decompressionRatio }),
    });
    if (!admission.accepted) {
      return Object.freeze({
        accepted: false,
        code: admission.code,
        requiresReview: true,
      });
    }

    const extracted = await this.port.extract({
      mimeType: input.mimeType,
      bytes: input.bytes,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      pageCount: input.pageCount,
    });
    if (!extracted.accepted) {
      return Object.freeze({
        accepted: false,
        code: extracted.code,
        requiresReview: true,
      });
    }

    const validated = validateTableExtractionCandidate(extracted.candidate);
    if (!validated.accepted) {
      return Object.freeze({
        accepted: false,
        code: validated.code,
        requiresReview: true,
      });
    }
    return Object.freeze({
      accepted: true,
      candidate: extracted.candidate,
      warnings: validated.warnings,
    });
  }
}

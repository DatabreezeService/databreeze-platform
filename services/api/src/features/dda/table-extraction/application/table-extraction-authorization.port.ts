import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export const TABLE_EXTRACTION_AUTHORIZATION_PORT = Symbol('TABLE_EXTRACTION_AUTHORIZATION_PORT');

export type TableExtractionAuthorizationProblemCodeV1 =
  | 'POLICY_UNAVAILABLE'
  | 'USAGE_DENIED'
  | 'EGRESS_DENIED';

export type TableExtractionAuthorizationResultV1 =
  | {
      readonly accepted: true;
      readonly usageAllowed: true;
      readonly egressAllowed: true;
    }
  | {
      readonly accepted: false;
      readonly code: TableExtractionAuthorizationProblemCodeV1;
    };

export interface TableExtractionAuthorizationPortV1 {
  authorize(input: {
    readonly context: IamTenantContextV1;
    readonly mimeType: string;
    readonly byteLength: number;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly pageCount: number;
    readonly decompressionRatio?: number;
  }): Promise<TableExtractionAuthorizationResultV1>;
}

/** Safe default until DdaModule composes usage admission and egress policy. */
export class UnavailableTableExtractionAuthorizationAdapter
  implements TableExtractionAuthorizationPortV1
{
  public async authorize(input: {
    readonly context: IamTenantContextV1;
    readonly mimeType: string;
    readonly byteLength: number;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly pageCount: number;
    readonly decompressionRatio?: number;
  }): Promise<TableExtractionAuthorizationResultV1> {
    void input;
    await Promise.resolve();
    return Object.freeze({ accepted: false, code: 'POLICY_UNAVAILABLE' as const });
  }
}

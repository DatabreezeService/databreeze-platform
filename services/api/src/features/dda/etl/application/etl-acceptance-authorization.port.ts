import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export const ETL_ACCEPTANCE_AUTHORIZATION_PORT = Symbol('ETL_ACCEPTANCE_AUTHORIZATION_PORT');

export type EtlAcceptanceAuthorizationCodeV1 = 'FORBIDDEN' | 'AUTHORIZATION_UNAVAILABLE';

export interface EtlAcceptanceAuthorizationInputV1 {
  readonly context: IamTenantContextV1;
  readonly proposalId: string;
  readonly action: 'ETL_ACCEPT';
}

export type EtlAcceptanceAuthorizationResultV1 =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly code: EtlAcceptanceAuthorizationCodeV1 };

/** IAM-owned acceptance boundary; callers cannot select an alternate action or scope. */
export interface EtlAcceptanceAuthorizationPortV1 {
  authorize(input: EtlAcceptanceAuthorizationInputV1): Promise<EtlAcceptanceAuthorizationResultV1>;
}

/** Production-safe default until DDA composition supplies the IAM action policy. */
export class UnavailableEtlAcceptanceAuthorizationAdapter
  implements EtlAcceptanceAuthorizationPortV1
{
  public authorize(
    input: EtlAcceptanceAuthorizationInputV1,
  ): Promise<EtlAcceptanceAuthorizationResultV1> {
    void input;
    return Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
  }
}

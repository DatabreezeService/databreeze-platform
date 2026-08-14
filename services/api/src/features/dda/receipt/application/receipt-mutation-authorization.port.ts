import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export const RECEIPT_MUTATION_AUTHORIZATION_PORT = Symbol('RECEIPT_MUTATION_AUTHORIZATION_PORT');

export type ReceiptMutationActionV1 = 'RECEIPT_EXTRACT' | 'RECEIPT_CORRECT';

export type ReceiptMutationAuthorizationCodeV1 = 'FORBIDDEN' | 'AUTHORIZATION_UNAVAILABLE';

export interface ReceiptMutationAuthorizationInputV1 {
  readonly context: IamTenantContextV1;
  readonly action: ReceiptMutationActionV1;
  readonly artifactVersionId: string;
  readonly candidateId?: string;
}

export type ReceiptMutationAuthorizationResultV1 =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly code: ReceiptMutationAuthorizationCodeV1 };

/** IAM-owned mutation boundary. It receives only server-resolved context and exact resources. */
export interface ReceiptMutationAuthorizationPortV1 {
  authorize(
    input: ReceiptMutationAuthorizationInputV1,
  ): Promise<ReceiptMutationAuthorizationResultV1>;
}

/** Production-safe default until the IAM composition supplies the action policy. */
export class UnavailableReceiptMutationAuthorizationAdapter
  implements ReceiptMutationAuthorizationPortV1
{
  public authorize(
    input: ReceiptMutationAuthorizationInputV1,
  ): Promise<ReceiptMutationAuthorizationResultV1> {
    void input;
    return Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
  }
}

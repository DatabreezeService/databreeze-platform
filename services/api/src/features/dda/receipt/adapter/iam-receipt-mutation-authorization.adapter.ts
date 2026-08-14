import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';

import type {
  ReceiptMutationAuthorizationInputV1,
  ReceiptMutationAuthorizationPortV1,
  ReceiptMutationAuthorizationResultV1,
} from '../application/receipt-mutation-authorization.port.js';
import {
  authorizeIamDdaMutationV1,
  parseExactStableIdentifierV1,
  type IamDdaMutationAuthorizationSourceV1,
} from '../../adapter/iam-dda-mutation-authorization.source.js';

function unavailable(): ReceiptMutationAuthorizationResultV1 {
  return { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}

/** Maps receipt mutations to the canonical IAM derived-artifact permission. */
export class IamReceiptMutationAuthorizationAdapter implements ReceiptMutationAuthorizationPortV1 {
  public constructor(private readonly source: IamDdaMutationAuthorizationSourceV1) {}

  public authorize(
    input: ReceiptMutationAuthorizationInputV1,
  ): Promise<ReceiptMutationAuthorizationResultV1> {
    if (!isRecord(input)) return Promise.resolve(unavailable());
    if (input['action'] !== 'RECEIPT_EXTRACT' && input['action'] !== 'RECEIPT_CORRECT') {
      return Promise.resolve(unavailable());
    }
    if (parseExactStableIdentifierV1(input['artifactVersionId']) === undefined) {
      return Promise.resolve(unavailable());
    }
    if (
      input['candidateId'] !== undefined &&
      parseExactStableIdentifierV1(input['candidateId']) === undefined
    ) {
      return Promise.resolve(unavailable());
    }

    return authorizeIamDdaMutationV1(
      this.source,
      input['context'],
      PERMISSIONS_V1.ARTIFACT_DERIVED_CREATE,
      [input['artifactVersionId']],
    );
  }
}

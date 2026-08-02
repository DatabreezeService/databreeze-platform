import type { ProtectedDocumentUnlockRequestV1 } from '@databreeze/domain/protected-document/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const PROTECTED_DOCUMENT_UNLOCK_REPOSITORY_PORT = Symbol(
  'PROTECTED_DOCUMENT_UNLOCK_REPOSITORY_PORT',
);

export interface ProtectedDocumentUnlockTransactionPortV1 {
  save(context: IamTenantContextV1, request: ProtectedDocumentUnlockRequestV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    requestId: ProtectedDocumentUnlockRequestV1['requestId'],
  ): Promise<ProtectedDocumentUnlockRequestV1 | undefined>;
}

export interface ProtectedDocumentUnlockRepositoryPortV1
  extends ProtectedDocumentUnlockTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ProtectedDocumentUnlockTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

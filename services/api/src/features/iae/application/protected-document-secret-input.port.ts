import type { ProtectedDocumentUnlockRequestV1 } from '@databreeze/domain/protected-document/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const PROTECTED_DOCUMENT_SECRET_INPUT_PORT = Symbol('PROTECTED_DOCUMENT_SECRET_INPUT_PORT');

export interface ProtectedDocumentUnlockHandleV1 {
  readonly handleId: string;
  readonly requestId: ProtectedDocumentUnlockRequestV1['requestId'];
  readonly expiresAt: ProtectedDocumentUnlockRequestV1['expiresAt'];
}

export type ProtectedDocumentSecretInputErrorCodeV1 =
  | 'UNLOCK_HANDLE_INVALID'
  | 'UNLOCK_HANDLE_EXPIRED'
  | 'UNLOCK_SCOPE_DENIED';

export type ProtectedDocumentSecretInputResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ProtectedDocumentSecretInputErrorCodeV1 };

/**
 * Local/sidecar boundary for secret entry. The port receives only an opaque
 * one-shot handle and an outcome; plaintext credentials never cross the API.
 */
export interface ProtectedDocumentSecretInputPortV1 {
  issue(
    context: IamTenantContextV1,
    request: ProtectedDocumentUnlockRequestV1,
  ): Promise<ProtectedDocumentSecretInputResultV1<ProtectedDocumentUnlockHandleV1>>;
  consume(
    context: IamTenantContextV1,
    request: ProtectedDocumentUnlockRequestV1,
    handleId: string,
    outcome: 'UNLOCKED' | 'FAILED',
  ): Promise<ProtectedDocumentSecretInputResultV1<void>>;
  release(context: IamTenantContextV1, request: ProtectedDocumentUnlockRequestV1): Promise<void>;
}

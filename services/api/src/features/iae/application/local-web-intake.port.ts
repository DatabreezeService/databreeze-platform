import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const IAE_LOCAL_WEB_INTAKE_PORT = Symbol('IAE_LOCAL_WEB_INTAKE_PORT');

export type LocalWebIntakeErrorCodeV1 =
  | 'LOCAL_INTAKE_SCOPE_DENIED'
  | 'LOCAL_INTAKE_PERMISSION_DENIED'
  | 'LOCAL_INTAKE_POLICY_UNAVAILABLE'
  | 'LOCAL_INTAKE_DATA_MODE_DENIED'
  | 'LOCAL_INTAKE_LIMIT_SIZE'
  | 'LOCAL_INTAKE_INVALID_INPUT'
  | 'LOCAL_INTAKE_IDEMPOTENCY_CONFLICT'
  | 'LOCAL_INTAKE_UNAVAILABLE';

export type LocalWebIntakeResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: LocalWebIntakeErrorCodeV1 };

export interface LocalWebIntakeUploadInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly fileName: string;
  readonly mediaType: string;
  readonly expectedSha256: string;
  readonly bytes: Uint8Array;
  readonly idempotencyKey: string;
}

export interface LocalWebIntakeUploadValueV1 {
  readonly sessionId: string;
  readonly inboxItemId: string;
  readonly artifactVersionId: string;
  readonly status: 'PENDING_REVIEW';
  readonly replayed: boolean;
}

export interface LocalWebIntakeObjectStorePortV1 {
  put(input: {
    readonly objectKey: string;
    readonly bytes: Uint8Array;
    readonly contentSha256: string;
    readonly mediaType: string;
  }): Promise<void>;
  delete(objectKey: string): Promise<void>;
}

export interface IaeLocalWebIntakePortV1 {
  upload(
    context: IamTenantContextV1,
    input: LocalWebIntakeUploadInputV1,
  ): Promise<LocalWebIntakeResultV1<LocalWebIntakeUploadValueV1>>;
}

import type { InboxItemV1 } from '@databreeze/domain/artifact-intake/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const ARTIFACT_INTAKE_REPOSITORY_PORT = Symbol('ARTIFACT_INTAKE_REPOSITORY_PORT');

export interface ArtifactIntakeTransactionPortV1 {
  save(context: IamTenantContextV1, item: InboxItemV1): Promise<void>;
  findByIdempotency(
    context: IamTenantContextV1,
    idempotencyKey: string,
  ): Promise<InboxItemV1 | undefined>;
  find(
    context: IamTenantContextV1,
    inboxItemId: InboxItemV1['inboxItemId'],
  ): Promise<InboxItemV1 | undefined>;
  list(context: IamTenantContextV1): Promise<readonly InboxItemV1[]>;
}

export interface ArtifactIntakeRepositoryPortV1 extends ArtifactIntakeTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactIntakeTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

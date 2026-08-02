import type { ResultManifestV1 } from '@databreeze/domain/result-manifest/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const RESULT_MANIFEST_REPOSITORY_PORT = Symbol('RESULT_MANIFEST_REPOSITORY_PORT');

export interface ResultManifestTransactionPortV1 {
  save(context: IamTenantContextV1, manifest: ResultManifestV1): Promise<void>;
  find(
    context: IamTenantContextV1,
    resultManifestId: StableIdentifierV1,
  ): Promise<ResultManifestV1 | undefined>;
  findByAttempt(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
  ): Promise<ResultManifestV1 | undefined>;
}

export interface ResultManifestRepositoryPortV1 extends ResultManifestTransactionPortV1 {
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ResultManifestTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

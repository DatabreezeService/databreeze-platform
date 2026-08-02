import type { EvidenceAccessGrantV1 } from '@databreeze/domain/evidence-grant/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const EVIDENCE_GRANT_REPOSITORY_PORT = Symbol('EVIDENCE_GRANT_REPOSITORY_PORT');

export interface EvidenceGrantTransactionPortV1 {
  save(context: IamTenantContextV1, grant: EvidenceAccessGrantV1): Promise<void>;
  find(context: IamTenantContextV1, grantId: StableIdentifierV1): Promise<EvidenceAccessGrantV1 | undefined>;
  revoke(context: IamTenantContextV1, grantId: StableIdentifierV1): Promise<void>;
  isRevoked(context: IamTenantContextV1, grantId: StableIdentifierV1): Promise<boolean>;
}

export interface EvidenceGrantRepositoryPortV1 extends EvidenceGrantTransactionPortV1 {
  withTransaction<TValue>(context: IamTenantContextV1, work: (transaction: EvidenceGrantTransactionPortV1) => Promise<TValue>): Promise<TValue>;
}

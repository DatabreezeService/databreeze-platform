import type { AuditSealAttestationV1 } from '@databreeze/domain/audit/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const AUDIT_ATTESTATION_REPOSITORY_PORT = Symbol('AUDIT_ATTESTATION_REPOSITORY_PORT');

export type AuditAttestationSaveResultV1 =
  | {
      readonly accepted: true;
      readonly value: AuditSealAttestationV1;
      readonly replayed: boolean;
    }
  | { readonly accepted: false; readonly code: 'CONFLICT' };

export interface AuditAttestationTransactionPortV1 {
  saveAttestation(
    context: IamTenantContextV1,
    attestation: AuditSealAttestationV1,
  ): Promise<AuditAttestationSaveResultV1>;
  findAttestation(
    context: IamTenantContextV1,
    attestationId: StableIdentifierV1,
  ): Promise<AuditSealAttestationV1 | undefined>;
}

export interface AuditAttestationRepositoryPortV1 extends AuditAttestationTransactionPortV1 {
  listAttestations(context: IamTenantContextV1): Promise<readonly AuditSealAttestationV1[]>;
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: AuditAttestationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

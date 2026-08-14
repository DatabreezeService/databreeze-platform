import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export const ETL_ACCEPTANCE_IDEMPOTENCY_PORT = Symbol('ETL_ACCEPTANCE_IDEMPOTENCY_PORT');

export interface EtlAcceptanceReservationInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly proposalId: string;
  readonly expectedRevision: number;
  readonly commandKey: string;
  readonly payloadFingerprint: string;
}

export interface EtlAcceptanceValueV1 {
  readonly proposalId: string;
  readonly jobId: string;
  readonly artifactVersionId: string;
  readonly datasetVersionId: string;
  readonly rowCount: number;
  readonly contentHash: string;
  readonly schemaHash: string;
  readonly lineageIds: readonly string[];
  readonly replayed: boolean;
}

export type EtlAcceptanceReservationResultV1 =
  | {
      readonly accepted: true;
      readonly value:
        | { readonly kind: 'RESERVED'; readonly reservationId: string }
        | { readonly kind: 'REPLAY'; readonly acceptance: EtlAcceptanceValueV1 };
    }
  | {
      readonly accepted: false;
      readonly code:
        | 'DDA_ETL_NOT_FOUND'
        | 'DDA_ETL_REVISION_CONFLICT'
        | 'DDA_ETL_STALE_PROPOSAL'
        | 'DDA_ETL_COMMAND_CONFLICT'
        | 'DDA_ETL_COMMAND_UNAVAILABLE';
    };

export type EtlAcceptanceCompletionResultV1 =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly code: 'DDA_ETL_COMMAND_UNAVAILABLE' };

export interface EtlAcceptanceReconciliationInputV1 extends EtlAcceptanceReservationInputV1 {
  readonly reservationId: string;
  readonly now?: Date;
}

export type EtlAcceptanceReconciliationResultV1 =
  | { readonly accepted: true; readonly value: { readonly state: 'FAILED' } }
  | {
      readonly accepted: false;
      readonly code: 'DDA_ETL_COMMAND_CONFLICT' | 'DDA_ETL_COMMAND_UNAVAILABLE';
    };

/** Atomic proposal-revision reservation and durable acceptance replay boundary. */
export interface EtlAcceptanceIdempotencyPortV1 {
  reserveAcceptance(
    input: EtlAcceptanceReservationInputV1,
  ): Promise<EtlAcceptanceReservationResultV1>;
  completeAcceptance(
    reservationId: string,
    value: EtlAcceptanceValueV1,
  ): Promise<EtlAcceptanceCompletionResultV1>;
  releaseAcceptance(reservationId: string): Promise<void>;
  reconcileAbandonedAcceptance(
    input: EtlAcceptanceReconciliationInputV1,
  ): Promise<EtlAcceptanceReconciliationResultV1>;
}

/** Safe default for a repository that has not yet received the durable command schema. */
export class UnavailableEtlAcceptanceIdempotencyAdapter implements EtlAcceptanceIdempotencyPortV1 {
  public reserveAcceptance(
    input: EtlAcceptanceReservationInputV1,
  ): Promise<EtlAcceptanceReservationResultV1> {
    void input;
    return Promise.resolve({ accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' });
  }

  public completeAcceptance(
    reservationId: string,
    value: EtlAcceptanceValueV1,
  ): Promise<EtlAcceptanceCompletionResultV1> {
    void reservationId;
    void value;
    return Promise.resolve({ accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' });
  }

  public releaseAcceptance(reservationId: string): Promise<void> {
    void reservationId;
    return Promise.resolve();
  }

  public reconcileAbandonedAcceptance(
    input: EtlAcceptanceReconciliationInputV1,
  ): Promise<EtlAcceptanceReconciliationResultV1> {
    void input;
    return Promise.resolve({ accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' });
  }
}

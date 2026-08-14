import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { ReceiptCandidateView } from './receipt-extraction.service.js';

export const RECEIPT_EXTRACTION_COMMAND_REPOSITORY_PORT = Symbol(
  'RECEIPT_EXTRACTION_COMMAND_REPOSITORY_PORT',
);

export type ReceiptCommandOperationV1 = 'EXTRACT' | 'CORRECT';

export interface ReceiptCommandReservationInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly operation: ReceiptCommandOperationV1;
  readonly commandKey: string;
  readonly artifactVersionId: string;
  readonly sourceId: string;
  readonly payloadFingerprint: string;
}

export type ReceiptCommandReservationResultV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly kind: 'RESERVED';
        readonly reservationId: string;
        readonly ownerToken: string;
      };
    }
  | {
      readonly accepted: true;
      readonly value: { readonly kind: 'REPLAY'; readonly candidate: ReceiptCandidateView };
    }
  | {
      readonly accepted: false;
      readonly code: 'COMMAND_CONFLICT' | 'COMMAND_REPOSITORY_UNAVAILABLE';
    };

export type ReceiptCommandCompletionResultV1 =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly code: 'COMMAND_REPOSITORY_UNAVAILABLE' };

export interface ReceiptCommandReconciliationInputV1 {
  readonly reservationId: string;
  readonly ownerToken: string;
  readonly now?: Date;
}

export type ReceiptCommandReconciliationResultV1 =
  | { readonly accepted: true; readonly value: { readonly state: 'FAILED' } }
  | {
      readonly accepted: false;
      readonly code: 'COMMAND_CONFLICT' | 'COMMAND_REPOSITORY_UNAVAILABLE';
    };

export interface ReceiptCandidateLookupInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly candidateId: string;
  readonly artifactVersionId: string;
}

/** Durable command/result boundary. Replay decisions must come from this port, never a service Map. */
export interface ReceiptExtractionCommandRepositoryPortV1 {
  reserve(input: ReceiptCommandReservationInputV1): Promise<ReceiptCommandReservationResultV1>;
  complete(
    reservationId: string,
    candidate: ReceiptCandidateView,
    ownerToken: string,
  ): Promise<ReceiptCommandCompletionResultV1>;
  reconcileAbandoned(
    input: ReceiptCommandReconciliationInputV1,
  ): Promise<ReceiptCommandReconciliationResultV1>;
  release(reservationId: string, ownerToken: string): Promise<void>;
  findCandidate(input: ReceiptCandidateLookupInputV1): Promise<ReceiptCandidateView | undefined>;
}

/** Production-safe default until a durable receipt command store is composed. */
export class UnavailableReceiptExtractionCommandRepositoryAdapter
  implements ReceiptExtractionCommandRepositoryPortV1
{
  public reserve(
    input: ReceiptCommandReservationInputV1,
  ): Promise<ReceiptCommandReservationResultV1> {
    void input;
    return Promise.resolve({ accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' });
  }

  public complete(
    reservationId: string,
    candidate: ReceiptCandidateView,
    ownerToken: string,
  ): Promise<ReceiptCommandCompletionResultV1> {
    void reservationId;
    void candidate;
    void ownerToken;
    return Promise.resolve({ accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' });
  }

  public reconcileAbandoned(
    input: ReceiptCommandReconciliationInputV1,
  ): Promise<ReceiptCommandReconciliationResultV1> {
    void input;
    return Promise.resolve({ accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' });
  }

  public release(reservationId: string, ownerToken: string): Promise<void> {
    void reservationId;
    void ownerToken;
    return Promise.resolve();
  }

  public findCandidate(
    input: ReceiptCandidateLookupInputV1,
  ): Promise<ReceiptCandidateView | undefined> {
    void input;
    return Promise.reject(new Error('COMMAND_REPOSITORY_UNAVAILABLE'));
  }
}

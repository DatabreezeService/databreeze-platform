import { randomUUID } from 'node:crypto';

import { tenantScopesEqualV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  ReceiptCandidateLookupInputV1,
  ReceiptCommandReconciliationInputV1,
  ReceiptCommandReconciliationResultV1,
  ReceiptCommandReservationInputV1,
  ReceiptCommandReservationResultV1,
  ReceiptExtractionCommandRepositoryPortV1,
} from './receipt-extraction-command.port.js';
import type { ReceiptCandidateView } from './receipt-extraction.service.js';

interface ReservedCommandV1 {
  readonly kind: 'RESERVED';
  readonly reservationId: string;
  readonly ownerToken: string;
  readonly leaseExpiresAt: Date;
  readonly input: ReceiptCommandReservationInputV1;
}

interface FailedCommandV1 {
  readonly kind: 'FAILED';
  readonly reservationId: string;
  readonly ownerToken: string;
  readonly input: ReceiptCommandReservationInputV1;
}

interface CompletedCommandV1 {
  readonly kind: 'COMPLETED';
  readonly input: ReceiptCommandReservationInputV1;
  readonly candidate: ReceiptCandidateView;
}

type CommandRecordV1 = ReservedCommandV1 | FailedCommandV1 | CompletedCommandV1;

function scopeKey(scope: TenantScopeV1): string {
  return JSON.stringify(scope);
}

function commandKey(input: ReceiptCommandReservationInputV1): string {
  return [
    scopeKey(input.tenantScope),
    input.operation,
    input.artifactVersionId,
    input.sourceId,
    input.commandKey,
  ].join('|');
}

/** Explicit test adapter only; production composition must provide durable storage. */
export class InMemoryReceiptExtractionCommandRepositoryAdapter
  implements ReceiptExtractionCommandRepositoryPortV1
{
  private readonly commands = new Map<string, CommandRecordV1>();
  private readonly candidates = new Map<string, ReceiptCandidateView>();
  private readonly clock: () => Date;
  private readonly leaseDurationMs: number;

  public constructor(
    options: { readonly clock?: () => Date; readonly leaseDurationMs?: number } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.leaseDurationMs = Math.max(1, Math.floor(options.leaseDurationMs ?? 120_000));
  }

  public reserve(
    input: ReceiptCommandReservationInputV1,
  ): Promise<ReceiptCommandReservationResultV1> {
    const key = commandKey(input);
    const existing = this.commands.get(key);
    const now = this.clock();
    if (existing) {
      if (
        existing.input.payloadFingerprint !== input.payloadFingerprint ||
        existing.input.artifactVersionId !== input.artifactVersionId ||
        existing.input.sourceId !== input.sourceId
      ) {
        return Promise.resolve({ accepted: false, code: 'COMMAND_CONFLICT' });
      }
      if (existing.kind === 'COMPLETED') {
        return Promise.resolve({
          accepted: true,
          value: { kind: 'REPLAY', candidate: existing.candidate },
        });
      }
      if (existing.kind === 'RESERVED' && existing.leaseExpiresAt.getTime() > now.getTime()) {
        return Promise.resolve({ accepted: false, code: 'COMMAND_CONFLICT' });
      }
      const ownerToken = randomUUID();
      const reserved: ReservedCommandV1 = {
        kind: 'RESERVED',
        reservationId: existing.reservationId,
        ownerToken,
        leaseExpiresAt: new Date(now.getTime() + this.leaseDurationMs),
        input: existing.input,
      };
      this.commands.set(key, Object.freeze(reserved));
      return Promise.resolve({
        accepted: true,
        value: {
          kind: 'RESERVED',
          reservationId: reserved.reservationId,
          ownerToken,
        },
      });
    }
    const reservationId = randomUUID();
    const ownerToken = randomUUID();
    const reserved: ReservedCommandV1 = {
      kind: 'RESERVED',
      reservationId,
      ownerToken,
      leaseExpiresAt: new Date(now.getTime() + this.leaseDurationMs),
      input,
    };
    this.commands.set(key, Object.freeze(reserved));
    return Promise.resolve({
      accepted: true,
      value: { kind: 'RESERVED', reservationId, ownerToken },
    });
  }

  public complete(
    reservationId: string,
    candidate: ReceiptCandidateView,
    ownerToken: string,
  ): Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly code: 'COMMAND_REPOSITORY_UNAVAILABLE' }
  > {
    const now = this.clock();
    for (const [key, command] of this.commands) {
      if (
        command.kind !== 'RESERVED' ||
        command.reservationId !== reservationId ||
        command.ownerToken !== ownerToken ||
        command.leaseExpiresAt.getTime() <= now.getTime() ||
        !tenantScopesEqualV1(command.input.tenantScope, candidate.tenantScope) ||
        command.input.artifactVersionId !== candidate.artifactVersionId
      ) {
        continue;
      }
      this.candidates.set(candidate.candidateId, candidate);
      this.commands.set(key, Object.freeze({ kind: 'COMPLETED', input: command.input, candidate }));
      return Promise.resolve({ accepted: true });
    }
    return Promise.resolve({ accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' });
  }

  public reconcileAbandoned(
    input: ReceiptCommandReconciliationInputV1,
  ): Promise<ReceiptCommandReconciliationResultV1> {
    const now = input.now ?? this.clock();
    for (const [key, command] of this.commands) {
      if (
        command.kind !== 'RESERVED' ||
        command.reservationId !== input.reservationId ||
        command.ownerToken !== input.ownerToken ||
        command.leaseExpiresAt.getTime() > now.getTime()
      ) {
        continue;
      }
      this.commands.set(
        key,
        Object.freeze({
          kind: 'FAILED',
          reservationId: command.reservationId,
          ownerToken: command.ownerToken,
          input: command.input,
        }),
      );
      return Promise.resolve({ accepted: true, value: { state: 'FAILED' } });
    }
    return Promise.resolve({ accepted: false, code: 'COMMAND_CONFLICT' });
  }

  public release(reservationId: string, ownerToken: string): Promise<void> {
    for (const [key, command] of this.commands) {
      if (
        command.kind !== 'RESERVED' ||
        command.reservationId !== reservationId ||
        command.ownerToken !== ownerToken
      ) {
        continue;
      }
      this.commands.set(
        key,
        Object.freeze({
          kind: 'FAILED',
          reservationId: command.reservationId,
          ownerToken: command.ownerToken,
          input: command.input,
        }),
      );
      break;
    }
    return Promise.resolve();
  }

  public findCandidate(
    input: ReceiptCandidateLookupInputV1,
  ): Promise<ReceiptCandidateView | undefined> {
    const candidate = this.candidates.get(input.candidateId);
    if (
      !candidate ||
      candidate.artifactVersionId !== input.artifactVersionId ||
      !tenantScopesEqualV1(candidate.tenantScope, input.tenantScope)
    ) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(candidate);
  }
}

import { randomUUID } from 'node:crypto';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  DdaAudComposePortV1,
  DdaDsmPortV1,
  DdaIaePortV1,
} from '../../application/foundation-ports.js';
import type { EtlDsmPortV1 } from '../../etl/application/etl-foundation-ports.js';
import {
  ReceiptValidationService,
  type ReceiptValidationInput,
} from './receipt-validation.service.js';

export type ReceiptAcceptanceErrorCode =
  | 'EXPECTED_REVISION_CONFLICT'
  | 'LOW_CONFIDENCE_REVIEW'
  | 'TOTAL_MISMATCH'
  | 'REQUIRED_FIELD_MISSING'
  | 'INVALID_DATETIME'
  | 'UNSUPPORTED_CURRENCY'
  | 'NEGATIVE_OR_ZERO_AMOUNT'
  | 'LINE_ITEM_MISMATCH'
  | 'CONFLICTING_CANDIDATES'
  | 'DSM_FAILURE'
  | 'IAE_FAILURE';

export interface ReceiptGovernedRecordPort {
  appendGovernedRecord(input: {
    readonly tenantScope: TenantScopeV1;
    readonly candidateId: string;
    readonly artifactVersionId: string;
    readonly datasetVersionId: string;
    readonly record: ReceiptValidationInput;
  }): Promise<{ readonly datasetVersionId: string }>;
}

export type ReceiptAcceptanceResult =
  | {
      readonly accepted: true;
      readonly value: {
        readonly datasetVersionId: string;
        readonly candidateId: string;
        readonly replayed?: boolean;
      };
    }
  | { readonly accepted: false; readonly code: ReceiptAcceptanceErrorCode };

/** DDA-042: validate then append governed record; no DatasetVersion before acceptance. */
export class ReceiptAcceptanceService {
  private readonly byIdempotency = new Map<string, ReceiptAcceptanceResult>();
  private readonly acceptedCandidates = new Set<string>();

  public constructor(
    private readonly validation: ReceiptValidationService,
    private readonly dsm: DdaDsmPortV1,
    private readonly iae: DdaIaePortV1,
    private readonly aud: DdaAudComposePortV1,
    private readonly records: ReceiptGovernedRecordPort,
    private readonly datasetRegistrar?: EtlDsmPortV1,
  ) {}

  public hasDatasetVersion(candidateId: string): boolean {
    return this.acceptedCandidates.has(candidateId);
  }

  public async accept(input: {
    readonly tenantScope: TenantScopeV1;
    readonly candidateId: string;
    readonly artifactVersionId: string;
    readonly artifactContentHash: string;
    readonly expectedRevision: number;
    readonly currentRevision?: number;
    readonly correlationId: string;
    readonly idempotencyKey?: string;
    readonly record: ReceiptValidationInput;
  }): Promise<ReceiptAcceptanceResult> {
    if (input.idempotencyKey) {
      const prior = this.byIdempotency.get(input.idempotencyKey);
      if (prior?.accepted) {
        return Object.freeze({
          accepted: true,
          value: Object.freeze({ ...prior.value, replayed: true as const }),
        });
      }
    }
    if (input.currentRevision !== undefined && input.currentRevision !== input.expectedRevision) {
      return Object.freeze({ accepted: false, code: 'EXPECTED_REVISION_CONFLICT' as const });
    }

    const validated = this.validation.validate(input.record);
    if (!validated.accepted) {
      return Object.freeze({ accepted: false, code: validated.code });
    }

    try {
      await this.iae.requireArtifactVersion({
        id: input.artifactVersionId,
        tenantScope: input.tenantScope,
      });
    } catch {
      return Object.freeze({ accepted: false, code: 'IAE_FAILURE' as const });
    }

    let datasetVersionId: string;
    if (this.datasetRegistrar !== undefined) {
      const registered = await this.datasetRegistrar.registerDatasetVersion({
        tenantScope: input.tenantScope,
        artifactVersionId: input.artifactVersionId,
        schemaHash: 'receipt-schema-v1',
        contentHash: input.artifactContentHash,
        lineageParentIds: [input.artifactVersionId],
      });
      if (!registered.accepted) return Object.freeze({ accepted: false, code: 'DSM_FAILURE' as const });
      datasetVersionId = registered.datasetVersionId;
    } else {
      datasetVersionId = randomUUID();
      try {
        await this.dsm.requireDatasetVersion({
          id: datasetVersionId,
          tenantScope: input.tenantScope,
        });
      } catch {
        return Object.freeze({ accepted: false, code: 'DSM_FAILURE' as const });
      }
    }

    const appended = await this.records.appendGovernedRecord({
      tenantScope: input.tenantScope,
      candidateId: input.candidateId,
      artifactVersionId: input.artifactVersionId,
      datasetVersionId,
      record: input.record,
    });
    this.acceptedCandidates.add(input.candidateId);
    await this.aud.emitContentSafeSummary({
      tenantScope: input.tenantScope,
      action: 'RECEIPT_ACCEPTANCE',
      outcome: 'SUCCEEDED',
      correlationId: input.correlationId,
      references: [input.candidateId, appended.datasetVersionId, input.artifactVersionId],
    });
    const result: ReceiptAcceptanceResult = Object.freeze({
      accepted: true,
      value: Object.freeze({
        datasetVersionId: appended.datasetVersionId,
        candidateId: input.candidateId,
      }),
    });
    if (input.idempotencyKey) this.byIdempotency.set(input.idempotencyKey, result);
    return result;
  }
}

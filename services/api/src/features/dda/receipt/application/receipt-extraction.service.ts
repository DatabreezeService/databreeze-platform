import { createHash, randomUUID } from 'node:crypto';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { DdaAudComposePortV1, DdaIaePortV1 } from '../../application/foundation-ports.js';
import type {
  ReceiptOcrEvidenceCoordinates,
  ReceiptOcrField,
  ReceiptOcrPort,
} from './receipt-ocr.port.js';

export type ReceiptExtractionErrorCode =
  | 'WRONG_SCOPE_ARTIFACT'
  | 'NON_RECEIPT_PROFILE'
  | 'MALFORMED_COORDINATES'
  | 'MISSING_ADAPTER_VERSION'
  | 'OCR_PROVIDER_FAILED'
  | 'CANDIDATE_NOT_FOUND'
  | 'INVALID_CORRECTION';

export interface ReceiptFieldCandidateView {
  readonly field: string;
  readonly value: string;
  readonly confidence: number;
  readonly evidenceCoordinates?: {
    readonly page: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface ReceiptCandidateView {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly tenantScope: TenantScopeV1;
  readonly artifactVersionId: string;
  readonly profileVersionId: string;
  readonly fieldCandidates: readonly ReceiptFieldCandidateView[];
  readonly adapterVersion: string;
  readonly modelVersion: string;
  readonly evidenceReferenceId: string;
  readonly candidateHash: string;
  readonly treatedAsUntrustedData: true;
  readonly priorCandidateId?: string;
  readonly replayed?: boolean;
}

export type ReceiptExtractionResult =
  | { readonly accepted: true; readonly value: ReceiptCandidateView }
  | { readonly accepted: false; readonly code: ReceiptExtractionErrorCode };

function workspaceIdOf(scope: TenantScopeV1): string | undefined {
  return scope.scopeType === 'organization' ? undefined : scope.workspaceId;
}

export class ReceiptExtractionService {
  private readonly byIdempotency = new Map<string, ReceiptCandidateView>();
  private readonly byCandidateId = new Map<string, ReceiptCandidateView>();

  public constructor(
    private readonly ocr: ReceiptOcrPort,
    private readonly iae: DdaIaePortV1,
    private readonly aud: DdaAudComposePortV1,
  ) {}

  public getCandidate(candidateId: string): ReceiptCandidateView | undefined {
    return this.byCandidateId.get(candidateId);
  }

  public async extract(input: {
    readonly tenantScope: TenantScopeV1;
    readonly artifactVersionId: string;
    readonly profileVersionId: string;
    readonly profileKind: string;
    readonly correlationId: string;
    readonly idempotencyKey?: string;
    readonly maxAttempts?: number;
  }): Promise<ReceiptExtractionResult> {
    if (input.profileKind !== 'receipt') {
      return Object.freeze({ accepted: false, code: 'NON_RECEIPT_PROFILE' as const });
    }
    if (input.idempotencyKey) {
      const prior = this.byIdempotency.get(input.idempotencyKey);
      if (prior) {
        return Object.freeze({
          accepted: true,
          value: Object.freeze({ ...prior, replayed: true as const }),
        });
      }
    }
    try {
      await this.iae.requireArtifactVersion({
        id: input.artifactVersionId,
        tenantScope: input.tenantScope,
      });
    } catch {
      return Object.freeze({ accepted: false, code: 'WRONG_SCOPE_ARTIFACT' as const });
    }

    const maxAttempts = input.maxAttempts ?? 1;
    let lastError: unknown;
    let ocrResult: Awaited<ReturnType<ReceiptOcrPort['extract']>> | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        ocrResult = await this.ocr.extract({
          artifactVersionId: input.artifactVersionId,
          profileVersionId: input.profileVersionId,
          tenantWorkspaceId: workspaceIdOf(input.tenantScope) ?? '',
        });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        const code = (error as { code?: string } | undefined)?.code;
        if (code !== 'OCR_TIMEOUT' || attempt === maxAttempts) break;
      }
    }
    if (!ocrResult) {
      void lastError;
      return Object.freeze({ accepted: false, code: 'OCR_PROVIDER_FAILED' as const });
    }
    if (!ocrResult.adapterVersion || !ocrResult.modelVersion) {
      return Object.freeze({ accepted: false, code: 'MISSING_ADAPTER_VERSION' as const });
    }
    for (const field of ocrResult.fields) {
      if (!coordinatesValid(field)) {
        return Object.freeze({ accepted: false, code: 'MALFORMED_COORDINATES' as const });
      }
    }

    const candidate = this.persistCandidate({
      tenantScope: input.tenantScope,
      artifactVersionId: input.artifactVersionId,
      profileVersionId: input.profileVersionId,
      adapterVersion: ocrResult.adapterVersion,
      modelVersion: ocrResult.modelVersion,
      fields: ocrResult.fields,
    });
    if (input.idempotencyKey) this.byIdempotency.set(input.idempotencyKey, candidate);
    await this.aud.emitContentSafeSummary({
      tenantScope: input.tenantScope,
      action: 'RECEIPT_EXTRACTION',
      outcome: 'SUCCEEDED',
      correlationId: input.correlationId,
      references: [candidate.candidateId, input.artifactVersionId],
    });
    return Object.freeze({ accepted: true, value: candidate });
  }

  public async correct(input: {
    readonly tenantScope: TenantScopeV1;
    readonly priorCandidateId: string;
    readonly correlationId: string;
    readonly fieldUpdates: Readonly<Record<string, string>>;
  }): Promise<ReceiptExtractionResult> {
    const prior = this.byCandidateId.get(input.priorCandidateId);
    if (!prior || workspaceIdOf(prior.tenantScope) !== workspaceIdOf(input.tenantScope)) {
      return Object.freeze({ accepted: false, code: 'CANDIDATE_NOT_FOUND' as const });
    }
    if (Object.keys(input.fieldUpdates).length === 0) {
      return Object.freeze({ accepted: false, code: 'INVALID_CORRECTION' as const });
    }
    const fields: ReceiptFieldCandidateView[] = prior.fieldCandidates.map((field) => {
      const updated = input.fieldUpdates[field.field];
      if (updated === undefined) return field;
      const next: ReceiptFieldCandidateView = {
        field: field.field,
        value: updated,
        confidence: 100,
        ...(field.evidenceCoordinates ? { evidenceCoordinates: field.evidenceCoordinates } : {}),
      };
      return Object.freeze(next);
    });
    const candidate = this.persistCandidate({
      tenantScope: prior.tenantScope,
      artifactVersionId: prior.artifactVersionId,
      profileVersionId: prior.profileVersionId,
      adapterVersion: prior.adapterVersion,
      modelVersion: prior.modelVersion,
      fields,
      priorCandidateId: prior.candidateId,
      evidenceReferenceId: prior.evidenceReferenceId,
    });
    await this.aud.emitContentSafeSummary({
      tenantScope: input.tenantScope,
      action: 'RECEIPT_CORRECTION',
      outcome: 'SUCCEEDED',
      correlationId: input.correlationId,
      references: [candidate.candidateId, prior.candidateId],
    });
    return Object.freeze({ accepted: true, value: candidate });
  }

  private persistCandidate(input: {
    readonly tenantScope: TenantScopeV1;
    readonly artifactVersionId: string;
    readonly profileVersionId: string;
    readonly adapterVersion: string;
    readonly modelVersion: string;
    readonly fields: readonly ReceiptOcrField[] | readonly ReceiptFieldCandidateView[];
    readonly priorCandidateId?: string;
    readonly evidenceReferenceId?: string;
  }): ReceiptCandidateView {
    const fieldCandidates = Object.freeze(
      input.fields.map((field) => {
        const coordinates = 'evidenceCoordinates' in field ? field.evidenceCoordinates : undefined;
        const view: ReceiptFieldCandidateView = {
          field: field.field,
          value: field.value,
          confidence: field.confidence,
          ...(coordinates ? { evidenceCoordinates: coordinates } : {}),
        };
        return Object.freeze(view);
      }),
    );
    const candidateId = randomUUID();
    const evidenceReferenceId = input.evidenceReferenceId ?? randomUUID();
    const candidateHash = createHash('sha256')
      .update(
        JSON.stringify({
          artifactVersionId: input.artifactVersionId,
          profileVersionId: input.profileVersionId,
          adapterVersion: input.adapterVersion,
          modelVersion: input.modelVersion,
          fieldCandidates,
          priorCandidateId: input.priorCandidateId ?? null,
        }),
      )
      .digest('hex');
    const candidate: ReceiptCandidateView = {
      schemaVersion: 1,
      candidateId,
      tenantScope: input.tenantScope,
      artifactVersionId: input.artifactVersionId,
      profileVersionId: input.profileVersionId,
      fieldCandidates,
      adapterVersion: input.adapterVersion,
      modelVersion: input.modelVersion,
      evidenceReferenceId,
      candidateHash,
      treatedAsUntrustedData: true,
      ...(input.priorCandidateId ? { priorCandidateId: input.priorCandidateId } : {}),
    };
    const frozen = Object.freeze(candidate);
    this.byCandidateId.set(candidateId, frozen);
    return frozen;
  }
}

function coordinatesValid(field: ReceiptOcrField): boolean {
  const c: ReceiptOcrEvidenceCoordinates = field.evidenceCoordinates;
  return (
    Number.isInteger(c.page) &&
    c.page >= 1 &&
    c.x >= 0 &&
    c.y >= 0 &&
    c.width > 0 &&
    c.height > 0 &&
    c.x + c.width <= 1.0000001 &&
    c.y + c.height <= 1.0000001
  );
}

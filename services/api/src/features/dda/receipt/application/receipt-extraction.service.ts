import { createHash, randomUUID } from 'node:crypto';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { OpenAiProviderError } from '../../ai/adapter/openai-provider.error.js';
import type {
  DdaAudComposePortV1,
  DdaBuaPortV1,
  DdaIaePortV1,
} from '../../application/foundation-ports.js';
import type { ReceiptAiPolicyPort } from './receipt-ai-policy.port.js';
import type {
  ReceiptOcrEvidenceCoordinates,
  ReceiptOcrField,
  ReceiptOcrPort,
} from './receipt-ocr.port.js';

export type ReceiptExtractionErrorCode =
  | 'WRONG_SCOPE_ARTIFACT'
  | 'NON_RECEIPT_PROFILE'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'HASH_MISMATCH'
  | 'PAYLOAD_OVERSIZE'
  | 'AI_EGRESS_DENIED'
  | 'PURPOSE_DENIED'
  | 'EVIDENCE_TRANSFER_DENIED'
  | 'DISCLOSURE_MISSING'
  | 'ADMISSION_DENIED'
  | 'TENANT_REVOKED'
  | 'MALFORMED_COORDINATES'
  | 'MISSING_ADAPTER_VERSION'
  | 'OCR_PROVIDER_FAILED'
  | 'CANDIDATE_NOT_FOUND'
  | 'INVALID_CORRECTION'
  | 'PROCESSING_CONTENT_UNAVAILABLE';

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

const RETRYABLE_PROVIDER_CODES = new Set([
  'OPENAI_TIMEOUT',
  'OPENAI_RATE_LIMIT',
  'OPENAI_TRANSIENT',
]);

const RECEIPT_MEDIA_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp'] as const);
const DEFAULT_MAX_PAYLOAD_BYTES = 3_000_000;
const DEFAULT_PREPROCESSING_VERSION = 'receipt-image-passthrough-v1';
const DEFAULT_COORDINATE_SPACE = 'normalized-unit-square-v1';

function workspaceIdOf(scope: TenantScopeV1): string | undefined {
  return scope.scopeType === 'organization' ? undefined : scope.workspaceId;
}

function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof OpenAiProviderError) {
    return RETRYABLE_PROVIDER_CODES.has(error.code);
  }
  const code = (error as { code?: string } | undefined)?.code;
  return typeof code === 'string' && RETRYABLE_PROVIDER_CODES.has(code);
}

function mapProcessingContentError(
  code: string,
): ReceiptExtractionErrorCode {
  switch (code) {
    case 'PROCESSING_CONTENT_SCOPE_DENIED':
      return 'WRONG_SCOPE_ARTIFACT';
    case 'PROCESSING_CONTENT_UNSUPPORTED_MEDIA_TYPE':
      return 'UNSUPPORTED_CONTENT_TYPE';
    case 'PROCESSING_CONTENT_HASH_MISMATCH':
      return 'HASH_MISMATCH';
    case 'PROCESSING_CONTENT_OVERSIZE':
      return 'PAYLOAD_OVERSIZE';
    case 'PROCESSING_CONTENT_NOT_FOUND':
      return 'WRONG_SCOPE_ARTIFACT';
    default:
      return 'PROCESSING_CONTENT_UNAVAILABLE';
  }
}

function mapPolicyError(code: string): ReceiptExtractionErrorCode {
  switch (code) {
    case 'PURPOSE_DENIED':
      return 'PURPOSE_DENIED';
    case 'EVIDENCE_TRANSFER_DENIED':
      return 'EVIDENCE_TRANSFER_DENIED';
    case 'DISCLOSURE_MISSING':
      return 'DISCLOSURE_MISSING';
    case 'TENANT_REVOKED':
      return 'TENANT_REVOKED';
    default:
      return 'AI_EGRESS_DENIED';
  }
}

export class ReceiptExtractionService {
  private readonly byIdempotency = new Map<string, ReceiptCandidateView>();
  private readonly byCandidateId = new Map<string, ReceiptCandidateView>();

  public constructor(
    private readonly ocr: ReceiptOcrPort,
    private readonly iae: DdaIaePortV1,
    private readonly aud: DdaAudComposePortV1,
    private readonly policy: ReceiptAiPolicyPort,
    private readonly bua: DdaBuaPortV1,
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
    readonly expectedContentSha256?: string;
  }): Promise<ReceiptExtractionResult> {
    if (input.profileKind !== 'receipt') {
      await this.emitOutcome(input, 'DENIED', [input.artifactVersionId]);
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
      await this.emitOutcome(input, 'DENIED', [input.artifactVersionId]);
      return Object.freeze({ accepted: false, code: 'WRONG_SCOPE_ARTIFACT' as const });
    }

    const requiresCloudEgress = this.ocr.requiresCloudEgress === true;
    const content = await this.iae.openProcessingContent({
      tenantScope: input.tenantScope,
      artifactVersionId: input.artifactVersionId,
      ...(input.expectedContentSha256 !== undefined
        ? { expectedContentSha256: input.expectedContentSha256 }
        : {}),
      maximumByteLength: DEFAULT_MAX_PAYLOAD_BYTES,
      allowedMediaTypes: RECEIPT_MEDIA_TYPES,
    });
    if (!content.accepted) {
      const code = mapProcessingContentError(content.code);
      await this.emitOutcome(input, 'DENIED', [input.artifactVersionId]);
      return Object.freeze({ accepted: false, code });
    }

    const policyDecision = await this.policy.resolveReceiptExtractionPolicy({
      tenantScope: input.tenantScope,
      payloadBytes: content.value.byteLength,
      requiresCloudEgress,
    });
    if (!policyDecision.accepted) {
      const code = mapPolicyError(policyDecision.code);
      await this.emitOutcome(input, 'DENIED', [input.artifactVersionId]);
      return Object.freeze({ accepted: false, code });
    }
    if (requiresCloudEgress && !policyDecision.value.cloudEgressAllowed) {
      await this.emitOutcome(input, 'DENIED', [input.artifactVersionId]);
      return Object.freeze({ accepted: false, code: 'AI_EGRESS_DENIED' as const });
    }
    if (
      requiresCloudEgress &&
      content.value.byteLength > policyDecision.value.policy.maximumPayloadBytes
    ) {
      await this.emitOutcome(input, 'DENIED', [input.artifactVersionId]);
      return Object.freeze({ accepted: false, code: 'PAYLOAD_OVERSIZE' as const });
    }

    const reference = {
      id: input.artifactVersionId,
      tenantScope: input.tenantScope,
    };
    let reservationId: string | undefined;
    try {
      const reservation = await this.bua.reserveCapacity({
        reference,
        usageClass: 'RECEIPT_OCR',
        requestUnits: 1,
        imageBytes: content.value.byteLength,
        textTokensEstimate: 0,
        retryBudget: input.maxAttempts ?? 1,
        costUnitsEstimate: 1,
      });
      reservationId = reservation.reservationId;
    } catch {
      await this.emitOutcome(input, 'DENIED', [input.artifactVersionId]);
      return Object.freeze({ accepted: false, code: 'ADMISSION_DENIED' as const });
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
          contentSha256: content.value.contentSha256,
          mediaType: content.value.mediaType,
          imageBytes: content.value.bytes,
          preprocessingVersion: DEFAULT_PREPROCESSING_VERSION,
          coordinateSpace: DEFAULT_COORDINATE_SPACE,
        });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (!isRetryableProviderError(error) || attempt === maxAttempts) break;
      }
    }

    if (!ocrResult) {
      void lastError;
      if (reservationId) {
        await this.bua.finalizeReservation({
          reservationId,
          reference,
          outcome: 'FAILED',
        });
      }
      await this.emitOutcome(input, 'FAILED', [input.artifactVersionId]);
      return Object.freeze({ accepted: false, code: 'OCR_PROVIDER_FAILED' as const });
    }
    if (!ocrResult.adapterVersion || !ocrResult.modelVersion) {
      if (reservationId) {
        await this.bua.finalizeReservation({
          reservationId,
          reference,
          outcome: 'FAILED',
        });
      }
      await this.emitOutcome(input, 'FAILED', [input.artifactVersionId]);
      return Object.freeze({ accepted: false, code: 'MISSING_ADAPTER_VERSION' as const });
    }
    for (const field of ocrResult.fields) {
      if (!coordinatesValid(field)) {
        if (reservationId) {
          await this.bua.finalizeReservation({
            reservationId,
            reference,
            outcome: 'FAILED',
          });
        }
        await this.emitOutcome(input, 'REVIEW_REQUIRED', [input.artifactVersionId]);
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
    if (reservationId) {
      await this.bua.finalizeReservation({
        reservationId,
        reference,
        outcome: 'SUCCEEDED',
      });
    }
    await this.emitOutcome(input, 'SUCCEEDED', [candidate.candidateId, input.artifactVersionId]);
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

  private async emitOutcome(
    input: {
      readonly tenantScope: TenantScopeV1;
      readonly correlationId: string;
      readonly artifactVersionId: string;
    },
    outcome: string,
    references: readonly string[],
  ): Promise<void> {
    await this.aud.emitContentSafeSummary({
      tenantScope: input.tenantScope,
      action: 'RECEIPT_EXTRACTION',
      outcome,
      correlationId: input.correlationId,
      references: [...references],
    });
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

import { createHash, randomUUID } from 'node:crypto';

import { tenantScopesEqualV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { OpenAiProviderError } from '../../ai/adapter/openai-provider.error.js';
import type {
  DdaAudComposePortV1,
  DdaBuaPortV1,
  DdaIaePortV1,
} from '../../application/foundation-ports.js';
import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { ReceiptAiPolicyPort } from './receipt-ai-policy.port.js';
import {
  UnavailableReceiptExtractionCommandRepositoryAdapter,
  type ReceiptExtractionCommandRepositoryPortV1,
} from './receipt-extraction-command.port.js';
import {
  UnavailableReceiptMutationAuthorizationAdapter,
  type ReceiptMutationAuthorizationPortV1,
} from './receipt-mutation-authorization.port.js';
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
  | 'PROCESSING_CONTENT_UNAVAILABLE'
  | 'AUTHORIZATION_DENIED'
  | 'AUTHORIZATION_UNAVAILABLE'
  | 'COMMAND_CONFLICT'
  | 'COMMAND_REPOSITORY_UNAVAILABLE';

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

function mapProcessingContentError(code: string): ReceiptExtractionErrorCode {
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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function payloadFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function commandKey(idempotencyKey: string | undefined, correlationId: string): string {
  return idempotencyKey ?? `correlation:${correlationId}`;
}

export class ReceiptExtractionService {
  private readonly commands: ReceiptExtractionCommandRepositoryPortV1;
  private readonly authorization: ReceiptMutationAuthorizationPortV1;

  public constructor(
    private readonly ocr: ReceiptOcrPort,
    private readonly iae: DdaIaePortV1,
    private readonly aud: DdaAudComposePortV1,
    private readonly policy: ReceiptAiPolicyPort,
    private readonly bua: DdaBuaPortV1,
    dependencies?: {
      readonly commands?: ReceiptExtractionCommandRepositoryPortV1;
      readonly authorization?: ReceiptMutationAuthorizationPortV1;
    },
  ) {
    this.commands =
      dependencies?.commands ?? new UnavailableReceiptExtractionCommandRepositoryAdapter();
    this.authorization =
      dependencies?.authorization ?? new UnavailableReceiptMutationAuthorizationAdapter();
  }

  public async extract(input: {
    readonly tenantScope: TenantScopeV1;
    readonly context?: IamTenantContextV1;
    readonly artifactVersionId: string;
    readonly profileVersionId: string;
    readonly profileKind: string;
    readonly correlationId: string;
    readonly idempotencyKey?: string;
    readonly maxAttempts?: number;
    readonly expectedContentSha256?: string;
  }): Promise<ReceiptExtractionResult> {
    if (!input.context || !tenantScopesEqualV1(input.context.tenantScope, input.tenantScope)) {
      return Object.freeze({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' as const });
    }
    const authorization = await this.authorization.authorize({
      context: input.context,
      action: 'RECEIPT_EXTRACT',
      artifactVersionId: input.artifactVersionId,
    });
    if (!authorization.accepted) {
      return Object.freeze({
        accepted: false,
        code:
          authorization.code === 'FORBIDDEN'
            ? ('AUTHORIZATION_DENIED' as const)
            : ('AUTHORIZATION_UNAVAILABLE' as const),
      });
    }
    const tenantScope = input.context.tenantScope;
    if (input.profileKind !== 'receipt') {
      await this.emitOutcome(input, 'DENIED', [input.artifactVersionId]);
      return Object.freeze({ accepted: false, code: 'NON_RECEIPT_PROFILE' as const });
    }

    try {
      await this.iae.requireArtifactVersion({
        id: input.artifactVersionId,
        tenantScope,
      });
    } catch {
      await this.emitOutcome(input, 'DENIED', [input.artifactVersionId]);
      return Object.freeze({ accepted: false, code: 'WRONG_SCOPE_ARTIFACT' as const });
    }

    const commandReservation = await this.commands.reserve({
      tenantScope,
      operation: 'EXTRACT',
      commandKey: commandKey(input.idempotencyKey, input.correlationId),
      artifactVersionId: input.artifactVersionId,
      sourceId: input.profileVersionId,
      payloadFingerprint: payloadFingerprint({
        artifactVersionId: input.artifactVersionId,
        profileVersionId: input.profileVersionId,
        profileKind: input.profileKind,
        expectedContentSha256: input.expectedContentSha256 ?? null,
        maxAttempts: input.maxAttempts ?? 1,
      }),
    });
    if (!commandReservation.accepted) {
      return Object.freeze({
        accepted: false,
        code:
          commandReservation.code === 'COMMAND_CONFLICT'
            ? ('COMMAND_CONFLICT' as const)
            : ('COMMAND_REPOSITORY_UNAVAILABLE' as const),
      });
    }
    if (commandReservation.value.kind === 'REPLAY') {
      return Object.freeze({
        accepted: true,
        value: Object.freeze({ ...commandReservation.value.candidate, replayed: true as const }),
      });
    }
    const commandReservationId = commandReservation.value.reservationId;
    const commandOwnerToken = commandReservation.value.ownerToken;
    const rejectAfterReservation = async (
      code: ReceiptExtractionErrorCode,
      outcome: string = 'DENIED',
    ): Promise<ReceiptExtractionResult> => {
      await this.commands.release(commandReservationId, commandOwnerToken);
      await this.emitOutcome(input, outcome, [input.artifactVersionId]);
      return Object.freeze({ accepted: false, code });
    };

    const requiresCloudEgress = this.ocr.requiresCloudEgress === true;
    const content = await this.iae.openProcessingContent({
      tenantScope,
      artifactVersionId: input.artifactVersionId,
      ...(input.expectedContentSha256 !== undefined
        ? { expectedContentSha256: input.expectedContentSha256 }
        : {}),
      maximumByteLength: DEFAULT_MAX_PAYLOAD_BYTES,
      allowedMediaTypes: RECEIPT_MEDIA_TYPES,
    });
    if (!content.accepted) {
      const code = mapProcessingContentError(content.code);
      return rejectAfterReservation(code);
    }

    const policyDecision = await this.policy.resolveReceiptExtractionPolicy({
      tenantScope,
      payloadBytes: content.value.byteLength,
      requiresCloudEgress,
    });
    if (!policyDecision.accepted) {
      const code = mapPolicyError(policyDecision.code);
      return rejectAfterReservation(code);
    }
    if (requiresCloudEgress && !policyDecision.value.cloudEgressAllowed) {
      return rejectAfterReservation('AI_EGRESS_DENIED');
    }
    if (
      requiresCloudEgress &&
      content.value.byteLength > policyDecision.value.policy.maximumPayloadBytes
    ) {
      return rejectAfterReservation('PAYLOAD_OVERSIZE');
    }

    const reference = {
      id: input.artifactVersionId,
      tenantScope,
    };
    let buaReservationId: string | undefined;
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
      buaReservationId = reservation.reservationId;
    } catch {
      return rejectAfterReservation('ADMISSION_DENIED');
    }

    const maxAttempts = input.maxAttempts ?? 1;
    let lastError: unknown;
    let ocrResult: Awaited<ReturnType<ReceiptOcrPort['extract']>> | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        ocrResult = await this.ocr.extract({
          artifactVersionId: input.artifactVersionId,
          profileVersionId: input.profileVersionId,
          tenantWorkspaceId: workspaceIdOf(tenantScope) ?? '',
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
      if (buaReservationId) {
        await this.bua.finalizeReservation({
          reservationId: buaReservationId,
          reference,
          outcome: 'FAILED',
        });
      }
      return rejectAfterReservation('OCR_PROVIDER_FAILED', 'FAILED');
    }
    if (!ocrResult.adapterVersion || !ocrResult.modelVersion) {
      if (buaReservationId) {
        await this.bua.finalizeReservation({
          reservationId: buaReservationId,
          reference,
          outcome: 'FAILED',
        });
      }
      return rejectAfterReservation('MISSING_ADAPTER_VERSION', 'FAILED');
    }
    for (const field of ocrResult.fields) {
      if (!coordinatesValid(field)) {
        if (buaReservationId) {
          await this.bua.finalizeReservation({
            reservationId: buaReservationId,
            reference,
            outcome: 'FAILED',
          });
        }
        return rejectAfterReservation('MALFORMED_COORDINATES', 'REVIEW_REQUIRED');
      }
    }

    const candidate = this.persistCandidate({
      tenantScope,
      artifactVersionId: input.artifactVersionId,
      profileVersionId: input.profileVersionId,
      adapterVersion: ocrResult.adapterVersion,
      modelVersion: ocrResult.modelVersion,
      fields: ocrResult.fields,
    });
    if (buaReservationId) {
      await this.bua.finalizeReservation({
        reservationId: buaReservationId,
        reference,
        outcome: 'SUCCEEDED',
      });
    }
    await this.emitOutcome(input, 'SUCCEEDED', [candidate.candidateId, input.artifactVersionId]);
    const completed = await this.commands.complete(
      commandReservationId,
      candidate,
      commandReservation.value.ownerToken,
    );
    if (!completed.accepted) {
      return Object.freeze({ accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' as const });
    }
    return Object.freeze({ accepted: true, value: candidate });
  }

  public async correct(input: {
    readonly tenantScope: TenantScopeV1;
    readonly context?: IamTenantContextV1;
    readonly priorCandidateId: string;
    readonly artifactVersionId: string;
    readonly correlationId: string;
    readonly fieldUpdates: Readonly<Record<string, string>>;
    readonly idempotencyKey?: string;
  }): Promise<ReceiptExtractionResult> {
    if (!input.context || !tenantScopesEqualV1(input.context.tenantScope, input.tenantScope)) {
      return Object.freeze({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' as const });
    }
    const authorization = await this.authorization.authorize({
      context: input.context,
      action: 'RECEIPT_CORRECT',
      artifactVersionId: input.artifactVersionId,
      candidateId: input.priorCandidateId,
    });
    if (!authorization.accepted) {
      return Object.freeze({
        accepted: false,
        code:
          authorization.code === 'FORBIDDEN'
            ? ('AUTHORIZATION_DENIED' as const)
            : ('AUTHORIZATION_UNAVAILABLE' as const),
      });
    }
    const tenantScope = input.context.tenantScope;
    try {
      await this.iae.requireArtifactVersion({
        id: input.artifactVersionId,
        tenantScope,
      });
    } catch {
      return Object.freeze({ accepted: false, code: 'CANDIDATE_NOT_FOUND' as const });
    }
    let prior: ReceiptCandidateView | undefined;
    try {
      prior = await this.commands.findCandidate({
        tenantScope,
        candidateId: input.priorCandidateId,
        artifactVersionId: input.artifactVersionId,
      });
    } catch {
      return Object.freeze({ accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' as const });
    }
    if (
      !prior ||
      prior.candidateId !== input.priorCandidateId ||
      prior.artifactVersionId !== input.artifactVersionId ||
      !tenantScopesEqualV1(prior.tenantScope, input.tenantScope)
    ) {
      return Object.freeze({ accepted: false, code: 'CANDIDATE_NOT_FOUND' as const });
    }
    if (Object.keys(input.fieldUpdates).length === 0) {
      return Object.freeze({ accepted: false, code: 'INVALID_CORRECTION' as const });
    }

    const commandReservation = await this.commands.reserve({
      tenantScope,
      operation: 'CORRECT',
      commandKey: commandKey(input.idempotencyKey, input.correlationId),
      artifactVersionId: input.artifactVersionId,
      sourceId: input.priorCandidateId,
      payloadFingerprint: payloadFingerprint({
        artifactVersionId: input.artifactVersionId,
        priorCandidateId: input.priorCandidateId,
        fieldUpdates: input.fieldUpdates,
      }),
    });
    if (!commandReservation.accepted) {
      return Object.freeze({
        accepted: false,
        code:
          commandReservation.code === 'COMMAND_CONFLICT'
            ? ('COMMAND_CONFLICT' as const)
            : ('COMMAND_REPOSITORY_UNAVAILABLE' as const),
      });
    }
    if (commandReservation.value.kind === 'REPLAY') {
      return Object.freeze({
        accepted: true,
        value: Object.freeze({ ...commandReservation.value.candidate, replayed: true as const }),
      });
    }
    const reservationId = commandReservation.value.reservationId;
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
      tenantScope,
      artifactVersionId: prior.artifactVersionId,
      profileVersionId: prior.profileVersionId,
      adapterVersion: prior.adapterVersion,
      modelVersion: prior.modelVersion,
      fields,
      priorCandidateId: prior.candidateId,
      evidenceReferenceId: prior.evidenceReferenceId,
    });
    await this.aud.emitContentSafeSummary({
      tenantScope,
      action: 'RECEIPT_CORRECTION',
      outcome: 'SUCCEEDED',
      correlationId: input.correlationId,
      references: [candidate.candidateId, prior.candidateId],
    });
    const completed = await this.commands.complete(
      reservationId,
      candidate,
      commandReservation.value.ownerToken,
    );
    if (!completed.accepted) {
      return Object.freeze({ accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' as const });
    }
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

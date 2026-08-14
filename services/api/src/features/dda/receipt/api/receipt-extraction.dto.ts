export interface ReceiptExtractionRequestDto {
  readonly artifactVersionId: string;
  readonly profileVersionId: string;
  readonly profileKind: string;
  readonly correlationId: string;
  readonly idempotencyKey?: string;
}

export interface ReceiptCorrectionRequestDto {
  readonly priorCandidateId: string;
  readonly artifactVersionId: string;
  readonly correlationId: string;
  readonly fieldUpdates: Readonly<Record<string, string>>;
  readonly idempotencyKey?: string;
}

export interface ReceiptCandidateReadQueryDto {
  readonly artifactVersionId: string;
}

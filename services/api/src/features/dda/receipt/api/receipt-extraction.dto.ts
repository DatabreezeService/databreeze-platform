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

/** Native receipt intake keeps the mobile client on the authenticated IAE boundary. */
export interface ReceiptIntakeRequestDto {
  readonly fileName: string;
  readonly mediaType: string;
  readonly expectedSha256: string;
  /** Base64 is bounded by the controller before it is decoded. */
  readonly contentBase64: string;
  readonly idempotencyKey: string;
}

export interface ReceiptAcceptanceRequestDto {
  readonly candidateId: string;
  readonly artifactVersionId: string;
  readonly artifactContentHash: string;
  readonly expectedRevision: number;
  readonly correlationId: string;
  readonly idempotencyKey?: string;
  readonly record: Record<string, unknown>;
}

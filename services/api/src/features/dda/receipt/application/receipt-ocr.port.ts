/** Provider-neutral OCR port. Production AWS adapters need a separate accepted ADR. */
export interface ReceiptOcrEvidenceCoordinates {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ReceiptOcrField {
  readonly field: string;
  readonly value: string;
  readonly confidence: number;
  readonly evidenceCoordinates: ReceiptOcrEvidenceCoordinates;
}

export interface ReceiptOcrResult {
  readonly adapterVersion: string;
  readonly modelVersion: string;
  readonly fields: readonly ReceiptOcrField[];
  readonly promptVersion?: string;
  readonly schemaVersion?: string;
  readonly preprocessingVersion?: string;
}

export interface ReceiptOcrRequest {
  readonly artifactVersionId: string;
  readonly profileVersionId: string;
  readonly tenantWorkspaceId: string;
  readonly contentSha256: string;
  readonly mediaType: string;
  readonly imageBytes: Uint8Array;
  readonly preprocessingVersion: string;
  readonly coordinateSpace: string;
}

export interface ReceiptOcrPort {
  /** Cloud OpenAI adapters must set this so application services enforce egress policy. */
  readonly requiresCloudEgress?: boolean;
  extract(request: ReceiptOcrRequest): Promise<ReceiptOcrResult>;
}

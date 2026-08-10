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
}

export interface ReceiptOcrRequest {
  readonly artifactVersionId: string;
  readonly profileVersionId: string;
  readonly tenantWorkspaceId: string;
}

export interface ReceiptOcrPort {
  extract(request: ReceiptOcrRequest): Promise<ReceiptOcrResult>;
}

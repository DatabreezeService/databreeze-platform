export interface ReceiptExtractionRequestDto {
  readonly tenantScope: {
    readonly scopeType: 'organization' | 'workspace' | 'project';
    readonly organizationId: string;
    readonly workspaceId?: string;
    readonly projectId?: string;
  };
  readonly artifactVersionId: string;
  readonly profileVersionId: string;
  readonly profileKind: string;
  readonly correlationId: string;
  readonly idempotencyKey?: string;
}

export interface ReceiptCorrectionRequestDto {
  readonly tenantScope: ReceiptExtractionRequestDto['tenantScope'];
  readonly priorCandidateId: string;
  readonly correlationId: string;
  readonly fieldUpdates: Readonly<Record<string, string>>;
}

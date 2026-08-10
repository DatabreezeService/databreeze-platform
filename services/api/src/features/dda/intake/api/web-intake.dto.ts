export interface WebIntakeFinalizeDtoV1 {
  readonly tenantScope: unknown;
  readonly sessionId: string;
  readonly fileName: string;
  readonly claimedMediaType: string;
  readonly expectedSha256: string;
  readonly contentBase64: string;
  readonly declaredEncoding?: string;
}

export interface WebIntakeFinalizeResponseDtoV1 {
  readonly accepted: true;
  readonly sessionId: string;
  readonly artifactVersionId: string;
  readonly status: 'FINALIZED';
  readonly profileId: 'dda.web.tabular.v1';
}

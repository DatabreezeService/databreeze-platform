export interface WebIntakeFinalizeResponseV1 {
  readonly accepted: true;
  readonly sessionId: string;
  readonly artifactVersionId: string;
  readonly status: 'FINALIZED';
  readonly profileId: 'dda.web.tabular.v1';
}

export interface WebIntakeApiV1 {
  finalize(input: {
    readonly sessionId: string;
    readonly fileName: string;
    readonly claimedMediaType: string;
    readonly expectedSha256: string;
    readonly contentBase64: string;
    readonly tenantScope: unknown;
  }): Promise<WebIntakeFinalizeResponseV1>;
}

export function createWebIntakeApi(baseUrl = '/v1/dda/web-intake'): WebIntakeApiV1 {
  return {
    async finalize(input) {
      const response = await fetch(`${baseUrl}/finalize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error('INTAKE_UNAVAILABLE');
      }
      return (await response.json()) as WebIntakeFinalizeResponseV1;
    },
  };
}

import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

export interface WebIntakeFinalizeResponseV1 {
  readonly accepted: true;
  readonly sessionId: string;
  readonly artifactVersionId: string;
  readonly status: 'FINALIZED';
  readonly profileId: 'dda.web.tabular.v1';
}

export interface WebIntakeUploadResponseV1 {
  readonly accepted: true;
  readonly sessionId: string;
  readonly artifactVersionId: string;
  readonly status: 'PENDING_REVIEW';
  readonly profileId: 'dda.web.tabular.v1';
  readonly replayed: boolean;
}

export interface WebIntakeApiV1 {
  upload?(input: {
    readonly fileName: string;
    readonly claimedMediaType: string;
    readonly expectedSha256: string;
    readonly contentBase64: string;
    readonly idempotencyKey: string;
  }): Promise<WebIntakeUploadResponseV1>;
  finalize(input: {
    readonly sessionId: string;
    readonly fileName: string;
    readonly claimedMediaType: string;
    readonly expectedSha256: string;
    readonly contentBase64: string;
  }): Promise<WebIntakeFinalizeResponseV1>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFinalizeResponse(value: unknown): value is WebIntakeFinalizeResponseV1 {
  return (
    isRecord(value) &&
    value['accepted'] === true &&
    typeof value['sessionId'] === 'string' &&
    typeof value['artifactVersionId'] === 'string' &&
    value['status'] === 'FINALIZED' &&
    value['profileId'] === 'dda.web.tabular.v1'
  );
}

function isUploadResponse(value: unknown): value is WebIntakeUploadResponseV1 {
  return (
    isRecord(value) &&
    value['accepted'] === true &&
    typeof value['sessionId'] === 'string' &&
    typeof value['artifactVersionId'] === 'string' &&
    value['status'] === 'PENDING_REVIEW' &&
    value['profileId'] === 'dda.web.tabular.v1' &&
    typeof value['replayed'] === 'boolean'
  );
}

export function createWebIntakeApi(baseUrl = '/v1/dda/web-intake'): WebIntakeApiV1 {
  const fetcher = createSessionAwareFetchV1({
    apiBaseUrl: baseUrl,
    fetcher: globalThis.fetch.bind(globalThis),
  });
  return {
    async upload(input) {
      const response = await fetcher(`${baseUrl}/upload`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      if (response.status === 401) throw new Error('INTAKE_UNAUTHORIZED');
      if (response.status === 403) throw new Error('INTAKE_FORBIDDEN');
      if (response.status === 400) throw new Error('INTAKE_INVALID');
      if (response.status === 409) throw new Error('INTAKE_CONFLICT');
      if (!response.ok) throw new Error('INTAKE_UNAVAILABLE');
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error('INTAKE_RESPONSE_INVALID');
      }
      if (!isUploadResponse(payload)) throw new Error('INTAKE_RESPONSE_INVALID');
      return Object.freeze({ ...payload });
    },
    async finalize(input) {
      const response = await fetcher(`${baseUrl}/finalize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        // WEB-021: tenant and actor authority come from the authenticated server context.
        body: JSON.stringify({
          sessionId: input.sessionId,
          fileName: input.fileName,
          claimedMediaType: input.claimedMediaType,
          expectedSha256: input.expectedSha256,
          contentBase64: input.contentBase64,
        }),
      });
      if (response.status === 401 || response.status === 403) {
        throw new Error('INTAKE_UNAUTHORIZED');
      }
      if (response.status === 400) throw new Error('INTAKE_INVALID');
      if (response.status === 409) throw new Error('INTAKE_CONFLICT');
      if (!response.ok) {
        throw new Error('INTAKE_UNAVAILABLE');
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error('INTAKE_RESPONSE_INVALID');
      }
      if (!isFinalizeResponse(payload)) throw new Error('INTAKE_RESPONSE_INVALID');
      return Object.freeze({ ...payload });
    },
  };
}

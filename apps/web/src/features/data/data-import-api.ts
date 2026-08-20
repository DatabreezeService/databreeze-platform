import { dataApiBaseConfiguration } from './data-api-config.ts';
import { parseV4Contract, type DdaDataImportDashboardPreview } from '@databreeze/contracts/v4';
import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

/** Keep the client response boundary aligned with the server's 100 MiB import limit. */
export const MAX_DATA_IMPORT_FILE_BYTES = 100 * 1024 * 1024;
/** Keep the live drawer aligned with the server-owned data-import endpoint. */
export const MAX_SERVER_TABULAR_FILE_BYTES = MAX_DATA_IMPORT_FILE_BYTES;

/** Divisible by three so independently encoded chunks concatenate to canonical base64. */
const BASE64_CHUNK_BYTES = 24 * 1024;
const UTF8_VALIDATION_CHUNK_BYTES = 64 * 1024;

export type DataImportDeclaredEncodingV1 = 'utf-8' | 'utf-8-sig' | 'windows-1258';

export type DataImportDestinationV1 =
  | { readonly kind: 'NEW_DATASET' }
  | { readonly kind: 'EXISTING_DATASET'; readonly datasetId: string };

export interface DataImportSourceV1 {
  readonly sessionId: string;
  readonly artifactVersionId: string;
  readonly fileName: string;
  readonly mediaType: string;
  readonly contentSha256: string;
  readonly byteSize: number;
  readonly rowCount: number;
  readonly fields: readonly {
    readonly fieldId: string;
    readonly name: string;
    readonly type: 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE';
    readonly nullable: boolean;
  }[];
  readonly sampleRows: readonly Readonly<Record<string, string | number | boolean | null>>[];
}

export interface DataImportReviewV1 {
  readonly beforeSample: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly afterSample: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly counts: Readonly<{
    readonly input: number;
    readonly output: number;
    readonly changed: number;
    readonly rejected: number;
  }>;
  readonly quality: Readonly<
    Record<'completeness' | 'validity' | 'uniqueness' | 'consistency', number>
  >;
  readonly warnings: readonly string[];
  readonly corrections: readonly {
    readonly correctionId: string;
    readonly message: string;
    readonly fieldName?: string;
    readonly createdAt: string;
  }[];
  readonly reviewRequired: true;
}

export interface DataImportAcceptedV1 {
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly definitionVersionId: string;
  readonly dashboardStatus: 'BUILDING' | 'UNAVAILABLE';
  readonly approvalIdempotencyKey?: string;
  readonly approvedAt: string;
}

export interface DataImportRecordV1 {
  readonly importId: string;
  readonly revision: number;
  readonly state: 'REVIEW_REQUIRED' | 'REVISING' | 'APPROVED' | 'PROCESSING' | 'READY' | 'FAILED';
  readonly destination: 'NEW_DATASET' | 'EXISTING_DATASET';
  readonly datasetId?: string;
  readonly datasetName: string;
  readonly idempotencyKey: string;
  readonly sources: readonly DataImportSourceV1[];
  readonly review: DataImportReviewV1;
  readonly accepted?: DataImportAcceptedV1;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DataImportMappingSuggestionV1 {
  readonly label: string;
  readonly summary: string;
  readonly sourceField: string;
  readonly targetField: string;
  readonly transformKind: string;
  readonly alternatives: readonly string[];
  readonly rationale: string;
  readonly uncertainty: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly authoritative: false;
}

export interface DataImportMappingSuggestionsV1 {
  readonly importId: string;
  readonly revision: number;
  readonly suggestions: readonly DataImportMappingSuggestionV1[];
  readonly adapterUsed: boolean;
  readonly authoritative: false;
  readonly generatedAt: string;
}

export class DataImportApiError extends Error {
  override readonly cause: 'network' | 'server';
  readonly status: number;
  readonly code: string;

  public constructor(
    status: number,
    code = 'DATA_IMPORT_UNAVAILABLE',
    cause: 'network' | 'server' = 'server',
  ) {
    super(code);
    this.name = 'DataImportApiError';
    this.status = status;
    this.code = code;
    this.cause = cause;
  }
}

export interface CreateDataImportInputV1 {
  readonly destination: DataImportDestinationV1;
  readonly datasetName: string;
  readonly idempotencyKey: string;
  readonly files: readonly {
    readonly fileName: string;
    readonly claimedMediaType: string;
    readonly declaredEncoding?: DataImportDeclaredEncodingV1;
    readonly contentBase64: string;
  }[];
}

const DASHBOARD_PREVIEW_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/dda-data-import-dashboard-preview' as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    !/\p{Cc}/u.test(value)
  );
}

function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  );
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function parseSource(value: unknown): DataImportSourceV1 {
  if (
    !isRecord(value) ||
    !identifier(value['sessionId']) ||
    !identifier(value['artifactVersionId']) ||
    !safeText(value['fileName'], 255) ||
    !safeText(value['mediaType'], 160) ||
    !/^[0-9a-f]{64}$/u.test(String(value['contentSha256'])) ||
    typeof value['byteSize'] !== 'number' ||
    !Number.isSafeInteger(value['byteSize']) ||
    value['byteSize'] < 1 ||
    value['byteSize'] > MAX_DATA_IMPORT_FILE_BYTES ||
    typeof value['rowCount'] !== 'number' ||
    !Number.isSafeInteger(value['rowCount']) ||
    value['rowCount'] < 0 ||
    !Array.isArray(value['fields']) ||
    !Array.isArray(value['sampleRows'])
  )
    throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
  const fields = value['fields'].map((field): DataImportSourceV1['fields'][number] => {
    if (
      !isRecord(field) ||
      !identifier(field['fieldId']) ||
      !safeText(field['name'], 128) ||
      !['TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE'].includes(String(field['type'])) ||
      typeof field['nullable'] !== 'boolean'
    )
      throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
    return Object.freeze({
      fieldId: field['fieldId'],
      name: field['name'],
      type: field['type'] as DataImportSourceV1['fields'][number]['type'],
      nullable: field['nullable'],
    });
  });
  return Object.freeze({
    sessionId: value['sessionId'],
    artifactVersionId: value['artifactVersionId'],
    fileName: value['fileName'],
    mediaType: value['mediaType'],
    contentSha256: String(value['contentSha256']),
    byteSize: value['byteSize'],
    rowCount: value['rowCount'],
    fields: Object.freeze(fields),
    sampleRows: Object.freeze(value['sampleRows'] as DataImportSourceV1['sampleRows']),
  });
}

function parseRecord(value: unknown): DataImportRecordV1 {
  if (
    !isRecord(value) ||
    !identifier(value['importId']) ||
    typeof value['revision'] !== 'number' ||
    !Number.isSafeInteger(value['revision']) ||
    !['REVIEW_REQUIRED', 'REVISING', 'APPROVED', 'PROCESSING', 'READY', 'FAILED'].includes(
      String(value['state']),
    ) ||
    !['NEW_DATASET', 'EXISTING_DATASET'].includes(String(value['destination'])) ||
    !safeText(value['datasetName'], 200) ||
    !safeText(value['idempotencyKey'], 200) ||
    !Array.isArray(value['sources']) ||
    !isRecord(value['review']) ||
    !timestamp(value['createdAt']) ||
    !timestamp(value['updatedAt'])
  )
    throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
  const review = value['review'];
  if (
    review['reviewRequired'] !== true ||
    !Array.isArray(review['beforeSample']) ||
    !Array.isArray(review['afterSample']) ||
    !Array.isArray(review['warnings']) ||
    !Array.isArray(review['corrections']) ||
    !isRecord(review['counts']) ||
    !isRecord(review['quality'])
  )
    throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
  const accepted = value['accepted'];
  const parsedAccepted =
    accepted === undefined
      ? undefined
      : (() => {
          if (
            !isRecord(accepted) ||
            !identifier(accepted['datasetId']) ||
            !identifier(accepted['datasetVersionId']) ||
            !identifier(accepted['definitionVersionId']) ||
            !['BUILDING', 'UNAVAILABLE'].includes(String(accepted['dashboardStatus'])) ||
            (accepted['approvalIdempotencyKey'] !== undefined &&
              !safeText(accepted['approvalIdempotencyKey'], 200)) ||
            !timestamp(accepted['approvedAt'])
          )
            throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
          return Object.freeze({
            datasetId: accepted['datasetId'],
            datasetVersionId: accepted['datasetVersionId'],
            definitionVersionId: accepted['definitionVersionId'],
            dashboardStatus: accepted['dashboardStatus'] as DataImportAcceptedV1['dashboardStatus'],
            ...(accepted['approvalIdempotencyKey'] === undefined
              ? {}
              : { approvalIdempotencyKey: accepted['approvalIdempotencyKey'] }),
            approvedAt: accepted['approvedAt'],
          });
        })();
  return Object.freeze({
    importId: value['importId'],
    revision: value['revision'],
    state: value['state'] as DataImportRecordV1['state'],
    destination: value['destination'] as DataImportRecordV1['destination'],
    ...(typeof value['datasetId'] === 'string' ? { datasetId: value['datasetId'] } : {}),
    datasetName: value['datasetName'],
    idempotencyKey: value['idempotencyKey'],
    sources: Object.freeze(value['sources'].map(parseSource)),
    review: Object.freeze({
      ...review,
      counts: Object.freeze(review['counts']),
      quality: Object.freeze(review['quality']),
      warnings: Object.freeze(review['warnings'] as string[]),
      corrections: Object.freeze(review['corrections']),
    }) as DataImportReviewV1,
    ...(parsedAccepted === undefined ? {} : { accepted: parsedAccepted }),
    createdAt: value['createdAt'],
    updatedAt: value['updatedAt'],
  });
}

function parseMappingSuggestions(value: unknown): DataImportMappingSuggestionsV1 {
  if (
    !isRecord(value) ||
    !identifier(value['importId']) ||
    typeof value['revision'] !== 'number' ||
    !Number.isSafeInteger(value['revision']) ||
    value['revision'] < 1 ||
    !Array.isArray(value['suggestions']) ||
    typeof value['adapterUsed'] !== 'boolean' ||
    value['authoritative'] !== false ||
    !timestamp(value['generatedAt']) ||
    value['suggestions'].length > 20
  )
    throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
  const suggestions = value['suggestions'].map((candidate): DataImportMappingSuggestionV1 => {
    if (
      !isRecord(candidate) ||
      !safeText(candidate['label'], 128) ||
      !safeText(candidate['summary'], 512) ||
      !safeText(candidate['sourceField'], 128) ||
      !safeText(candidate['targetField'], 128) ||
      !safeText(candidate['transformKind'], 64) ||
      !Array.isArray(candidate['alternatives']) ||
      candidate['alternatives'].length > 5 ||
      !candidate['alternatives'].every((item) => safeText(item, 128)) ||
      !safeText(candidate['rationale'], 512) ||
      !['LOW', 'MEDIUM', 'HIGH'].includes(String(candidate['uncertainty'])) ||
      candidate['authoritative'] !== false
    )
      throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
    return Object.freeze({
      label: candidate['label'],
      summary: candidate['summary'],
      sourceField: candidate['sourceField'],
      targetField: candidate['targetField'],
      transformKind: candidate['transformKind'],
      alternatives: Object.freeze(
        candidate['alternatives'].map((item) => {
          if (!safeText(item, 128)) throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
          return item;
        }),
      ),
      rationale: candidate['rationale'],
      uncertainty: candidate['uncertainty'] as DataImportMappingSuggestionV1['uncertainty'],
      authoritative: false as const,
    });
  });
  return Object.freeze({
    importId: value['importId'],
    revision: value['revision'],
    suggestions: Object.freeze(suggestions),
    adapterUsed: value['adapterUsed'],
    authoritative: false as const,
    generatedAt: value['generatedAt'],
  });
}

function parseEnvelope(value: unknown): {
  readonly value: DataImportRecordV1;
  readonly replayed: boolean;
} {
  if (!isRecord(value) || value['accepted'] !== true || !isRecord(value['value']))
    throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
  return Object.freeze({
    value: parseRecord(value['value']),
    replayed: value['replayed'] === true,
  });
}

async function request(
  path: string,
  init: RequestInit,
  baseUrl = dataApiBaseConfiguration().baseUrl,
): Promise<unknown> {
  const fetcher = createSessionAwareFetchV1({
    apiBaseUrl: baseUrl,
    fetcher: globalThis.fetch.bind(globalThis),
  });
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new DataImportApiError(503, 'DATA_IMPORT_UNAVAILABLE', 'network');
  }
  if (!response.ok) {
    let code: string | undefined;
    try {
      const body: unknown = await response.json();
      if (
        isRecord(body) &&
        typeof body['code'] === 'string' &&
        /^[A-Z][A-Z0-9_.-]{2,95}$/u.test(body['code'])
      ) {
        code = body['code'];
      }
    } catch {
      // Preserve the bounded generic error when the server has no JSON body.
    }
    throw new DataImportApiError(response.status, code);
  }
  try {
    return await response.json();
  } catch {
    throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
  }
}

/**
 * Server-authoritative data-import client (DDA-053/WEB-021). Offline/demo
 * behavior lives in `import-session.ts`, never here: a failed call throws.
 */
export const dataImportApi = Object.freeze({
  async list(
    limit = 50,
    baseUrl = dataApiBaseConfiguration().baseUrl,
  ): Promise<readonly DataImportRecordV1[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new DataImportApiError(400, 'DATA_IMPORT_INVALID');
    }
    const envelope = await request(
      `/v1/dda/data-imports?limit=${encodeURIComponent(String(limit))}`,
      { method: 'GET' },
      baseUrl,
    );
    if (!isRecord(envelope) || envelope['accepted'] !== true || !isRecord(envelope['value'])) {
      throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
    }
    const value = envelope['value'];
    if (!Array.isArray(value['imports']) || value['imports'].length > limit) {
      throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
    }
    return Object.freeze(value['imports'].map(parseRecord));
  },
  async create(
    input: CreateDataImportInputV1,
  ): Promise<{ readonly value: DataImportRecordV1; readonly replayed: boolean }> {
    return parseEnvelope(
      await request('/v1/dda/data-imports', {
        method: 'POST',
        headers: { 'Idempotency-Key': input.idempotencyKey },
        body: JSON.stringify(input),
      }),
    );
  },
  async get(importId: string): Promise<DataImportRecordV1> {
    const envelope = await request(`/v1/dda/data-imports/${encodeURIComponent(importId)}`, {
      method: 'GET',
    });
    if (!isRecord(envelope) || envelope['accepted'] !== true || !isRecord(envelope['value']))
      throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
    return parseRecord(envelope['value']);
  },
  async correction(
    importId: string,
    expectedRevision: number,
    message: string,
    fieldName?: string,
  ): Promise<DataImportRecordV1> {
    const commandIdempotencyKey = `correction:${importId}:${expectedRevision}`;
    const value = await request(
      `/v1/dda/data-imports/${encodeURIComponent(importId)}/corrections`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': commandIdempotencyKey },
        body: JSON.stringify({
          expectedRevision,
          message,
          ...(fieldName === undefined ? {} : { fieldName }),
        }),
      },
    );
    if (!isRecord(value) || value['accepted'] !== true || !isRecord(value['value']))
      throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
    return parseRecord(value['value']);
  },
  async approve(
    importId: string,
    expectedRevision: number,
  ): Promise<{ readonly value: DataImportRecordV1; readonly replayed: boolean }> {
    const commandIdempotencyKey = `approve:${importId}:${expectedRevision}`;
    return parseEnvelope(
      await request(`/v1/dda/data-imports/${encodeURIComponent(importId)}/approve`, {
        method: 'POST',
        headers: { 'Idempotency-Key': commandIdempotencyKey },
        body: JSON.stringify({
          expectedRevision,
          idempotencyKey: commandIdempotencyKey,
        }),
      }),
    );
  },
  async dashboardPreview(
    importId: string,
    baseUrl = dataApiBaseConfiguration().baseUrl,
  ): Promise<DdaDataImportDashboardPreview['value']> {
    if (!identifier(importId)) throw new DataImportApiError(400, 'DATA_IMPORT_INVALID');
    const raw = await request(
      `/v1/dda/data-imports/${encodeURIComponent(importId)}/dashboard-preview`,
      { method: 'GET' },
      baseUrl,
    );
    const parsed = parseV4Contract<DdaDataImportDashboardPreview>(DASHBOARD_PREVIEW_SCHEMA, raw);
    if (!parsed.accepted) throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
    return parsed.value.value;
  },
  async mappingSuggestions(
    importId: string,
    samplePermissionGranted: boolean,
    locale: 'vi' | 'en' = 'vi',
  ): Promise<DataImportMappingSuggestionsV1> {
    if (!identifier(importId) || typeof samplePermissionGranted !== 'boolean') {
      throw new DataImportApiError(400, 'DATA_IMPORT_INVALID');
    }
    const envelope = await request(
      `/v1/dda/data-imports/${encodeURIComponent(importId)}/mapping-suggestions`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': `mapping:${importId}` },
        body: JSON.stringify({ samplePermissionGranted, locale }),
      },
    );
    if (!isRecord(envelope) || envelope['accepted'] !== true || !isRecord(envelope['value'])) {
      throw new DataImportApiError(502, 'DATA_IMPORT_INVALID');
    }
    return parseMappingSuggestions(envelope['value']);
  },
});

export async function filesToDataImportFiles(
  files: readonly {
    readonly name: string;
    readonly type: string;
    readonly arrayBuffer: () => Promise<ArrayBuffer>;
  }[],
) {
  const result: CreateDataImportInputV1['files'][number][] = [];
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const byteView = new Uint8Array(bytes);
    const byteLength = byteView.byteLength;
    const isXlsx =
      file.name.toLowerCase().endsWith('.xlsx') ||
      file.type.toLowerCase().includes('spreadsheetml.sheet');
    let declaredEncoding: DataImportDeclaredEncodingV1 | undefined;
    if (!isXlsx) {
      let validUtf8 = true;
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        for (let offset = 0; offset < byteLength; offset += UTF8_VALIDATION_CHUNK_BYTES) {
          decoder.decode(
            byteView.subarray(offset, Math.min(offset + UTF8_VALIDATION_CHUNK_BYTES, byteLength)),
            { stream: true },
          );
        }
        decoder.decode();
      } catch {
        validUtf8 = false;
      }
      declaredEncoding = validUtf8
        ? byteLength >= 3 && byteView[0] === 0xef && byteView[1] === 0xbb && byteView[2] === 0xbf
          ? 'utf-8-sig'
          : 'utf-8'
        : 'windows-1258';
    }
    const encodedChunks: string[] = [];
    for (let offset = 0; offset < byteLength; offset += BASE64_CHUNK_BYTES) {
      const chunk = byteView.subarray(offset, Math.min(offset + BASE64_CHUNK_BYTES, byteLength));
      encodedChunks.push(btoa(String.fromCharCode(...chunk)));
    }
    result.push(
      Object.freeze({
        fileName: file.name,
        claimedMediaType:
          file.type ||
          (isXlsx
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv'),
        ...(declaredEncoding === undefined ? {} : { declaredEncoding }),
        contentBase64: encodedChunks.join(''),
      }),
    );
  }
  return Object.freeze(result);
}
